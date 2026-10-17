# The whole app on ONE https address: one small Fargate task serves both the API (/api/v1/*) and the static UI
# (built into the container image). It is reached privately through an API Gateway VPC link (no load balancer, no
# public inbound port), so the only public thing is API Gateway's TLS endpoint.
#
#   browser -> API Gateway (HTTP API, TLS) -> VPC link -> Cloud Map -> Fargate task :8000 (UI + API)
#
# Same origin => first-party cookies and no CORS. A CDN (CloudFront) can be put in front later; new AWS accounts must be
# verified by AWS Support before they may create CloudFront distributions, which this account has not been yet.

locals {
  api_name   = "${var.name_prefix}-api"
  ssm_prefix = "/${var.name_prefix}/prod"
  # Secrets are NOT in Terraform: scripts/put-secrets.sh stores them in SSM Parameter Store (SecureString) and the task
  # reads them at start-up. Terraform only knows their names.
  api_secret_names = ["MONGO_URI", "REDIS_URL", "SESSION_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "WEBHOOK_SECRET"]
  ssm_arn_prefix   = "arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}"
  # Direct address of the API (server-to-server: the upload Lambda and the transcoding containers call this one).
  api_url = aws_apigatewayv2_api.api.api_endpoint # https://<id>.execute-api.<region>.amazonaws.com
  # What people type in their browser: the API address itself, or e.g. the Vercel site that proxies /api to it.
  public_url = var.public_site_url != "" ? trimsuffix(var.public_site_url, "/") : local.api_url
}

resource "aws_ecr_repository" "api" {
  name         = local.api_name
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 5 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.api_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "api" {
  name = local.api_name
}

# --- IAM: the task role is what the server code may do (launch jobs, presign S3); no static keys anywhere.
resource "aws_iam_role" "api_execution" {
  name               = "${local.api_name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "api_execution" {
  role       = aws_iam_role.api_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "api_execution_secrets" {
  statement {
    sid       = "ReadVidflowSecrets"
    actions   = ["ssm:GetParameters", "ssm:GetParameter"]
    resources = ["${local.ssm_arn_prefix}/*"]
  }
  statement {
    sid       = "DecryptSecureStrings"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "api_execution_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.api_execution.id
  policy = data.aws_iam_policy_document.api_execution_secrets.json
}

resource "aws_iam_role" "api_task" {
  name               = "${local.api_name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "api_task_server" {
  role       = aws_iam_role.api_task.name
  policy_arn = aws_iam_policy.server.arn
}

# --- Network: nothing from the internet can reach the task; only the VPC link can, on one port.
resource "aws_security_group" "vpc_link" {
  name        = "${local.api_name}-vpclink"
  description = "API Gateway VPC link"
  vpc_id      = data.aws_subnet.first.vpc_id

  egress {
    description = "to the API tasks inside the VPC"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }
}

resource "aws_security_group" "api" {
  name        = "${local.api_name}-tasks"
  description = "VidFlow API tasks: inbound only from the API Gateway VPC link"
  vpc_id      = data.aws_subnet.first.vpc_id

  ingress {
    description     = "from the VPC link"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.vpc_link.id]
  }

  egress {
    description = "MongoDB Atlas, Upstash, AWS APIs"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_service_discovery_private_dns_namespace" "api" {
  name = "${var.name_prefix}.internal"
  vpc  = data.aws_subnet.first.vpc_id
}

resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.api.id
    routing_policy = "MULTIVALUE"
    dns_records {
      ttl  = 10
      type = "SRV" # the SRV record carries the port the VPC link connects to
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# --- The service
resource "aws_ecs_task_definition" "api" {
  family                   = local.api_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.api_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.api.repository_url}:latest"
    essential = true

    portMappings = [{ containerPort = 8000, protocol = "tcp" }]

    environment = concat(
      [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "8000" },
        { name = "AWS_REGION", value = var.region },
        { name = "PUBLIC_URL", value = local.public_url },
        # containers call the API directly (not through the Vercel proxy)
        { name = "WEBHOOK_URL", value = "${local.api_url}/api/v1/video/ecs-trigger" },
        { name = "TEMP_S3_BUCKET_NAME", value = aws_s3_bucket.temp.bucket },
        { name = "FINAL_S3_BUCKET_NAME", value = aws_s3_bucket.final.bucket },
        { name = "TRANSCODE_MODE", value = var.transcode_mode },
        # CPU / Fargate transcoding
        { name = "CLUSTER", value = aws_ecs_cluster.cpu.name },
        { name = "TASK", value = aws_ecs_task_definition.transcoder_cpu.family },
        { name = "ECS_SUBNETS", value = join(",", local.subnet_ids) },
        { name = "ECS_SECURITY_GROUP", value = aws_security_group.fargate.id },
        # GPU transcoding (used when TRANSCODE_MODE=gpu)
        { name = "GPU_CLUSTER", value = aws_ecs_cluster.gpu.name },
        { name = "GPU_TASK", value = aws_ecs_task_definition.transcoder.family },
        { name = "GPU_CAPACITY_PROVIDER", value = aws_ecs_capacity_provider.gpu.name },
        { name = "GPU_ASG_MAX_SIZE", value = tostring(var.asg_max_size) },
        # who may sign in, and per-user limits
        { name = "ALLOWED_EMAILS", value = join(",", var.allowed_emails) },
        { name = "ALLOWED_EMAIL_DOMAINS", value = join(",", var.allowed_email_domains) },
        { name = "ALLOW_ANYONE", value = tostring(var.allow_anyone) },
        { name = "GLOBAL_DAILY_UPLOADS", value = tostring(var.global_daily_uploads) },
        { name = "RETENTION_DAYS", value = tostring(var.retention_days) },
        { name = "USER_MAX_ACTIVE_JOBS", value = tostring(var.user_max_active_jobs) },
        { name = "USER_DAILY_UPLOADS", value = tostring(var.user_daily_uploads) },
      ],
    )

    secrets = [for n in local.api_secret_names : { name = n, valueFrom = "${local.ssm_arn_prefix}/${n}" }]

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:8000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = local.api_name
  cluster         = aws_ecs_cluster.api.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  # Roll out a new version next to the old one; automatically roll back if it never becomes healthy.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.subnet_ids
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true # outbound only (no NAT gateway); inbound is blocked by the security group
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.api.arn
    container_name = "api"
    container_port = 8000
  }

  wait_for_steady_state = var.api_desired_count > 0

  depends_on = [aws_iam_role_policy.api_execution_secrets, aws_iam_role_policy_attachment.api_execution]
}

# --- API Gateway: public HTTPS endpoint (CloudFront's origin) -> VPC link -> the task
resource "aws_apigatewayv2_api" "api" {
  name          = local.api_name
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_vpc_link" "api" {
  name               = local.api_name
  security_group_ids = [aws_security_group.vpc_link.id]
  subnet_ids         = local.subnet_ids
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = aws_service_discovery_service.api.arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.api.id
  payload_format_version = "1.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "root" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  # A ceiling against floods. A page load fetches a few dozen small static files at once, so leave room for that.
  default_route_settings {
    throttling_burst_limit = 400
    throttling_rate_limit  = 200
  }
}
