# Why transcoding takes the time it does (and what was changed)

## Where the time goes
Measured on a real production job (a 9.8 s, 1080p60 clip), from the S3 upload event to "completion reported":

| Step | Time | Notes |
|---|---|---|
| Fargate cold start (provision, image pull, container start) | ~17 s | per job; fixed cost of running each job on its own container |
| **ffmpeg: decode + encode four resolutions** | **27 s** (before) → **14 s** (now) | scales with the video's length: ~2.8× slower than real time before |
| Upload outputs to S3, report back | < 1 s | |
| UI notices (polls every 2.5 s) | ≤ 2.5 s | |

So a short clip is dominated by cold start + encode; a long video is dominated by encode (≈ 1.4× its length now, 2.8× before, on a 4 vCPU task).

## What changed
The CPU worker now decodes once and encodes the four renditions in one ffmpeg process (`TRANSCODE_STRATEGY=split`), with libx264 `veryfast` at CRF 19
instead of `medium` at CRF 23. Measured on the same 1080p60 clip (local benchmark; quality = VMAF against the source, higher is better):

| Setting | Encode time | Total size | VMAF 1080p / 720p / 360p |
|---|---|---|---|
| medium, CRF 23, 4 processes (old) | 1.00× | 4.2 MB | 92.3 / 89.9 / 89.5 |
| medium, CRF 23, split | 1.13× faster | 4.2 MB | 92.3 / 89.9 / 89.5 |
| faster, CRF 21, split | 1.64× | 5.1 MB | 92.8 / 90.8 / 90.4 |
| **veryfast, CRF 19, split (now)** | **2.05×** | **5.3 MB** | **92.0 / 90.4 / 90.1** |
| veryfast, CRF 23, split | 1.98× | 3.7 MB | 87.3 / 85.4 / 85.0 (visibly worse) |
| superfast, CRF 23, split | 2.3× | 7.2 MB | 92.6 / 91.6 / 91.1 (files 70% bigger) |

Confirmed on Fargate: the same clip went from 27.1 s to 14.1 s. Same visual quality, files about 28% larger.
Go back to the old behaviour with the worker env vars `TRANSCODE_STRATEGY=separate CPU_PRESET=medium CPU_CRF=23`.

## The real ceiling: Fargate vCPU quota
This AWS account's *Fargate On-Demand vCPU* quota is **8**. The API uses 0.25 and every transcoding job is a 4 vCPU task, so **only one job runs at a time**;
other uploads wait in the queue (they are not lost). The server's concurrency is therefore set to 1 (`max_concurrent_jobs`), not the 5 it was configured for,
so waiting jobs queue cleanly instead of repeatedly failing to launch.

A quota increase to 32 vCPU has been requested (free; new accounts can take hours to days). Check it:
```bash
AWS_PROFILE=vidflow aws service-quotas list-requested-service-quota-change-history-by-quota --service-code fargate --quota-code L-3032A538 --region ap-south-1 --query 'RequestedQuotas[0].[Status,DesiredValue]' --output text
AWS_PROFILE=vidflow aws service-quotas get-service-quota --service-code fargate --quota-code L-3032A538 --region ap-south-1 --query 'Quota.Value'
```
Once it is granted, set in `infra/terraform.tfvars` and `terraform apply`:
```hcl
max_concurrent_jobs = 6      # (quota 32 - 0.25) / 4 = 7 jobs fit; 6 leaves headroom
```

## Levers not pulled (and why)
- **Bigger tasks (8 or 16 vCPU):** faster per job but impossible under an 8 vCPU quota, and the cost per job stays about the same. Revisit after the quota increase.
- **GPU (NVENC):** much faster encode, but a GPU instance takes ~5-8 minutes to start from zero, so for short clips the *total* time would be worse. It pays off for long videos or bursts, and it needs the G/VT quota (still 0).
- **Capping 60 fps sources at 30 fps for the small renditions:** would trim a little more but changes how videos look; left as is.
- **Keeping a worker warm to skip the 17 s cold start:** costs money while idle; not worth it at this scale.
