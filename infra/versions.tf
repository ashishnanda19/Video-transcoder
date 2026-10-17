terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = "vidflow"
      Stack   = "gpu-transcoding"
    }
  }
}

# Billing metrics only exist in us-east-1, whatever region the workload runs in.
provider "aws" {
  alias  = "billing"
  region = "us-east-1"
}
