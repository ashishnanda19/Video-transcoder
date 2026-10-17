# Going live

The whole app (UI + API) runs on AWS behind **one https address**, defined in Terraform. Everything is deployed and tested
except the API task itself, which stays at 0 until the three outside accounts below give it somewhere to store data and sign people in.

```
browser ──https──► API Gateway (HTTP API, AWS-managed TLS)
                      │  VPC link (private)
                      ▼
                   Cloud Map (private DNS) ──► ONE Fargate task (0.25 vCPU / 0.5 GB)
                                                 serves the UI (static files baked into the image) AND /api/v1/*
                                                 ├─ MongoDB Atlas   (users, videos, sessions)      [outside AWS, free tier]
                                                 ├─ Upstash Redis   (job queue + concurrency limit) [outside AWS, free tier]
                                                 ├─ S3 (uploads → temp bucket, renditions → final bucket) via signed URLs
                                                 └─ ECS RunTask → Fargate (CPU) or GPU instance → transcodes → webhook back
S3 upload event ► Lambda ► POST /api/v1/video/s3-trigger (shared secret from SSM)
```

Because the UI and API share one origin, session cookies are first-party and there is no CORS to configure.

To host the UI on **Vercel** and open the service to everyone, follow [vercel.md](vercel.md) after this guide.

**Why not CloudFront / App Runner?** This AWS account is new and AWS blocks both until it is "verified" (CloudFront: *"Your account must be
verified before you can add new CloudFront resources"*; App Runner: `SubscriptionRequiredException`). The same restriction is why the GPU quota is 0.
The design works without them. If AWS later verifies the account, a CDN can be put in front without changing the app; see *AWS Support* below.

## What you do (about 20 minutes, once)

### 1. MongoDB Atlas (free)
1. https://cloud.mongodb.com → create a project and a **free M0** cluster (pick AWS, region **Mumbai (ap-south-1)**).
2. *Database Access* → add a database user with a strong password (letters and digits only, or URL-encode special characters).
3. *Network Access* → **Add IP address → `0.0.0.0/0`**. Fargate tasks have no fixed IP, so Atlas cannot be IP-restricted without a ~$32/month NAT gateway; the protection is TLS plus the long password.
4. *Connect → Drivers* → copy the `mongodb+srv://user:password@cluster….mongodb.net/` string.


### 2. Upstash Redis (free)
1. https://console.upstash.com → *Create database*, region **ap-south-1**, TLS enabled.
2. Copy the **ioredis** URL, which looks like `rediss://default:<password>@<host>.upstash.io:6379` (note the double *s*).


### 3. Google OAuth (the sign-in)
Get the two URLs first:
```bash
cd infra
AWS_PROFILE=vidflow terraform output -raw google_oauth_authorized_origin; echo   # Authorized JavaScript origin
AWS_PROFILE=vidflow terraform output -raw google_oauth_redirect_uri; echo          # Authorized redirect URI
```
1. https://console.cloud.google.com → create a project → *APIs & Services → OAuth consent screen*: **External**, app name `VidFlow`, your email as support + developer contact. Scopes: leave the defaults (`openid`, `email`, `profile`). Publishing status: **Testing**.
2. Same screen → **Test users**: add every Google account that should be allowed in. (In *Testing* mode Google itself refuses everyone else, on top of the app's own allowlist.)
3. *Credentials → Create credentials → OAuth client ID → Web application*:
   - **Authorized JavaScript origins**: the origin printed above
   - **Authorized redirect URIs**: the redirect URI printed above (must match **exactly**, including `https` and no trailing slash)
4. Copy the **client ID** (`…apps.googleusercontent.com`) and **client secret**.

> If Google refuses to save the `execute-api.ap-south-1.amazonaws.com` redirect URI, the fix is a domain you own (API Gateway custom domain + free ACM certificate). Tell me the domain and I will add it to Terraform.

### 4. Who may sign in
Edit `infra/terraform.tfvars` (git-ignored):
```hcl
allowed_emails    = ["you@gmail.com", "friend@gmail.com"]   # exact Google addresses; everyone else is turned away
api_desired_count = 1
```
With neither `allowed_emails` nor `allowed_email_domains` set, **nobody** can sign in (fails closed).

## Deploy

```bash
export AWS_PROFILE=vidflow                 # the VidFlow-only identity (see gpu-migration.md, "Isolation")

./scripts/put-secrets.sh                   # asks (hidden prompts) for the Mongo / Redis / Google values from steps 1-3.
                                           # Generates SESSION_SECRET and WEBHOOK_SECRET itself. Nothing is printed or saved locally.

cd infra && terraform apply                # starts the API (api_desired_count = 1). The image is already in ECR.
cd .. && node scripts/check-live.js        # ~30 security/availability checks against the public URL; must end "All checks passed."
```
Then open the site URL (`terraform output site_url`), click **Continue with Google**, and upload a short video.

## Day-2 operations

| Task | Command |
|---|---|
| Logs | `aws logs tail /ecs/vidflow-api --follow --region ap-south-1` |
| Ship code changes (UI or API) | `./scripts/deploy-api.sh` (builds one image, rolls it with no downtime, rolls back if unhealthy) |
| Add or remove a user | edit `allowed_emails` → `terraform apply`; also add them under *Test users* in Google |
| Rotate secrets | `./scripts/put-secrets.sh --reset`, then `aws ecs update-service --cluster vidflow-api --service vidflow-api --force-new-deployment --region ap-south-1` |
| Switch to GPU later | after the quota + GPU image: `transcode_mode = "gpu"` → `terraform apply` |
| Pause everything | `api_desired_count = 0` → `terraform apply` (the site goes down; nothing else costs) |
| Remove it all | `terraform destroy` (see `gpu-migration.md` for key cleanup), then `aws ssm delete-parameters --names $(aws ssm get-parameters-by-path --path /vidflow/prod --query 'Parameters[].Name' --output text)` |

**Cost** (rough, ap-south-1): API task ≈ $9/month + its public IPv4 ≈ $3.65 + API Gateway ≈ $1 per million requests + Cloud Map/Route 53 zone $0.50 ≈ **$14/month**, plus transcoding only when someone uploads (a short CPU job costs a fraction of a cent). Atlas and Upstash free tiers cost $0.

## Security model

| Threat | Defence |
|---|---|
| Strangers using the app / spending credits | Google sign-in + email allowlist (fails closed) + per-user limits (3 videos in progress, 20 uploads/day) + 30 MB cap |
| Forged session cookie | Sessions are validated server-side (stored in MongoDB). The old check only looked for *a* cookie. |
| Stealing a session | HttpOnly + Secure + SameSite=Lax cookie, HSTS, strict CSP (no inline-eval, no framing) |
| Login CSRF | OAuth `state` parameter; logout is POST |
| Seeing/downloading other users' videos | Every video route is scoped to its owner; someone else's id looks like "not found" |
| Uploading huge or wrong files | Server validates type and size, signs the URL for *exactly* that size (S3 rejects any other); keys are server-generated and unique |
| Fake "job finished" / fake S3 events | S3 trigger needs a shared secret; each container gets a token for *its own job* only |
| Secrets leaking | In SSM (encrypted), read by the task at start-up; not in Terraform state, images, or logs |
| Reaching the API task directly | It has no public port; only the API Gateway VPC link can connect |
| Misconfiguration in production | The server refuses to start without secrets, a strong session secret, an https `PUBLIC_URL` and an allowlist |

## Known limits
- One API task: a crash or deploy swaps it within ~1 minute (deploys are rolling, so normally no gap). Add `api_desired_count = 2` for redundancy (needs Atlas/Upstash headroom).
- No WAF and no custom domain; both need either AWS verification (CloudFront/WAF) or a domain.
- Atlas must allow `0.0.0.0/0` (see above).
- A task that dies without sending its webhook (instance loss) leaves its video "starting" and holds a concurrency slot. A reconciliation job is the follow-up.
- There is no "delete video" feature yet; test uploads stay in S3 until deleted by hand.
- GPU transcoding stays off until the quota request below is granted.

## AWS Support (free, for the account restrictions)
Open *Support Center → Create case → Account and billing* (or *Service limit increase* for the GPU one). Suggested text:

> **Account verification:** My new account is restricted ("Your account must be verified before you can add new CloudFront resources"; App Runner returns SubscriptionRequiredException). Please complete verification so I can use CloudFront and App Runner. Account ID 027738434026.
>
> **GPU quota:** Please raise *Running On-Demand G and VT instances* (L-DB2E81BA) in ap-south-1 from 0 to 8 vCPUs for a g4dn.xlarge transcoding workload.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Google: `Error 400: redirect_uri_mismatch` | The redirect URI in Google Cloud differs from `terraform output google_oauth_redirect_uri` (scheme, host, path, trailing slash) |
| Google: `Access blocked … has not completed verification` / `403 access_denied` | The account is not under *Test users* on the consent screen |
| Back on the sign-in page with "isn't on the access list" | Google accepted them but `allowed_emails` doesn't contain that exact address → edit, `terraform apply` |
| Site returns `{"message":"Internal Server Error"}` | No healthy API task. `aws ecs describe-services --cluster vidflow-api --services vidflow-api` and read the logs |
| Task stops with `ResourceInitializationError … secrets` | A parameter is missing: run `./scripts/put-secrets.sh` and check `aws ssm describe-parameters` |
| Task crashes with a Mongo timeout | Atlas *Network Access* does not allow `0.0.0.0/0`, or the URI/password is wrong |
| Upload stuck on "Queued" | The Lambda could not reach the API or the secret differs: `aws logs tail /aws/lambda/video-transcoder-upload-trigger` |
