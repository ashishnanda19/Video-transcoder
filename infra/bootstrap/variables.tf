variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "bootstrap_profile" {
  type        = string
  default     = null
  description = "Admin AWS CLI profile used for this one-time bootstrap. null = default chain."
}

variable "allowed_account_ids" {
  type    = list(string)
  default = []
}

variable "name_prefix" {
  type        = string
  default     = "vidflow"
  description = "Prefix of every VidFlow resource name. The deploy policy only allows resources with this prefix."
}

variable "deploy_user_name" {
  type    = string
  default = "vidflow-deploy"
}

variable "server_iam_user_name" {
  type        = string
  default     = "vidflow-server"
  description = "Must equal infra/ server_iam_user_name. The only IAM user the deploy identity may manage."
}

variable "temp_bucket_name" {
  type        = string
  default     = "video-transcoder-temp-ashish"
  description = "Must equal infra/ temp_bucket_name."
}

variable "final_bucket_name" {
  type        = string
  default     = "video-transcoder-final-ashish"
  description = "Must equal infra/ final_bucket_name."
}

variable "lambda_name_prefix" {
  type    = string
  default = "video-transcoder"
}

variable "protected_prefixes" {
  type        = list(string)
  default     = ["aegis"]
  description = "Name prefixes of OTHER projects in this account. The deploy identity gets an explicit Deny on their IAM, S3, ECS, ECR, Lambda, Logs, SNS, CloudWatch and Auto Scaling resources (a Deny beats any Allow)."
}
