# Testing the AWS integration from your laptop

Nothing here deploys the app (no Render, no Vercel). Terraform creates the AWS resources; you run everything else
locally and check that the AWS side works. Two levels:

| Level | What it proves | Needs |
|---|---|---|
| **A. `scripts/verify-aws.js`** | Terraform is correct; buckets, Lambda trigger, IAM, ECS task, image and outputs all work end to end | AWS CLI, ffmpeg (local), Docker (to push images) |
| **B. Local server + frontend against AWS** | The real app flow: UI upload → S3 → Lambda → your laptop → ECS → webhook → UI | Level A, Mongo, Redis, a tunnel |

Your Mac has no NVIDIA GPU: the **GPU image cannot run locally**. Locally you run the Node server, Mongo, Redis and the UI;
the transcoding itself runs in AWS (Fargate CPU now, GPU once the quota is approved).

## Level A: verify the AWS stack

> **Use the VidFlow-only AWS profile** (`export AWS_PROFILE=vidflow`; created by `infra/bootstrap`, see *Isolation from other projects* in `docs/gpu-migration.md`). The verifier and Terraform both refuse another project's (`aegis`) credentials.

```bash
# 0. See what is deployed and what is missing (read-only, free)
node scripts/verify-aws.js preflight

# 1. Create the rest of the stack (S3, Lambda, CPU/Fargate, IAM user). First review:
cd infra && terraform init -upgrade && terraform plan && terraform apply && cd ..

# 2. Push the CPU image (start Docker Desktop first)
ACCT=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin $ACCT.dkr.ecr.ap-south-1.amazonaws.com
docker buildx build --platform linux/amd64 -f ecs-task/Dockerfile \
  -t $ACCT.dkr.ecr.ap-south-1.amazonaws.com/vidflow-transcoder-cpu:cpu --push ecs-task

# 3. Everything except the GPU items should now be PASS
node scripts/verify-aws.js preflight

# 4. A real job on Fargate: uploads a clip, fires the Lambda, runs the task, downloads + ffprobes the 4 outputs, cleans up.
#    Prints the task timeline (pull time, start time). Costs a few cents. Add --input yourvideo.mp4 for real footage.
node scripts/verify-aws.js e2e --mode cpu
```

The e2e run launches the task with the exact request the server builds (`server/src/utils/runTaskInput.js`), so a pass means
the server's launch path is valid too. It sets no `WEBHOOK_URL` (a laptop is not reachable from AWS), so the worker skips its callbacks and
the result is read from ECS and S3. The Lambda is checked through its CloudWatch logs; its own POST to `API_ENDPOINT` fails unless a server/tunnel is up, and the script says so.
Ctrl-C or a timeout stops the ECS task and deletes the test objects (`--keep` leaves them).

### GPU, when you are ready

1. Quota: `aws service-quotas request-service-quota-increase --service-code ec2 --quota-code L-DB2E81BA --desired-value 8 --region ap-south-1` (currently 0; approval can take a while).
2. Build and push the GPU image (the preflight prints the command). It is a long x86 compile under emulation on Apple Silicon.
3. `node scripts/verify-aws.js e2e --mode gpu --yes`. It reports the scale-from-zero timeline and the container's GPU self-check (`RESULT: GPU OK`) and whether it fell back to CPU.
   The instance stays up ~15-20 min afterwards, then scales back to 0 by itself.

## Level B: run the real app locally against AWS

```bash
brew services start mongodb-community redis        # or run mongod / redis-server yourself
```

`server/.env` (never committed):

```bash
PORT=8000
MONGO_URI=mongodb://127.0.0.1:27017
REDIS_URL=redis://127.0.0.1:6379
SESSION_SECRET=anything-local
FRONTEND_URL=http://localhost:3000
AUTH_DISABLED=true            # skips Google login; refused when NODE_ENV=production
AWS_PROFILE=vidflow           # NOT another project's profile. Or MY_AWS_ACCESS_KEY_ID/MY_AWS_SECRET_ACCESS_KEY of the vidflow-server user (tests its IAM policy)
WEBHOOK_URL=https://<tunnel>/api/v1/video/ecs-trigger
# WEBHOOK_SECRET=...            # optional locally. If set it must equal the production value in SSM, or the deployed Lambda's
#                                 events are refused; leave it unset for plain local testing (production always requires it).
# the rest comes from:  cd infra && terraform output server_env   (set TRANSCODE_MODE=cpu until the GPU is ready)
```

The AWS side must be able to call your laptop twice: the **Lambda** (S3 event → `/video/s3-trigger`) and the **container** (status webhook → `/video/ecs-trigger`). Use a tunnel:

```bash
brew install cloudflared && cloudflared tunnel --url http://localhost:8000     # prints https://<random>.trycloudflare.com
cd infra && terraform apply -var 'lambda_api_endpoint=https://<random>.trycloudflare.com/api/v1/video/s3-trigger'
```

Then:

```bash
cd server && npm install && npm run dev
cd video-transcoder-client && npm install && NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/api/v1 npm run dev   # http://localhost:3000
```

Upload a small video (the UI caps at 30 MB). Expected: Mongo status `queued → starting → processing → completed`, four files in the final bucket, preview works.
The bucket CORS already allows `http://localhost:3000`. The tunnel URL changes each time you restart it, so repeat the `terraform apply -var …` (and update `WEBHOOK_URL`). When you are done, run a plain `terraform apply` so the Lambda points at the deployed API again (see `docs/go-live.md`).

For a quick scripted check that needs no tunnel and no browser (uploads, delivers the S3 event itself, follows the job, attacks the security rules):
`node scripts/replay-frontend-flow.js --lambda-secret "$WEBHOOK_SECRET"` (needs `WEBHOOK_SECRET` set in `server/.env`).

## Signing in locally

- **Default (`AUTH_DISABLED=true`)**: the "Login with Google" button sends you straight to `/upload` as a built-in dev user. No Google account or keys are involved. The server refuses this flag when `NODE_ENV=production`.
- **Real Google login on localhost**: in Google Cloud Console create an OAuth client (type *Web application*), add the authorized redirect URI `http://localhost:8000/api/v1/user/google/callback` and the origin `http://localhost:3000`, then in `server/.env` set
  `AUTH_DISABLED=false`, `GOOGLE_CLIENT_ID=…`, `GOOGLE_CLIENT_SECRET=…`, `GOOGLE_CALLBACK_URL=http://localhost:8000/api/v1/user/google/callback` and `ALLOWED_EMAILS=you@gmail.com`, then restart the server.
  Sign-in refuses everyone who is not on the allowlist, locally too. The production setup is in `docs/go-live.md`.

## Cost and cleanup

- Fargate e2e: a few cents. GPU e2e: ~$0.15-0.30. Idle: $0 (ASG at 0, no NAT gateway).
- Remove everything: `cd infra && terraform destroy` (delete any CLI-created access keys first; see `docs/gpu-migration.md`).
