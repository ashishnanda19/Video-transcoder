data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# --- EC2 container instance (ECS agent registers the host, pulls images, ships logs)
resource "aws_iam_role" "instance" {
  name               = "${local.cluster}-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "instance_ecs" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

# SSM Session Manager instead of SSH keys / open port 22.
resource "aws_iam_role_policy_attachment" "instance_ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.cluster}-instance"
  role = aws_iam_role.instance.name
}

# --- Task execution role (ECR pull + CloudWatch Logs, used by the agent before the container starts)
resource "aws_iam_role" "task_execution" {
  name               = "${local.cluster}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# --- Task role (what the worker code can do: read the upload, write the outputs; nothing else)
resource "aws_iam_role" "task" {
  name               = "${local.cluster}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task_s3" {
  statement {
    sid       = "ReadUploads"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.temp_bucket_name}/*"]
  }
  statement {
    sid       = "WriteOutputs"
    actions   = ["s3:PutObject"]
    resources = ["arn:aws:s3:::${var.final_bucket_name}/*"]
  }
}

resource "aws_iam_role_policy" "task_s3" {
  name   = "s3-access"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_s3.json
}

# --- What the Express server's IAM user needs to launch GPU tasks (no static creds are created here)
data "aws_iam_policy_document" "server_runtask" {
  statement {
    sid       = "RunGpuTask"
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${var.region}:${local.account_id}:task-definition/${aws_ecs_task_definition.transcoder.family}:*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.gpu.arn]
    }
  }
  statement {
    sid       = "PassTaskRoles"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.task.arn, aws_iam_role.task_execution.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "server_runtask" {
  name   = "${local.cluster}-server-runtask"
  policy = data.aws_iam_policy_document.server_runtask.json
}

resource "aws_iam_user_policy_attachment" "server" {
  count      = var.server_iam_user_name == "" ? 0 : 1
  user       = var.server_iam_user_name
  policy_arn = aws_iam_policy.server_runtask.arn
}
