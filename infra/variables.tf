variable "region" {
  type        = string
  default     = "ap-south-1"
  description = "Same region as the existing buckets, Lambda and Fargate cluster."
}

variable "name_prefix" {
  type    = string
  default = "vidflow"
}

variable "instance_type" {
  type        = string
  default     = "g4dn.xlarge"
  description = "1x NVIDIA T4 (16 GB), 4 vCPU, 16 GiB. If you change the type, also update task_cpu_units/task_memory_mib and MAX_CONCURRENT_JOBS limits."
}

variable "asg_max_size" {
  type        = number
  default     = 2
  description = "Hard ceiling on GPU instances (and therefore on concurrent GPU jobs: 1 task = 1 GPU = 1 instance on g4dn.xlarge). Needs a matching Service Quota for 'Running On-Demand G and VT instances' (4 vCPU per g4dn.xlarge)."
}

variable "subnet_ids" {
  type        = list(string)
  default     = []
  description = "PUBLIC subnets for the GPU instances (they get a public IP so tasks can reach S3 / the webhook without a NAT gateway). Empty = all subnets of the default VPC."
}

variable "temp_bucket_name" {
  type    = string
  default = "video-transcoder-temp-ashish"
}

variable "final_bucket_name" {
  type    = string
  default = "video-transcoder-final-ashish"
}

variable "container_image" {
  type        = string
  default     = ""
  description = "GPU image URI. Empty = <created ECR repo>:gpu."
}

variable "task_cpu_units" {
  type        = number
  default     = 4096
  description = "ECS CPU units (1024 = 1 vCPU). g4dn.xlarge registers 4096."
}

variable "task_memory_mib" {
  type        = number
  default     = 14336
  description = "Hard memory limit. Must be below what the instance registers (<16384, the OS + ECS agent reserve some). Verify with: aws ecs describe-container-instances ... registeredResources."
}

variable "root_volume_gb" {
  type        = number
  default     = 100
  description = "Scratch space for the downloaded source + 4 outputs. Deleted with the instance."
}

variable "managed_scaling_target_capacity" {
  type        = number
  default     = 100
  description = "100 = pack instances fully; with no tasks the reservation metric is 0 and ECS scales the ASG to MinSize (0)."
}

variable "instance_warmup_seconds" {
  type    = number
  default = 300
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "alarm_email" {
  type        = string
  default     = ""
  description = "Email for cost / forgotten-instance alarms. Empty = no alarms or SNS topic are created. Confirm the subscription email AWS sends."
}

variable "billing_alarm_usd" {
  type        = number
  default     = 50
  description = "Alarm when month-to-date estimated charges exceed this. Requires 'Receive Billing Alerts' enabled in the account's Billing preferences."
}

variable "instance_running_alarm_hours" {
  type        = number
  default     = 3
  description = "Alarm if at least one GPU instance has been in service for this many consecutive hours (likely a stuck job or leaked task)."
}

variable "server_iam_user_name" {
  type        = string
  default     = "vidflow-server"
  description = "IAM user created for the Express server (Render). Create its access key with the CLI so the secret never enters Terraform state."
}

variable "cors_allowed_origins" {
  type        = list(string)
  default     = ["http://localhost:3000"]
  description = "EXTRA browser origins allowed to PUT uploads / GET videos via presigned URLs (the deployed site is always allowed)."
}

variable "lambda_api_endpoint" {
  type        = string
  default     = ""
  description = "Override the URL the upload Lambda calls (e.g. a tunnel for local testing). Empty = the deployed API at <site>/api/v1/video/s3-trigger."
}

variable "temp_upload_expiry_days" {
  type        = number
  default     = 2
  description = "Safety net: uploads left in the temp bucket (failed jobs) are deleted after this many days."
}

variable "final_bucket_force_destroy" {
  type        = bool
  default     = false
  description = "true lets `terraform destroy` delete the final bucket even if it still contains transcoded videos."
}

variable "cpu_task_cpu" {
  type        = number
  default     = 4096
  description = "Fargate vCPU units for the CPU rollback path (4 parallel libx264 processes)."
}

variable "cpu_task_memory" {
  type        = number
  default     = 8192
  description = "Fargate memory (MiB) for the CPU rollback path. Must be a valid pair with cpu_task_cpu."
}

# ---- Isolation from other projects sharing this AWS account
variable "aws_profile" {
  type        = string
  default     = null
  description = "AWS CLI profile dedicated to VidFlow (e.g. `vidflow`). null = default credential chain / AWS_PROFILE."
}

variable "allowed_account_ids" {
  type        = list(string)
  default     = []
  description = "If set, Terraform refuses to run against any other AWS account."
}

variable "forbidden_identity_substrings" {
  type        = list(string)
  default     = ["aegis"]
  description = "Terraform refuses to run if the calling IAM identity's ARN contains any of these (credentials that belong to another project)."
}

variable "allow_shared_deploy_identity" {
  type        = bool
  default     = false
  description = "Escape hatch: deploy even though the caller matches forbidden_identity_substrings. Leave false; use a vidflow-only profile."
}

# ---- Going live
variable "api_desired_count" {
  type        = number
  default     = 0
  description = "Number of API tasks. Keep 0 until the secrets exist in SSM (scripts/put-secrets.sh), then set 1."
}

variable "allowed_emails" {
  type        = list(string)
  default     = []
  description = "Google accounts allowed to sign in. Empty + no domains = nobody can (fails closed)."
}

variable "allowed_email_domains" {
  type        = list(string)
  default     = []
  description = "Whole email domains allowed to sign in (e.g. [\"example.com\"])."
}

variable "transcode_mode" {
  type        = string
  default     = "cpu"
  description = "cpu = Fargate, gpu = the GPU capacity provider (needs the G/VT quota and the GPU image)."

  validation {
    condition     = contains(["cpu", "gpu"], var.transcode_mode)
    error_message = "transcode_mode must be cpu or gpu."
  }
}

variable "user_max_active_jobs" {
  type        = number
  default     = 3
  description = "Videos one user may have in progress at once."
}

variable "user_daily_uploads" {
  type        = number
  default     = 20
  description = "Uploads one user may start per rolling 24 hours."
}
