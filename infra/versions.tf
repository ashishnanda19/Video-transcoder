terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
  # Refuse to run against any other account (set to your VidFlow account id).
  allowed_account_ids = length(var.allowed_account_ids) > 0 ? var.allowed_account_ids : null

  default_tags {
    tags = {
      Project = "vidflow"
      Stack   = "gpu-transcoding"
    }
  }
}

# Billing metrics only exist in us-east-1, whatever region the workload runs in.
provider "aws" {
  alias               = "billing"
  region              = "us-east-1"
  profile             = var.aws_profile
  allowed_account_ids = length(var.allowed_account_ids) > 0 ? var.allowed_account_ids : null
}
