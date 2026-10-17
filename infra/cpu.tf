# The original CPU path (Fargate + libx264), kept as the rollback target for TRANSCODE_MODE=cpu.
# Uses the same task role as the GPU task, so the container needs no static AWS keys.

resource "aws_ecr_repository" "cpu" {
  name         = "${var.name_prefix}-transcoder-cpu"
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "cpu" {
  repository = aws_ecr_repository.cpu.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 5 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "cpu" {
  name              = "/ecs/${var.name_prefix}-cpu"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "cpu" {
  name = "${var.name_prefix}-cpu"
}

resource "aws_ecs_task_definition" "transcoder_cpu" {
  family                   = "${var.name_prefix}-transcoder-cpu"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu_task_cpu
  memory                   = var.cpu_task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "video-transcoder"
    image     = "${aws_ecr_repository.cpu.repository_url}:cpu"
    essential = true

    environment = [
      { name = "TRANSCODE_MODE", value = "cpu" },
      { name = "AWS_REGION", value = var.region },
      { name = "TEMP_S3_BUCKET_NAME", value = var.temp_bucket_name },
      { name = "FINAL_S3_BUCKET_NAME", value = var.final_bucket_name },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.cpu.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "transcoder"
      }
    }
  }])
}
