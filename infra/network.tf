# Outbound only. Tasks run in bridge mode on the instance, so they egress through the instance's public IP
# (awsvpc tasks on EC2 cannot get a public IP and would need a ~$32/month NAT gateway).
resource "aws_security_group" "gpu_instances" {
  name        = "${local.cluster}-instances"
  description = "VidFlow GPU ECS instances: no inbound, all outbound"
  vpc_id      = data.aws_subnet.first.vpc_id

  egress {
    description = "S3, ECR, CloudWatch, webhook"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Fargate (CPU rollback path) tasks: outbound only, public IP assigned by RunTask.
resource "aws_security_group" "fargate" {
  name        = "${var.name_prefix}-cpu-tasks"
  description = "VidFlow Fargate CPU tasks: no inbound, all outbound"
  vpc_id      = data.aws_subnet.first.vpc_id

  egress {
    description = "S3, ECR, CloudWatch, webhook"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
