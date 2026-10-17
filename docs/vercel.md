# Publishing on Vercel for everyone

The UI is hosted on Vercel; the API, queue, storage and transcoding stay on AWS. `video-transcoder-client/vercel.json` makes Vercel
**forward `/api/*` to the API**, so your visitors only ever talk to one address (`https://<name>.vercel.app`). That keeps the sign-in
cookie first-party (browsers block third-party cookies) and means there is no CORS to configure.

```
browser ──► https://<name>.vercel.app ──┬─ pages, JS, images  (served by Vercel)
                                        └─ /api/*  ── proxied ──►  API Gateway ─► Fargate (AWS)
S3 uploads / downloads go browser <-> S3 directly over short-lived signed links.
Lambda + transcoding containers call the API Gateway address directly (not through Vercel).
```

Everything already works at the AWS address (`terraform output api_url`). These steps put the Vercel front on top and open it to the public.

## 1. Deploy the UI to Vercel (5 min)

You need a free Vercel account (https://vercel.com/signup). Then, from the repo:

```bash
cd video-transcoder-client
npx vercel login
npx vercel --prod
```

Answer the prompts: *Set up and deploy?* **Y**, pick your scope, *Link to existing project?* **N**, *Project name* e.g. `vidflow`, *Directory* `./`,
*Override settings?* **N** (Next.js is detected). It prints a **Production URL** such as `https://vidflow.vercel.app`. Copy it.

Optional (shown in the Privacy Policy and Terms as the contact for data requests):
```bash
npx vercel env add NEXT_PUBLIC_CONTACT_EMAIL production      # then paste your public contact email
npx vercel --prod
```

> **Already have a Vercel project from the old Render setup?** It still has `NEXT_PUBLIC_BACKEND_URL` pointing at Render. The UI no longer reads that variable
> (a build with it set contains no Render address, which I tested), but delete it to avoid confusion:
> `npx vercel env rm NEXT_PUBLIC_BACKEND_URL production` (and for `preview`/`development` if asked). The old Render service is no longer used: suspend it in the Render dashboard.

> If the API's address ever changes (the API Gateway is re-created), update the `destination` in `video-transcoder-client/vercel.json` to `terraform output -raw api_url` + `/api/:path*` and redeploy.

## 2. Tell AWS what the public address is

In `infra/terraform.tfvars`:
```hcl
public_site_url = "https://vidflow.vercel.app"    # your Production URL, no trailing slash
allow_anyone    = true                             # any verified Google account may sign in
```
```bash
cd infra
AWS_PROFILE=vidflow terraform apply
```
This changes the sign-in callback address, the cookie scope and S3's allowed browser origin to the Vercel address, and restarts the API (about 2 minutes).

## 3. Google: use the Vercel address and publish the app

In https://console.cloud.google.com → your project:

1. **Credentials → your OAuth client**: replace both URLs with the Vercel ones
   - Authorized JavaScript origins: `https://vidflow.vercel.app`
   - Authorized redirect URIs: `https://vidflow.vercel.app/api/v1/user/google/callback`
2. **OAuth consent screen → Branding** (called *App information / App domain* in older consoles):
   - Application home page: `https://vidflow.vercel.app`
   - Privacy policy: `https://vidflow.vercel.app/privacy/`
   - Terms of service: `https://vidflow.vercel.app/terms/`
   - **Authorized domains**: `vidflow.vercel.app`. Google asks you to prove you own it: open https://search.google.com/search-console, add a *URL prefix* property for your Vercel URL, choose the **HTML file** method, download the file, put it in `video-transcoder-client/public/`, run `npx vercel --prod` again, then click Verify.
3. **Audience → Publish app → In production.** VidFlow only asks for the basic profile (`openid`, `email`, `profile`), which Google treats as non-sensitive, so no Google review is needed and the "100 test users" limit goes away.

## 4. Verify, then try it

```bash
AWS_PROFILE=vidflow node scripts/check-live.js          # uses the Vercel address once public_site_url is set
```
It must end with "All checks passed." (it checks sign-in redirects, locked endpoints, headers, the privacy/terms pages and that the Vercel proxy reaches the API). Then open the site in a private window, sign in with a Google account that is **not** yours, and upload a short video.

## What keeps open sign-up from running up your bill

| Control | Default | Where |
|---|---|---|
| Uploads per user per day | 20 | `user_daily_uploads` |
| Videos in progress per user | 3 | `user_max_active_jobs` |
| Max file size (server-enforced, signed into the S3 URL) | 30 MB | `server/src/utils/uploadKey.js` |
| **Uploads for the whole service per 24 h** | **100** | `global_daily_uploads` |
| Parallel transcodes (Fargate tasks) | 5 | limiter, `MAX_CONCURRENT_JOBS` |
| Videos auto-deleted after | 30 days (server sweep + S3 rule) | `retention_days` |
| Billing alerts | email at `alarm_email` | confirm the AWS email once |

**Worst case**, with every slot used every day: about $0.015 per upload (a 4 vCPU / 8 GB Fargate encode of a couple of minutes, plus the user downloading every rendition at ~$0.11/GB),
so roughly **$1.50/day at 100 uploads**, plus about $14/month fixed. Raise `global_daily_uploads` only as your credits allow.

**Kill switches** (all take effect after `terraform apply`, ~2 min):
- Close sign-up again: `allow_anyone = false` (then only `allowed_emails`).
- Pause uploads: `global_daily_uploads = 0`.
- Take the service offline: `api_desired_count = 0`.

Also confirm the two AWS notification emails sent to `alarm_email` (SNS) or the billing alert never reaches you. Consider an AWS Budget (console: *Billing → Budgets*) as a second net.

## Things to know
- Vercel's free "Hobby" plan is for non-commercial use. Fine for a personal project; a commercial service needs a paid plan.
- Rewrites to an external server are billed as Vercel "Fast Origin Transfer"; at this scale it is negligible.
- Users can delete their own videos at any time; the Privacy Policy tells them to contact you for full account deletion, so keep an eye on that mailbox.
- The legal pages are sensible plain-language defaults, not legal advice. If you charge money or collect more data, have them reviewed.
