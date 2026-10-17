#!/usr/bin/env node
// Verifies the Terraform-created AWS stack from your laptop. No Render, no tunnel, no npm dependencies.
//
//   node scripts/verify-aws.js preflight                       read-only: do the resources, permissions and quotas look right?
//   node scripts/verify-aws.js e2e --mode cpu [--input f.mp4]  REAL run: upload -> Lambda -> ECS task -> S3 outputs (Fargate, ~cents)
//   node scripts/verify-aws.js e2e --mode gpu --yes            same on the GPU instance (needs the G/VT quota; ~$0.15-0.30)
//
// Options: --region ap-south-1  --prefix vidflow  --profile vidflow  --avoid aegis  --keep (don't delete test objects)  --timeout-min 30
//   --profile  AWS CLI profile to use (same as AWS_PROFILE). Use one dedicated to VidFlow.
//   --avoid    name of ANOTHER project sharing this AWS account; the Isolation checks prove VidFlow cannot touch it.
//
// e2e builds the RunTask request with the SAME code the server uses (server/src/utils/runTaskInput.js), so a pass
// here means the server's launch path is valid. It deliberately sets no WEBHOOK_URL (nothing public can receive it
// from your laptop); the result is read from ECS and S3 instead. The Lambda's own POST is checked via its logs.
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const run = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const a = { cmd: argv[2], region: "ap-south-1", prefix: "vidflow", mode: "cpu", timeoutMin: 30, yes: false, keep: false, avoid: ["aegis"] };
  for (let i = 3; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--region") a.region = argv[++i];
    else if (k === "--prefix") a.prefix = argv[++i];
    else if (k === "--profile") process.env.AWS_PROFILE = argv[++i];
    else if (k === "--avoid") a.avoid = argv[++i].split(",");
    else if (k === "--mode") a.mode = argv[++i];
    else if (k === "--input") a.input = argv[++i];
    else if (k === "--timeout-min") a.timeoutMin = Number(argv[++i]);
    else if (k === "--yes") a.yes = true;
    else if (k === "--keep") a.keep = true;
    else throw new Error(`Unknown argument ${k}`);
  }
  if (!["preflight", "e2e"].includes(a.cmd)) throw new Error("Usage: verify-aws.js preflight|e2e [options] (see header)");
  if (!["cpu", "gpu"].includes(a.mode)) throw new Error("--mode must be cpu or gpu");
  return a;
}

// ---------------------------------------------------------------- aws helpers
let REGION = "ap-south-1";
async function aws(args, { json = true, allowFail = false } = {}) {
  try {
    const { stdout } = await run("aws", [...args, "--region", REGION, "--no-cli-pager", ...(json ? ["--output", "json"] : [])], {
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, AWS_PAGER: "" },
    });
    return json ? (stdout.trim() ? JSON.parse(stdout) : {}) : stdout;
  } catch (err) {
    if (allowFail) return null;
    const lines = (err.stderr || err.message || "").toString().trim().split("\n");
    // The AWS CLI puts the useful sentence on the "An error occurred" line, not the trailing detail lines.
    throw new Error((lines.find((l) => /error occurred|Could not|Unable/i.test(l)) || lines[0]).replace(/^aws: \[ERROR\]: /, ""));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sec = (ms) => `${(ms / 1000).toFixed(0)}s`;

async function terraformOutputs() {
  try {
    const { stdout } = await run("terraform", ["-chdir=" + path.join(ROOT, "infra"), "output", "-json"]);
    const raw = JSON.parse(stdout);
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.value]));
  } catch (_) {
    return {};
  }
}

// ---------------------------------------------------------------- check framework
const results = [];
function record(status, name, detail = "", hint = "") {
  results.push({ status, name, detail, hint });
  const icon = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN", SKIP: "SKIP" }[status];
  console.log(`  [${icon}] ${name}${detail ? ` - ${detail}` : ""}`);
  if (hint && status !== "PASS") console.log(`         fix: ${hint}`);
}
async function check(name, fn, hint) {
  try {
    const r = await fn();
    if (r && r.status) record(r.status, name, r.detail, r.hint || hint);
    else record("PASS", name, typeof r === "string" ? r : "");
  } catch (err) {
    record("FAIL", name, err.message.slice(0, 220), hint);
  }
}

// ---------------------------------------------------------------- preflight
async function preflight(ctx) {
  const { prefix, tf } = ctx;
  const names = {
    temp: tf.temp_bucket || "video-transcoder-temp-ashish",
    final: tf.final_bucket || "video-transcoder-final-ashish",
    lambda: tf.lambda_function || "video-transcoder-upload-trigger",
    gpuCluster: tf.cluster_name || `${prefix}-gpu`,
    cpuCluster: `${prefix}-cpu`,
    gpuRepo: `${prefix}-transcoder-gpu`,
    cpuRepo: `${prefix}-transcoder-cpu`,
    gpuFamily: tf.task_definition_family || `${prefix}-transcoder-gpu`,
    cpuFamily: `${prefix}-transcoder-cpu`,
    cp: tf.capacity_provider_name || `${prefix}-gpu-cp`,
    server: tf.server_iam_user || `${prefix}-server`,
  };
  ctx.names = names;
  const applyHint = "cd infra && terraform init -upgrade && terraform apply";

  console.log("\nIdentity");
  await check("AWS credentials", async () => {
    const id = await aws(["sts", "get-caller-identity"]);
    ctx.account = id.Account;
    ctx.callerArn = id.Arn;
    return `${id.Arn} (account ${id.Account})`;
  }, "aws configure / aws sso login, and make sure it is the NEW account");

  console.log("\nS3");
  for (const [label, bucket] of [["temp", names.temp], ["final", names.final]]) {
    await check(`${label} bucket exists (${bucket})`, async () => { await aws(["s3api", "head-bucket", "--bucket", bucket]); }, applyHint);
    await check(`${label} bucket blocks public access`, async () => {
      const c = (await aws(["s3api", "get-public-access-block", "--bucket", bucket])).PublicAccessBlockConfiguration;
      if (!Object.values(c).every(Boolean)) return { status: "FAIL", detail: JSON.stringify(c) };
    }, applyHint);
    await check(`${label} bucket CORS allows browser origins`, async () => {
      const rules = (await aws(["s3api", "get-bucket-cors", "--bucket", bucket])).CORSRules;
      return `origins: ${rules.flatMap((r) => r.AllowedOrigins).join(", ")}`;
    }, applyHint);
  }

  console.log("\nUpload trigger (S3 -> Lambda)");
  await check("Lambda exists and is Active", async () => {
    const fn = await aws(["lambda", "get-function-configuration", "--function-name", names.lambda]);
    ctx.lambdaEndpoint = (fn.Environment && fn.Environment.Variables.API_ENDPOINT) || "";
    if (fn.State !== "Active") return { status: "FAIL", detail: `state ${fn.State}` };
    return `${fn.Runtime}, timeout ${fn.Timeout}s`;
  }, applyHint);
  await check("Lambda has an API_ENDPOINT to forward to", async () => {
    if (ctx.lambdaEndpoint === undefined) return { status: "SKIP", detail: "Lambda not found" };
    if (!ctx.lambdaEndpoint) return { status: "FAIL", detail: "empty" };
    if (/onrender\.com/.test(ctx.lambdaEndpoint)) {
      return { status: "WARN", detail: ctx.lambdaEndpoint, hint: "uploads are POSTed to this Render URL. For local tests set lambda_api_endpoint to your tunnel URL (see docs/local-testing.md)." };
    }
    return ctx.lambdaEndpoint;
  });
  await check("Lambda permits S3 to invoke it", async () => {
    const policy = await aws(["lambda", "get-policy", "--function-name", names.lambda]);
    if (!/s3\.amazonaws\.com/.test(policy.Policy)) return { status: "FAIL", detail: "no s3.amazonaws.com statement" };
  }, applyHint);
  await check("Temp bucket notifies the Lambda for uploads/videos/", async () => {
    const n = await aws(["s3api", "get-bucket-notification-configuration", "--bucket", names.temp]);
    const cfg = (n.LambdaFunctionConfigurations || []).find((c) => c.LambdaFunctionArn.endsWith(`:${names.lambda}`));
    if (!cfg) return { status: "FAIL", detail: "no Lambda notification configured" };
    const prefixRule = ((cfg.Filter || {}).Key || {}).FilterRules || [];
    return `${cfg.Events.join(",")} prefix=${(prefixRule.find((r) => r.Name.toLowerCase() === "prefix") || {}).Value}`;
  }, applyHint);

  console.log("\nIAM (simulated, nothing is changed)");
  const sim = async (arn, action, resource) =>
    (await aws(["iam", "simulate-principal-policy", "--policy-source-arn", arn, "--action-names", action, "--resource-arns", resource]))
      .EvaluationResults[0].EvalDecision === "allowed";
  const expect = async (label, arn, action, resource, shouldAllow) =>
    check(`${label}: ${action} ${shouldAllow ? "allowed" : "denied"}`, async () => {
      const allowed = await sim(arn, action, resource);
      if (allowed !== shouldAllow) return { status: "FAIL", detail: `got ${allowed ? "allowed" : "denied"} on ${resource}` };
    }, "terraform apply; if it persists check infra/iam.tf");
  const taskRoleArn = (await aws(["iam", "get-role", "--role-name", `${names.gpuCluster}-task`], { allowFail: true }) || {}).Role;
  if (taskRoleArn) {
    const arn = taskRoleArn.Arn;
    await expect("task role", arn, "s3:GetObject", `arn:aws:s3:::${names.temp}/uploads/videos/x.mp4`, true);
    await expect("task role", arn, "s3:PutObject", `arn:aws:s3:::${names.final}/videos/x/x-720p.mp4`, true);
    await expect("task role", arn, "s3:PutObject", `arn:aws:s3:::${names.temp}/uploads/videos/x.mp4`, false);
    await expect("task role", arn, "s3:DeleteObject", `arn:aws:s3:::${names.final}/videos/x/x-720p.mp4`, false);
  } else record("SKIP", "task role checks", "role not found", "terraform apply");
  const serverUser = await aws(["iam", "get-user", "--user-name", names.server], { allowFail: true });
  if (serverUser) {
    const arn = serverUser.User.Arn;
    await expect("server user", arn, "s3:PutObject", `arn:aws:s3:::${names.temp}/uploads/videos/x.mp4`, true);
    await expect("server user", arn, "s3:DeleteObject", `arn:aws:s3:::${names.temp}/uploads/videos/x.mp4`, true);
    await expect("server user", arn, "s3:GetObject", `arn:aws:s3:::${names.final}/videos/x/x-720p.mp4`, true);
    await expect("server user", arn, "s3:PutObject", `arn:aws:s3:::${names.final}/videos/x/x-720p.mp4`, false);
  } else record("FAIL", `IAM user ${names.server} exists`, "", applyHint);

  console.log("\nCPU path (Fargate)");
  await check("CPU cluster ACTIVE", async () => {
    const c = (await aws(["ecs", "describe-clusters", "--clusters", names.cpuCluster])).clusters[0];
    if (!c || c.status !== "ACTIVE") return { status: "FAIL", detail: c ? c.status : "missing" };
  }, applyHint);
  await check("CPU task definition ACTIVE", async () => {
    const td = (await aws(["ecs", "describe-task-definition", "--task-definition", names.cpuFamily])).taskDefinition;
    return `rev ${td.revision}, ${td.cpu} cpu / ${td.memory} MiB`;
  }, applyHint);
  await check("CPU image pushed (tag 'cpu')", async () => {
    const r = await aws(["ecr", "describe-images", "--repository-name", names.cpuRepo, "--image-ids", "imageTag=cpu"], { allowFail: true });
    if (!r) return { status: "FAIL", detail: "no image", hint: `docker buildx build --platform linux/amd64 -f ecs-task/Dockerfile -t ${ctx.account}.dkr.ecr.${REGION}.amazonaws.com/${names.cpuRepo}:cpu --push ecs-task  (after ecr login; start Docker Desktop first)` };
    return `${(r.imageDetails[0].imageSizeInBytes / 1048576).toFixed(0)} MB`;
  });

  console.log("\nGPU path (EC2 + scale-to-zero)");
  await check("GPU cluster ACTIVE", async () => {
    const c = (await aws(["ecs", "describe-clusters", "--clusters", names.gpuCluster])).clusters[0];
    if (!c || c.status !== "ACTIVE") return { status: "FAIL", detail: c ? c.status : "missing" };
  }, applyHint);
  await check("Capacity provider: managed scaling + termination protection, target 100", async () => {
    const cp = (await aws(["ecs", "describe-capacity-providers", "--capacity-providers", names.cp])).capacityProviders[0];
    const g = cp.autoScalingGroupProvider;
    const ok = g.managedScaling.status === "ENABLED" && g.managedTerminationProtection === "ENABLED" && g.managedScaling.targetCapacity === 100;
    if (!ok) return { status: "FAIL", detail: JSON.stringify(g.managedScaling) };
    ctx.asgArn = g.autoScalingGroupArn;
    return "ENABLED / ENABLED / 100";
  }, applyHint);
  await check("ASG scales to zero (min 0) and is idle", async () => {
    const name = (ctx.asgArn || "").split("autoScalingGroupName/")[1];
    if (!name) return { status: "SKIP", detail: "capacity provider not found" };
    const g = (await aws(["autoscaling", "describe-auto-scaling-groups", "--auto-scaling-group-names", name])).AutoScalingGroups[0];
    ctx.asgName = name;
    if (g.MinSize !== 0) return { status: "FAIL", detail: `MinSize ${g.MinSize}` };
    if (g.DesiredCapacity > 0) return { status: "WARN", detail: `${g.DesiredCapacity} instance(s) running right now (costing money)` };
    return `min 0, max ${g.MaxSize}, desired 0`;
  }, applyHint);
  await check("GPU task definition requests 1 GPU", async () => {
    const td = (await aws(["ecs", "describe-task-definition", "--task-definition", names.gpuFamily])).taskDefinition;
    const req = td.containerDefinitions[0].resourceRequirements || [];
    if (!req.some((r) => r.type === "GPU" && r.value === "1")) return { status: "FAIL", detail: "no GPU resourceRequirement" };
    return `rev ${td.revision}`;
  }, applyHint);
  await check("GPU image pushed (tag 'gpu')", async () => {
    const r = await aws(["ecr", "describe-images", "--repository-name", names.gpuRepo, "--image-ids", "imageTag=gpu"], { allowFail: true });
    if (!r) return { status: "FAIL", detail: "no image", hint: `docker buildx build --platform linux/amd64 -f ecs-task/Dockerfile.gpu -t ${ctx.account}.dkr.ecr.${REGION}.amazonaws.com/${names.gpuRepo}:gpu --push ecs-task` };
    return `${(r.imageDetails[0].imageSizeInBytes / 1048576).toFixed(0)} MB`;
  });
  await check("Quota 'Running On-Demand G and VT instances' >= 4 vCPU", async () => {
    const q = (await aws(["service-quotas", "get-service-quota", "--service-code", "ec2", "--quota-code", "L-DB2E81BA"])).Quota;
    ctx.gpuQuota = q.Value;
    if (q.Value < 4) {
      return { status: "FAIL", detail: `quota is ${q.Value}`, hint: `aws service-quotas request-service-quota-increase --service-code ec2 --quota-code L-DB2E81BA --desired-value 8 --region ${REGION}` };
    }
    return `${q.Value} vCPU`;
  });

  console.log("\nIsolation from other projects in this account");
  const avoidRe = new RegExp(ctx.avoid.join("|"), "i");
  await check(`Credentials do not belong to another project (${ctx.avoid.join(", ")})`, async () => {
    if (avoidRe.test(ctx.callerArn || "")) {
      return { status: "FAIL", detail: ctx.callerArn, hint: "use a VidFlow-only profile: --profile vidflow (or AWS_PROFILE); see docs/gpu-migration.md#isolation-from-other-projects" };
    }
    return ctx.callerArn;
  });
  await check("Task definitions only use vidflow-* IAM roles", async () => {
    const bad = [];
    for (const fam of [names.gpuFamily, names.cpuFamily]) {
      const td = (await aws(["ecs", "describe-task-definition", "--task-definition", fam], { allowFail: true }) || {}).taskDefinition;
      if (!td) continue;
      for (const arn of [td.taskRoleArn, td.executionRoleArn]) if (arn && !new RegExp(`role/${prefix}-`).test(arn)) bad.push(arn);
    }
    if (bad.length) return { status: "FAIL", detail: bad.join(", ") };
  });
  await check("Every VidFlow principal is denied access to other projects' buckets", async () => {
    const all = (await aws(["s3api", "list-buckets"])).Buckets.map((b) => b.Name);
    const foreign = all.filter((b) => b !== names.temp && b !== names.final);
    const principals = [taskRoleArn && taskRoleArn.Arn, serverUser && serverUser.User.Arn].filter(Boolean);
    if (!principals.length) return { status: "SKIP", detail: "VidFlow principals not created yet" };
    if (!foreign.length) return "no other buckets in the account";
    const leaks = [];
    for (const arn of principals) {
      for (const b of foreign) {
        for (const action of ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]) {
          if (await sim(arn, action, `arn:aws:s3:::${b}/probe.txt`)) leaks.push(`${arn.split("/").pop()} can ${action} ${b}`);
        }
      }
    }
    if (leaks.length) return { status: "FAIL", detail: leaks.slice(0, 3).join("; ") };
    return `${principals.length} principals x ${foreign.length} foreign bucket(s) (${foreign.join(", ")}): all denied`;
  });
  await check("Deploy identity is scoped: VidFlow actions allowed, other projects and escalation denied", async () => {
    const deploy = await aws(["iam", "get-user", "--user-name", `${prefix}-deploy`], { allowFail: true });
    if (!deploy) return { status: "SKIP", detail: `${prefix}-deploy not created (cd infra/bootstrap && terraform apply)` };
    const acct = ctx.account, arn = deploy.User.Arn;
    const other = ctx.avoid[0];
    const ctxKey = (name, value) => ["--context-entries", `ContextKeyName=${name},ContextKeyValues=${value},ContextKeyType=string`];
    const decide = async (action, resource, extra = []) =>
      (await aws(["iam", "simulate-principal-policy", "--policy-source-arn", arn, "--action-names", action, "--resource-arns", resource, ...extra]))
        .EvaluationResults[0].EvalDecision === "allowed";
    const cases = [
      // [expected allowed?, action, resource, extra args, label]
      [true, "s3:PutBucketCors", `arn:aws:s3:::${names.temp}`, [], "configure the VidFlow temp bucket"],
      [true, "lambda:CreateFunction", `arn:aws:lambda:${REGION}:${acct}:function:${names.lambda}`, [], "create the VidFlow Lambda"],
      [true, "iam:CreateRole", `arn:aws:iam::${acct}:role/${prefix}-gpu-task`, [], "create a vidflow-* role"],
      [true, "iam:PassRole", `arn:aws:iam::${acct}:role/${prefix}-gpu-task`, ctxKey("iam:PassedToService", "ecs-tasks.amazonaws.com"), "pass a vidflow role to ECS"],
      [true, "iam:AttachRolePolicy", `arn:aws:iam::${acct}:role/${prefix}-gpu-task`, ctxKey("iam:PolicyARN", "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"), "attach a known managed policy"],
      [true, "ecr:CreateRepository", `arn:aws:ecr:${REGION}:${acct}:repository/${names.cpuRepo}`, [], "create a vidflow ECR repo"],
      [true, "ecs:CreateCluster", `arn:aws:ecs:${REGION}:${acct}:cluster/${names.cpuCluster}`, [], "create a vidflow ECS cluster"],
      [true, "logs:CreateLogGroup", `arn:aws:logs:${REGION}:${acct}:log-group:/ecs/${prefix}-cpu`, [], "create a vidflow log group"],
      [true, "sns:CreateTopic", `arn:aws:sns:${REGION}:${acct}:${prefix}-gpu-alarms`, [], "create a vidflow SNS topic"],
      [false, "s3:GetObject", `arn:aws:s3:::${other}-evidence-${acct}/x`, [], `read ${other} data`],
      [false, "s3:DeleteBucket", `arn:aws:s3:::${other}-frontend-${acct}`, [], `delete ${other} buckets`],
      [false, "iam:PassRole", `arn:aws:iam::${acct}:role/${other}-ecs-task`, ctxKey("iam:PassedToService", "ecs-tasks.amazonaws.com"), `use ${other}'s roles`],
      [false, "iam:DeleteRole", `arn:aws:iam::${acct}:role/${other}-ecs-task`, [], `delete ${other}'s roles`],
      [false, "iam:CreateAccessKey", `arn:aws:iam::${acct}:user/${other}-deploy`, [], `mint keys for ${other}'s user`],
      [false, "ecs:DeleteCluster", `arn:aws:ecs:${REGION}:${acct}:cluster/${other}-main`, [], `delete ${other} ECS clusters`],
      [false, "iam:CreateRole", `arn:aws:iam::${acct}:role/not-${prefix}-role`, [], "create roles outside vidflow-*"],
      [false, "iam:AttachRolePolicy", `arn:aws:iam::${acct}:role/${prefix}-gpu-task`, ctxKey("iam:PolicyARN", "arn:aws:iam::aws:policy/AdministratorAccess"), "attach AdministratorAccess to a role"],
      [false, "iam:CreatePolicyVersion", `arn:aws:iam::${acct}:policy/${prefix}-deploy-iam`, [], "rewrite its own policy"],
      [false, "iam:AttachUserPolicy", arn, ctxKey("iam:PolicyARN", "arn:aws:iam::aws:policy/AdministratorAccess"), "attach policies to itself"],
      [false, "iam:CreateUser", `arn:aws:iam::${acct}:user/someone-else`, [], "create arbitrary users"],
    ];
    const wrong = [];
    for (const [shouldAllow, action, resource, extra, label] of cases) {
      if ((await decide(action, resource, extra)) !== shouldAllow) wrong.push(`${shouldAllow ? "cannot" : "CAN"} ${label}`);
    }
    if (wrong.length) return { status: "FAIL", detail: wrong.join("; ") };
    return `${cases.length} cases behave as intended`;
  }, "review infra/bootstrap/main.tf and terraform apply it");
  await check("VidFlow resources carry the Project=vidflow tag", async () => {
    const r = await aws(["resourcegroupstaggingapi", "get-resources", "--tag-filters", "Key=Project,Values=vidflow"]);
    const n = r.ResourceTagMappingList.length;
    if (!n) return { status: "WARN", detail: "no tagged resources found yet" };
    return `${n} tagged resources`;
  });
}

// A GPU-quota failure must not fail a CPU run (and vice versa).
const relevantTo = (mode) => (r) => (mode === "gpu" ? !/CPU/.test(r.name) : !/GPU|Capacity|ASG|quota/i.test(r.name));

function summarize() {
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nSummary: ${count("PASS")} passed, ${count("WARN")} warnings, ${count("FAIL")} failed, ${count("SKIP")} skipped`);
  return count("FAIL") === 0;
}

// ---------------------------------------------------------------- e2e
const ffprobe = async (file) => {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", file]);
  const streams = JSON.parse(stdout).streams;
  const v = streams.find((s) => s.codec_type === "video");
  return { width: v.width, height: v.height, codec: v.codec_name, audio: streams.some((s) => s.codec_type === "audio") };
};

async function e2e(ctx) {
  const { names, mode } = ctx;
  const stamp = Date.now();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vidflow-e2e-"));
  const state = { taskArn: null, cleanedUp: false };
  const t0 = Date.now();
  const log = (m) => console.log(`[${sec(Date.now() - t0).padStart(5)}] ${m}`);

  // -- required checks before spending money
  const relevant = results.filter((r) => r.status === "FAIL" && relevantTo(mode)(r));
  if (relevant.length) {
    console.log(`\nNot starting the e2e run: ${relevant.length} check(s) failed for mode=${mode}:`);
    relevant.forEach((r) => console.log(`  - ${r.name}${r.hint ? `\n      fix: ${r.hint}` : ""}`));
    return false;
  }
  if (mode === "gpu" && !ctx.yes) {
    console.log("\nGPU e2e launches a g4dn.xlarge (~$0.53/h, kept ~15-20 min by scale-in => ~$0.15-0.30). Re-run with --yes to proceed.");
    return false;
  }

  // -- input
  let input = ctx.input;
  if (!input) {
    input = path.join(scratch, "sample.mp4");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", input]);
    console.log("\nNo --input given: generated a 10s 1280x720 synthetic clip.");
  }
  const src = await ffprobe(input);
  const key = `uploads/videos/e2e-${stamp}.mp4`;
  const baseName = `e2e-${stamp}`;

  const cleanup = async () => {
    if (state.cleanedUp) return;
    state.cleanedUp = true;
    if (state.taskArn) {
      const d = await aws(["ecs", "describe-tasks", "--cluster", ctx.cluster, "--tasks", state.taskArn], { allowFail: true });
      if (d && d.tasks[0] && d.tasks[0].lastStatus !== "STOPPED") {
        log("stopping the ECS task so it cannot keep running");
        await aws(["ecs", "stop-task", "--cluster", ctx.cluster, "--task", state.taskArn, "--reason", "verify-aws cleanup"], { allowFail: true });
      }
    }
    if (!ctx.keep) {
      await aws(["s3", "rm", `s3://${names.temp}/${key}`], { json: false, allowFail: true });
      await aws(["s3", "rm", `s3://${names.final}/videos/${baseName}/`, "--recursive"], { json: false, allowFail: true });
      log("deleted test objects from both buckets");
    }
    fs.rmSync(scratch, { recursive: true, force: true });
  };
  process.on("SIGINT", async () => { console.log("\ninterrupted"); await cleanup(); process.exit(130); });

  try {
    // -- 1. upload (fires the S3 -> Lambda notification)
    console.log(`\nE2E (${mode}) on account ${ctx.account}, key ${key}`);
    await aws(["s3api", "put-object", "--bucket", names.temp, "--key", key, "--body", input, "--content-type", "video/mp4"]);
    log(`uploaded ${(fs.statSync(input).size / 1048576).toFixed(1)} MB to s3://${names.temp}/${key}`);

    // -- 2. launch with exactly the request the server would send
    const { buildRunTaskInput } = require(path.join(ROOT, "server/src/utils/runTaskInput.js"));
    // No WEBHOOK_URL: nothing reachable from AWS exists on a laptop, so the worker skips its callbacks.
    const env = { ...ctx.serverEnv, TRANSCODE_MODE: mode, TEMP_S3_BUCKET_NAME: names.temp, FINAL_S3_BUCKET_NAME: names.final };
    const input2 = buildRunTaskInput({ objectKey: key, fileName: baseName }, env);
    ctx.cluster = input2.cluster;
    const reqFile = path.join(scratch, "runtask.json");
    fs.writeFileSync(reqFile, JSON.stringify(input2));
    const started = await aws(["ecs", "run-task", "--cli-input-json", `file://${reqFile}`]);
    if (started.failures && started.failures.length) throw new Error(`RunTask failures: ${JSON.stringify(started.failures)}`);
    state.taskArn = started.tasks[0].taskArn;
    const taskId = state.taskArn.split("/").pop();
    log(`RunTask accepted (${taskId}) on ${mode === "gpu" ? "capacity provider " + ctx.serverEnv.GPU_CAPACITY_PROVIDER : "Fargate"}`);

    // -- 3. wait for the task, printing every status change (this is the cold-start measurement)
    let last = "";
    let lastActivityCheck = 0;
    let task;
    const deadline = Date.now() + ctx.timeoutMin * 60000;
    while (Date.now() < deadline) {
      task = (await aws(["ecs", "describe-tasks", "--cluster", ctx.cluster, "--tasks", state.taskArn])).tasks[0];
      if (task.lastStatus !== last) { last = task.lastStatus; log(`task ${last}`); }
      if (last === "STOPPED") break;
      if (mode === "gpu" && ["PROVISIONING", "PENDING"].includes(last) && Date.now() - lastActivityCheck > 60000) {
        lastActivityCheck = Date.now();
        const act = await aws(["autoscaling", "describe-scaling-activities", "--auto-scaling-group-name", ctx.asgName, "--max-items", "1"], { allowFail: true });
        const a = act && act.Activities && act.Activities[0];
        if (a && /Failed|Cancelled/.test(a.StatusCode)) log(`ASG activity ${a.StatusCode}: ${a.StatusMessage}`);
      }
      await sleep(5000);
    }
    if (!task || task.lastStatus !== "STOPPED") throw new Error(`timed out after ${ctx.timeoutMin} min in status ${last}`);

    const c = task.containers[0];
    const t = (f) => (task[f] ? new Date(task[f]).getTime() : null);
    const span = (a, b) => (t(a) && t(b) ? sec(t(b) - t(a)) : "n/a");
    console.log(`\nTask timeline: created->image pull ${span("createdAt", "pullStartedAt")} | pull ${span("pullStartedAt", "pullStoppedAt")} | ` +
      `created->started ${span("createdAt", "startedAt")} | run ${span("startedAt", "stoppedAt")}`);
    console.log(`Container exit code: ${c.exitCode} (${task.stoppedReason || task.stopCode})`);

    // -- 4. logs
    const group = mode === "gpu" ? "/ecs/" + names.gpuCluster : "/ecs/" + names.cpuCluster;
    const ev = await aws(["logs", "get-log-events", "--log-group-name", group, "--log-stream-name", `transcoder/video-transcoder/${taskId}`, "--start-from-head", "--limit", "300"], { allowFail: true });
    const lines = ((ev && ev.events) || []).map((e) => e.message.trim());
    const interesting = lines.filter((l) => /gpu-selfcheck|Transcode config|Source:|Transcoded in|FALLING BACK|\[transcode\]|Error|error/i.test(l));
    console.log(`Container log (${lines.length} lines; key lines):`);
    (interesting.length ? interesting : lines.slice(-15)).slice(0, 40).forEach((l) => console.log("   " + l.slice(0, 200)));
    if (c.exitCode !== 0) throw new Error("container exited non-zero (see log above)");

    // -- 5. outputs
    const objs = (await aws(["s3api", "list-objects-v2", "--bucket", names.final, "--prefix", `videos/${baseName}/`])).Contents || [];
    log(`final bucket has ${objs.length} output file(s)`);
    const want = ["1080p", "720p", "480p", "360p"];
    for (const rung of want) {
      const obj = objs.find((o) => o.Key.endsWith(`-${rung}.mp4`));
      if (!obj) { record("FAIL", `output ${rung}`, "missing"); continue; }
      const local = path.join(scratch, path.basename(obj.Key));
      await aws(["s3api", "get-object", "--bucket", names.final, "--key", obj.Key, local]);
      const p = await ffprobe(local);
      const ratioErr = Math.abs(p.width / p.height - src.width / src.height) / (src.width / src.height);
      const problems = [];
      if (p.width % 2 || p.height % 2) problems.push("odd dimensions");
      if (ratioErr > 0.01) problems.push(`aspect ratio off by ${(ratioErr * 100).toFixed(1)}%`);
      if (src.audio && !p.audio) problems.push("audio lost");
      if (p.codec !== "h264" && p.codec !== "hevc") problems.push(`codec ${p.codec}`);
      record(problems.length ? "FAIL" : "PASS", `output ${rung}`, `${p.width}x${p.height} ${p.codec}${p.audio ? "+audio" : ""} ${(obj.Size / 1048576).toFixed(2)} MB${problems.length ? " - " + problems.join(", ") : ""}`);
    }

    // -- 6. did the S3 event reach the Lambda?
    let invoked = null;
    for (let i = 0; i < 6 && !invoked; i++) {
      const f = await aws(["logs", "filter-log-events", "--log-group-name", `/aws/lambda/${names.lambda}`, "--filter-pattern", `"${baseName}"`, "--start-time", String(stamp - 5000)], { allowFail: true });
      invoked = f && f.events && f.events.length ? f.events.map((e) => e.message.trim()).join("\n") : null;
      if (!invoked) await sleep(5000);
    }
    if (!invoked) record("FAIL", "S3 event reached the Lambda", "no log line mentions the test key within 30s", "check the bucket notification and the Lambda permission (preflight)");
    else {
      record("PASS", "S3 event reached the Lambda", "ObjectCreated notification fired");
      const forwarded = /API response received/.test(invoked) ? "Lambda's POST to API_ENDPOINT succeeded" : /Error processing/.test(invoked) ? "Lambda's POST to API_ENDPOINT FAILED (expected unless the server/tunnel is up)" : "";
      if (forwarded) console.log(`         ${forwarded}`);
    }
    return true;
  } catch (err) {
    record("FAIL", "e2e run", err.message);
    return false;
  } finally {
    await cleanup();
  }
}

// ---------------------------------------------------------------- main
(async () => {
  const args = parseArgs(process.argv);
  REGION = args.region;
  const tf = await terraformOutputs();
  const ctx = { ...args, tf, serverEnv: tf.server_env || {} };
  console.log(`vidflow AWS verification (region ${REGION}, terraform outputs ${Object.keys(tf).length ? "found" : "NOT found, using default names"})`);
  await preflight(ctx);
  let ok = summarize();
  if (args.cmd === "e2e") {
    if (!ctx.serverEnv.TASK && !ctx.serverEnv.GPU_TASK) {
      console.log("\nterraform output server_env is missing: apply the latest infra first.");
      ok = false;
    } else {
      await e2e(ctx);
      ok = results.filter((r) => r.status === "FAIL" && relevantTo(args.mode)(r)).length === 0;
    }
    console.log(ok ? "\nE2E RESULT: PASS" : "\nE2E RESULT: FAIL");
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
