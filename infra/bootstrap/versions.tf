terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

# Run this root ONCE with an administrator identity (an identity that can create IAM users). It is the only step
# that needs more than the VidFlow deploy identity; everything after it runs as vidflow-deploy.
provider "aws" {
  region              = var.region
  profile             = var.bootstrap_profile
  allowed_account_ids = length(var.allowed_account_ids) > 0 ? var.allowed_account_ids : null

  default_tags {
    tags = {
      Project = "vidflow"
      Stack   = "bootstrap"
    }
  }
}
