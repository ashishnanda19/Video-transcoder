# GPU transcoding migration (ECS on EC2, scale-to-zero)

VidFlow transcodes on an NVIDIA T4 (`g4dn.xlarge`): NVDEC decode → CUDA scale → NVENC encode, frames never leave GPU memory.
Fargate has no GPUs, so GPU jobs run on ECS **on EC2** with an Auto Scaling Group that sits at **0 instances while idle**.
The original Fargate/CPU path is untouched and one env var away.

```
S3 upload ─► Lambda ─► Express server (Render)                       ┌─ TRANSCODE_MODE=cpu ─► Fargate (as before)
                          │ enqueue in Redis (QUEUED)                │
                          │ dispatcher: slot free? ── RunTask ───────┤
                          ▼ (STARTING)                               └─ TRANSCODE_MODE=gpu ─► capacity provider ─► ASG 0→1
                     Mongo status                                                               g4dn.xlarge, 1 task = 1 GPU
   webhook: processing / completed / failed ◄──────────────────────── container (ffmpeg NVDEC→scale_cuda→NVENC, CPU fallback)
```

Note: the Lambda only forwards the S3 event; **`RunTask` lives in the Express server** (`server/src/utils/ecsTranscodingTrigger.js`), so that is what changed, not the Lambda.

## What changed

| Area | Files |
|---|---|
| GPU image (CUDA runtime, ffmpeg built with nvenc/nvdec/cuda-nvcc/libnpp/libx264/libvmaf), startup self-check | `ecs-task/Dockerfile.gpu`, `ecs-task/scripts/` |
| CPU image (unchanged, rollback target) | `ecs-task/Dockerfile` |
| ffmpeg command builder, GPU probe, CPU fallback, ladder/env config | `ecs-task/utils/{ffmpegCommand,transcode,gpuProbe,probe,transcodeConfig}.js` |
| Benchmark + VMAF/SSIM | `ecs-task/benchmark/` |
| Terraform for the **whole AWS stack** in one account: S3 buckets (CORS, lifecycle), upload-trigger Lambda + S3 notification, server IAM user, GPU cluster / ASG (min 0) / capacity provider / task def, Fargate CPU cluster + task def, ECR ×2, IAM, SGs, alarms | `infra/` |
| `RunTask` via capacity provider, `failures` handling, statuses | `server/src/utils/{ecsTranscodingTrigger,runTaskInput}.js` |
| Limiter / dispatcher (atomic Redis slots) | `server/src/jobs/`, `server/src/db/redis.js` |

Job states: `pending → queued → starting → processing → completed | failed`.
`starting` = `RunTask` accepted (on GPU the ECS task may sit in `PROVISIONING` while the ASG scales 0→1);
`processing` = the container is running and has reported in. The frontend only reads `completed`, so it needs no change.

## Before the first launch: Service Quotas

New AWS accounts often have a quota of **0** for *Running On-Demand G and VT instances*. With 0, the ASG can never launch an instance,
the task stays `PROVISIONING`, and the job sits in `starting` forever. `g4dn.xlarge` uses 4 vCPUs, so the quota must be ≥ 4 × `asg_max_size` (8 for the default of 2).

```bash
aws service-quotas list-service-quotas --service-code ec2 --region ap-south-1 \
  --query "Quotas[?contains(QuotaName,'G and VT')].[QuotaName,QuotaCode,Value]" --output table
# Request an increase (the code is L-DB2E81BA at the time of writing; confirm with the command above)
aws service-quotas request-service-quota-increase --service-code ec2 \
  --quota-code L-DB2E81BA --desired-value 8 --region ap-south-1
```

Approval can take hours to days. Also confirm `g4dn.xlarge` is offered in your AZs:
`aws ec2 describe-instance-type-offerings --location-type availability-zone --filters Name=instance-type,Values=g4dn.xlarge --region ap-south-1`.

## Deploy (everything in one AWS account)

`infra/` creates the complete AWS side, so the account you are logged into is the only one involved: both S3 buckets, the S3 → Lambda trigger,
the server's IAM user, the GPU stack and the Fargate CPU rollback stack. Only MongoDB, Redis, the Express server (Render) and the frontend (Vercel) live outside AWS.

Prereqs: AWS CLI on the right account (`aws sts get-caller-identity`), Terraform ≥ 1.5, Node/npm (the Lambda bundle is built during apply), Docker with buildx.

```bash
# 1. Infrastructure. Set lambda_api_endpoint to <your Render URL>/api/v1/video/s3-trigger
cd infra
cp terraform.tfvars.example terraform.tfvars      # edit: lambda_api_endpoint, alarm_email, cors_allowed_origins
terraform init -upgrade                            # new providers were added (archive)
terraform plan                                     # read it
terraform apply

# 2. Build + push the GPU image (linux/amd64 even on Apple Silicon; the ffmpeg compile is slow under emulation)
ACCT=$(aws sts get-caller-identity --query Account --output text); REG=$ACCT.dkr.ecr.ap-south-1.amazonaws.com
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $REG
cd ../ecs-task
docker buildx build --platform linux/amd64 -f Dockerfile.gpu -t "$(terraform -chdir=../infra output -raw ecr_repository_url):gpu" --push .

# 3. Build + push the CPU image (the Fargate rollback target)
docker buildx build --platform linux/amd64 -f Dockerfile -t "$(terraform -chdir=../infra output -raw cpu_ecr_repository_url):cpu" --push .

# 4. Credentials for the server (Render). The secret is shown once and never enters Terraform state.
aws iam create-access-key --user-name "$(terraform -chdir=../infra output -raw server_iam_user)"
#    -> set MY_AWS_ACCESS_KEY_ID / MY_AWS_SECRET_ACCESS_KEY on Render

# 5. Smoke-test the GPU path without a real job (also measures cold start; see below). Runs only the self-check and exits.
cd ../infra
aws ecs run-task --region ap-south-1 --cluster "$(terraform output -raw cluster_name)" \
  --task-definition "$(terraform output -raw task_definition_family)" \
  --capacity-provider-strategy capacityProvider="$(terraform output -raw capacity_provider_name)",weight=1 \
  --overrides '{"containerOverrides":[{"name":"video-transcoder","command":["true"]}]}'
# then read the self-check in CloudWatch Logs group $(terraform output -raw log_group): look for "RESULT: GPU OK"

# 6. Render env vars: print them all with
terraform output server_env
#    (plus MY_AWS_ACCESS_KEY_ID / MY_AWS_SECRET_ACCESS_KEY from step 4, and your existing MONGO_URI, REDIS_URL, WEBHOOK_URL, ...)
```

Start with `TRANSCODE_MODE=cpu` on Render if you want to validate the upload → Lambda → Fargate → webhook chain first, then switch to `gpu`.
The `lambda_api_endpoint` must be reachable from AWS; the Lambda times out after 60s to survive a sleeping Render instance.
If you change only the Lambda source, `terraform apply` rebuilds the bundle (hash-triggered). If `.build/` was deleted, run `terraform apply -replace=terraform_data.lambda_build`.

The new Mongo status `starting` needs no migration (Mongoose enum only). The old `upload-trigger-api` Serverless deploy and the loose `*.json` policy files are superseded by Terraform.
The Next.js `api/upload` and `api/videos` routes in the client sign with their own `AWS_ACCESS_KEY_ID`; the app's server-side signing path (`/get-upload-url`) is what Terraform's IAM policy covers. If you still use those routes, give them the same user's key.

## Tear down

```bash
# Make sure nothing is running, so the destroy doesn't kill a job mid-flight
aws ecs list-tasks --cluster vidflow-gpu --region ap-south-1
# Stop routing to it first: set TRANSCODE_MODE=cpu on the server (see rollback), then:
cd infra && terraform destroy
# Verify nothing is left billing:
aws ec2 describe-instances --region ap-south-1 --filters Name=instance-state-name,Values=running,pending \
  Name=tag:Project,Values=vidflow --query 'Reservations[].Instances[].InstanceId'
```

`terraform destroy` removes everything it created: the ASG (`force_delete`), clusters, Lambda, ECR repos (with images), roles, the IAM user, alarms and the **temp bucket**. The **final bucket is kept safe**: destroy fails if it still holds transcoded videos unless you set `final_bucket_force_destroy = true` (or empty it first). Access keys you created with the CLI must be deleted first (`aws iam delete-access-key`) or the user cannot be removed. MongoDB, Redis, Render and Vercel are not touched.
If the capacity provider refuses to delete ("in use"), set the ASG desired capacity to 0 and retry.
A billing alarm in us-east-1 and the SNS topics are removed too; the email subscription confirmations will simply stop.

## Scale-to-zero: how it behaves

- ASG `MinSize=0`; capacity provider with managed scaling (target capacity 100) and managed termination protection; ASG `protect_from_scale_in`.
  An instance running a task is never terminated; an empty one is.
- **Cold start (0 → first frame), estimate: ~5–8 min.** ECS needs ~3 one-minute CloudWatch datapoints to raise its scale-out alarm, then the instance boots (~1–2 min), the agent registers, and the CUDA image (a few GB) is pulled.
  The estimate is an educated guess, not a measurement: measure yours with
  `aws ecs describe-tasks --cluster … --tasks <arn> --query 'tasks[0].[createdAt,pullStartedAt,pullStoppedAt,startedAt]'` after the smoke test and record it here: `____ min`.
  Subsequent jobs while the instance is warm start in seconds (image already cached).
- **Idle shutdown, estimate: ~15–20 min after the last task finishes.** ECS managed scaling uses a CloudWatch target-tracking policy whose scale-**in** alarm needs ~15 consecutive one-minute datapoints (AWS-managed, not tunable from Terraform); then the instance terminates in about a minute.
  Check the real alarms in CloudWatch (`TargetTracking-<asg>-AlarmLow-*`). If "a few minutes" matters more than the simplicity, the follow-up is a small scheduled Lambda that sets desired capacity to 0 when `RunningTasksCount == 0 and PendingTasksCount == 0` (empty instances are not protected). Not implemented.
- Cost consequence: an isolated job pays for ≈ cold start + run + idle tail (≈ 25–30 min ≈ $0.25) even if the transcode itself takes 2 minutes. Bursts amortise this: jobs arriving within the tail reuse the warm instance.
- A job whose task never starts (quota 0, no capacity in the AZ) stays `starting` and holds a limiter slot. Look at the ASG *Activity history* (`aws autoscaling describe-scaling-activities --auto-scaling-group-name <asg>`) for `VcpuLimitExceeded` / `InsufficientInstanceCapacity`.

## Concurrency (leaky bucket)

Defined in `server/src/jobs/limiterConfig.js` (the file's header comment has the full reasoning).

```
ceiling = GPU_ASG_MAX_SIZE × GPUS_PER_INSTANCE × min(JOBS_PER_GPU, VRAM bound, NVENC-session bound)
```

Defaults on `g4dn.xlarge` with `asg_max_size = 2`: **2 concurrent jobs** (ECS gives a whole GPU to one task, so 1 job per instance).
NVENC concurrency is bounded by the hardware encoder and driver session limits, not CUDA cores, and the T4's practical limit is **not assumed** here: benchmark it, then set `NVENC_SESSIONS_PER_GPU`
and, only if you remove the GPU reservation from the task definition to share a GPU, `JOBS_PER_GPU`.
`MAX_CONCURRENT_JOBS` can lower the limit but is clamped to the ceiling (with a warning at startup). In CPU mode the legacy default of 5 applies.

Queued jobs wait in Redis (never dropped): a slot is held from `RunTask` until the completion webhook, which includes the cold-start time. A failed `RunTask` puts the job back at the head of the queue and frees the slot.

| Env (server) | Default | Meaning |
|---|---|---|
| `TRANSCODE_MODE` | `cpu` | `gpu` or `cpu` – **the rollback switch** |
| `GPU_CLUSTER`, `GPU_TASK`, `GPU_CAPACITY_PROVIDER` | – | from `terraform output` |
| `GPU_ASG_MAX_SIZE` | 2 | keep equal to Terraform `asg_max_size` |
| `MAX_CONCURRENT_JOBS` | derived | lower-only override on GPU |
| `LEAK_RATE` | = max concurrent | max queued jobs released per tick / webhook |
| `LEAK_INTERVAL_MS` | 20000 | backstop poll interval |
| `JOBS_PER_GPU`, `GPU_MEMORY_PER_JOB_GIB`, `NVENC_SESSIONS_PER_GPU`, `NVENC_SESSIONS_PER_JOB` | 1, 3, unset, 4 | hardware-bound inputs |

| Env (worker; set on the server and forwarded, or in the task definition) | Default | Meaning |
|---|---|---|
| `TRANSCODE_STRATEGY` | `split` (gpu) / `separate` (cpu) | one ffmpeg decoding once vs one process per rung |
| `GPU_CODEC` | `h264` | `hevc` uses `hevc_nvenc`, tags `hvc1`, ladder × `HEVC_BITRATE_FACTOR` (0.7). Browser HEVC support is patchy. |
| `GPU_SCALER` | `scale_cuda` | or `scale_npp` (libnpp) |
| `NVENC_PRESET` / `NVENC_TUNE` / `NVENC_CQ` | `p4` / `hq` / 23 | with `-rc vbr` |
| `LADDER_KBPS` | `1080p=5000,720p=2800,480p=1400,360p=800` | target kbps; maxrate = 1.5×, bufsize = 2× |
| `AUDIO_MODE` | `auto` | `auto` copies AAC, re-encodes others to AAC 128k; or `aac` / `copy` |
| `GPU_FALLBACK_TO_CPU` | `true` | on GPU probe/run failure or unsupported input, re-run with libx264 and log why |

Each rung is the source scaled to **fit inside a 16:9 box** (1080p = 1920×1080 …), aspect ratio preserved, both sides even.
This replaces the old fixed `-s WxH`, which stretched non-16:9 input. All four rungs are still always produced (including upscales), as before.
Inputs the T4 cannot hardware-decode (AV1, 10-bit H.264, 4:2:2/4:4:4) or that carry rotation metadata go to the CPU path automatically.

## Benchmark and quality

Run inside the GPU container / on the GPU box with real footage (a 2-minute 1080p cut; `benchmark/make-sample.sh` makes a synthetic clip that is only good for smoke-testing the harness):

```bash
cd ecs-task
node benchmark/benchmark.js --input sample-1080p-2min.mp4 --repeat 3       # all four variants
node benchmark/quality.js --results benchmark/out/results.json              # VMAF/SSIM/PSNR vs the original
node benchmark/quality.js --results benchmark/out/results.json --against cpu-separate
```

It prints wall time, speedup vs `cpu-separate` (the legacy path), CPU %, GPU SM / NVENC / NVDEC %, peak VRAM and output sizes.
The GPU variants never fall back silently; a broken GPU shows as `FAILED`. Use the VRAM and NVENC numbers to set the limiter inputs above.
Record your results here:

| variant | wall (s) | speedup | CPU % | GPU sm / enc % | VRAM MiB | total MB | VMAF 1080p/720p/480p/360p |
|---|---|---|---|---|---|---|---|
| cpu-separate | | 1.00× | | – | – | | |
| cpu-split | | | | – | – | | |
| gpu-separate | | | | | | | |
| gpu-split | | | | | | | |

## End-to-end test checklist (real AWS)

Use a short 1080p mp4 first; watch the CloudWatch log group and the ASG/ECS consoles throughout.

1. [ ] **Precondition**: `aws autoscaling describe-auto-scaling-groups` shows `DesiredCapacity 0`, no running GPU instances; Redis `CURRENT_VIDEO_TRANSCODING_JOB_COUNT` is `0` (or unset), queue empty; server has `TRANSCODE_MODE=gpu` and the GPU env vars.
2. [ ] **Upload** via the frontend (presigned URL). Object appears under `uploads/videos/` in the temp bucket; the Lambda logs a 200 from the server.
3. [ ] **Queued → starting**: Mongo doc goes `pending → queued → starting`; server log shows `Transcoding job triggered successfully`; ECS task is `PROVISIONING`.
4. [ ] **Scale from 0**: ASG desired goes 0 → 1; instance registers in the cluster (`aws ecs list-container-instances`); task goes `PENDING → RUNNING`. Note the cold-start time.
5. [ ] **Self-check**: first log lines show `RESULT: GPU OK`, `h264_nvenc` listed, `nvidia-smi` shows a Tesla T4.
6. [ ] **Processing**: Mongo doc → `processing` (webhook from the container). Log shows `mode=gpu strategy=split`, `Source: …`, and `[transcode] {"mode":"gpu",…}` (not `FALLING BACK TO CPU`). `nvidia-smi dmon` (via SSM session) shows NVENC/NVDEC activity.
7. [ ] **Outputs**: four objects `videos/<name>/<name>-{360p,480p,720p,1080p}.mp4` in the final bucket; each plays, has audio, has the right aspect ratio (`ffprobe`), even dimensions.
8. [ ] **Webhook**: Mongo doc → `completed` with all four `videoResolutions`; temp-bucket source deleted; frontend preview/download works.
9. [ ] **Slot released**: Redis counter back to 0.
10. [ ] **Queueing under load**: upload 4+ videos at once with limit 2 → exactly 2 `starting`/`processing`, the rest `queued` (still in the Redis list, not dropped); each completion starts the next queued job. Counter never exceeds the limit.
11. [ ] **Scale in**: after the last task ends, the instance stays until the ASG scale-in alarm fires, then terminates; `DesiredCapacity` returns to 0 and no GPU instance is running. Record the idle time.
12. [ ] **Failure path**: upload a corrupt file → doc `failed`, webhook received, slot released, next queued job proceeds.
13. [ ] **Fallback path**: upload an AV1 (or rotated phone) video → log shows `FALLING BACK TO CPU (libx264): …reason…`, job still `completed`.
14. [ ] **Rollback**: set `TRANSCODE_MODE=cpu`, redeploy server, upload → job runs on Fargate and completes; GPU ASG stays at 0.
15. [ ] **Cost guard**: SNS alarm subscription confirmed; the "instance up N hours" alarm exists.

## Cost

- `g4dn.xlarge` on-demand ≈ **$0.53/hr** (the us-east-1 list price is $0.526; **ap-south-1 is priced differently, check the EC2 pricing page**). $100 of credits ≈ **~190 GPU-hours** at $0.53, which is why scale-to-zero matters: left running 24/7 that is ~8 days.
- Idle cost is **$0** with the ASG at 0. While an instance exists, add ~$0.005/hr for its public IPv4 and ~$0.011/hr for the 100 GB gp3 volume (gone with the instance). Same-region S3 transfer is free; downloads to users are billed as usual.
- Budget for the idle tail: ≈ 15–20 min × $0.53/hr ≈ $0.13–0.18 per isolated job (plus cold start). Never raise `asg_max_size` without raising the quota and the alarms.
- Alarms (created by Terraform when `alarm_email` is set): month-to-date `EstimatedCharges` ≥ `billing_alarm_usd` (default $50; requires *Receive Billing Alerts* in Billing preferences; metric is us-east-1 only), and "≥ 1 GPU instance in service for 3 consecutive hours", the signature of a leaked task or broken scale-in.
- Also add an AWS Budget; it covers credits-exhaustion warnings better than a CloudWatch billing metric:

```bash
aws budgets create-budget --account-id <ACCOUNT_ID> \
  --budget '{"BudgetName":"vidflow-monthly","BudgetLimit":{"Amount":"100","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":50,"ThresholdType":"PERCENTAGE"},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"you@example.com"}]}]'
```

## Isolation from other projects

VidFlow shares an AWS account with other projects (currently `aegis`: `aegis-*` IAM user/roles, `aegis-evidence-*` and `aegis-frontend-*` buckets).
Rules this repo enforces:

| | VidFlow | How it is kept separate |
|---|---|---|
| Names | every resource is `vidflow-*`, buckets `video-transcoder-*`, Lambda `video-transcoder-upload-trigger` | no shared roles, buckets, clusters, repos, SGs |
| Tags | `Project=vidflow` (provider default tags, plus the launch template for instances/volumes) | cost reports and teardown filters select only VidFlow |
| IAM | own instance / execution / task roles and the `vidflow-server` user, each limited to the two VidFlow buckets | `verify-aws.js preflight` simulates them against every other bucket in the account and requires "denied" |
| Terraform state | `infra/terraform.tfstate`, local and git-ignored | never mixed with another project's state |
| Deploy identity | **its own profile**; Terraform refuses credentials whose ARN contains `aegis` (`forbidden_identity_substrings`) unless you set `allow_shared_deploy_identity = true` | the check fails at plan time, before anything is created |

Genuinely shared, and unavoidable: the AWS account itself, its default VPC (VidFlow only reads it and adds its own security groups), and the account-wide
EC2 *G and VT* vCPU quota (raising it for VidFlow also raises it for anyone else in the account).

**The VidFlow-only deploy identity is Terraform too** (`infra/bootstrap/`, its own state). Chicken-and-egg: a user cannot create itself, so this root is applied
**once** with an admin identity; from then on everything runs as `vidflow-deploy`.

```bash
cd infra/bootstrap
terraform init && terraform apply       # admin profile, once: creates user vidflow-deploy + 4 scoped policies (no access key)
./create-profile.sh                     # mints the key straight into the local AWS CLI profile "vidflow"; never printed, never in Terraform state
export AWS_PROFILE=vidflow              # from now on: terraform in infra/, scripts/verify-aws.js, the local server, docker/ecr login
aws sts get-caller-identity             # must say user/vidflow-deploy
```

What `vidflow-deploy` can do (`infra/bootstrap/main.tf`, four policies, each under IAM's 6144-character limit):

- Only `vidflow-*` IAM roles / policies / instance profiles and the single `vidflow-server` user; only the four AWS managed policies VidFlow uses can be attached to roles (so a role can never get `AdministratorAccess`); `PassRole` only to ECS tasks, EC2 and Lambda.
- Only `vidflow-*` ECS clusters, capacity providers, ECR repos, Auto Scaling groups, log groups, alarms and SNS topics; the `video-transcoder-*` Lambda; the two VidFlow buckets; EC2 launch templates and security groups **only if tagged `Project=vidflow`**.
- **Explicit Deny** (beats every Allow) on IAM, S3, ECS, ECR, Lambda, Logs, SNS, CloudWatch and Auto Scaling resources of `protected_prefixes` (default `aegis`).
- **Explicit Deny** on changing itself: its own policies, extra keys, extra policy attachments.
- Unavoidable wildcards, because AWS offers no resource-level control for them: `ec2:Describe*`, `ecs:RegisterTaskDefinition`/`CreateCapacityProvider`, `ec2:RunInstances` (Auto Scaling validates it), `s3:ListAllMyBuckets`, `servicequotas:*` (quotas are account-wide).

`node scripts/verify-aws.js preflight` re-proves this with the IAM simulator (20 allow/deny cases, including "cannot touch aegis" and "cannot escalate").
Honest limit: IAM write access is inherently powerful. The scoping stops *accidental* cross-project changes and blocks the obvious escalations; it is not a defence against a malicious deployer (that would need a permissions boundary on every role).

If `terraform apply` in `infra/` ever fails with `AccessDenied` for a VidFlow resource, the fix is a one-line addition in `infra/bootstrap/main.tf` and re-applying the bootstrap, not switching to an admin identity.
Keep `temp_bucket_name`, `final_bucket_name` and `server_iam_user_name` identical in `infra/` and `infra/bootstrap/`.
Also pin the account with `allowed_account_ids = ["<id>"]` in `infra/terraform.tfvars` so Terraform can never run against a different one.
Do not reuse another project's access keys for the Render/local server either: the server uses the `vidflow-server` user.

**Teardown order:** `cd infra && terraform destroy` (as `vidflow`), then delete the deploy key (`aws iam delete-access-key --user-name vidflow-deploy --access-key-id <id>` as admin, and `aws configure` removal of the profile), then `cd infra/bootstrap && terraform destroy` (admin).

## Rolling back to CPU

1. On the server (Render) set `TRANSCODE_MODE=cpu` and restart. New jobs use the Fargate cluster/task Terraform created (`CLUSTER`, `TASK`, `ECS_SUBNETS`, `ECS_SECURITY_GROUP` from `terraform output server_env`; needs the CPU image pushed in step 3); the limiter returns to its default of 5 (or `MAX_CONCURRENT_JOBS`).
2. Let in-flight GPU jobs finish (the ASG then scales itself to 0), or `terraform destroy` once idle.
3. Within the GPU container, `TRANSCODE_MODE=cpu` (task-definition env) runs libx264 on the GPU box. Pointless cost-wise, but useful for A/B tests; `GPU_FALLBACK_TO_CPU=false` makes GPU problems fail loudly instead.

The CPU image is built from the same `ecs-task/` code (default mode `cpu`, aspect-correct scaling, `processing` webhook). The Fargate task gets S3 access from the shared task role, so the server no longer injects static AWS keys into containers.

## Known limits / not verified from a laptop

Everything below needs a real AWS account with GPU quota, which this change was not tested against:

- `Dockerfile.gpu` was **not built** (no Docker daemon / x86 GPU here). Ubuntu package names (`libx264-163`, `libvmaf1`, `libnpp-12-2`), FFmpeg 6.1.1 + `nv-codec-headers n12.1.14.0` (needs NVIDIA driver ≥ 530; check the AMI's driver with `nvidia-smi`) and the `--nvccflags` for sm_75 are the likely first-build failure points. The build ends with a `ldd` / `h264_nvenc` / `scale_cuda` check so a bad image fails at build time.
- Terraform passes `validate` and `fmt` but was **not planned or applied**. Check the task's `cpu`/`memory` against the instance's `registeredResources` (`aws ecs describe-container-instances`); if the task can't be placed, lower `task_memory_mib`.
- The GPU command lines are unit-tested (flags/filtergraph) and the CPU shapes were run through real ffmpeg, but **the NVENC/scale_cuda pipeline has never executed**. The `scale_cuda …:format=nv12` option and split-on-CUDA-frames need confirming on the actual build; `GPU_SCALER=scale_npp` is the alternative, and any failure falls back to CPU with the reason in the logs.
- The Lua slot scripts were verified against a local Redis (cap holds under 60 parallel callers; release never goes below 0).
- A task that dies without sending a webhook (instance failure, OOM kill) leaks a limiter slot. A follow-up should reconcile the counter with ECS (e.g. an EventBridge `ECS Task State Change` rule).
- Bridge networking means all tasks share the instance's public IP and security group; fine for one task per GPU.
