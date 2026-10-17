data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  subnet_ids = length(var.subnet_ids) > 0 ? var.subnet_ids : data.aws_subnets.default.ids
  account_id = data.aws_caller_identity.current.account_id
  cluster    = "${var.name_prefix}-gpu"
  image      = var.container_image != "" ? var.container_image : "${aws_ecr_repository.gpu.repository_url}:gpu"
}

data "aws_subnet" "first" {
  id = local.subnet_ids[0]
}

# ECS GPU-optimized Amazon Linux 2023 AMI (NVIDIA driver + container runtime preinstalled).
data "aws_ssm_parameter" "ecs_gpu_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/gpu/recommended/image_id"
}

resource "aws_ecr_repository" "gpu" {
  name         = "${var.name_prefix}-transcoder-gpu"
  force_delete = true # `terraform destroy` must not fail on a repo that still holds images

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "gpu" {
  repository = aws_ecr_repository.gpu.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 5 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "transcoder" {
  name              = "/ecs/${local.cluster}"
  retention_in_days = var.log_retention_days
}
