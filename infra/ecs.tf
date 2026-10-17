resource "aws_ecs_cluster" "gpu" {
  name = local.cluster
}

# --- Launch template + ASG. MinSize 0 is what makes idle cost zero.
resource "aws_launch_template" "gpu" {
  name_prefix   = "${local.cluster}-"
  image_id      = data.aws_ssm_parameter.ecs_gpu_ami.value
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.instance.arn
  }

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.gpu_instances.id]
    delete_on_termination       = true
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.root_volume_gb
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # IMDSv2 only
  }

  # Image pulls of the CUDA image are large; the agent defaults (1m inactivity / 3m start) are too tight.
  user_data = base64encode(<<-EOT
    #!/bin/bash
    cat <<'EOF' >> /etc/ecs/ecs.config
    ECS_CLUSTER=${aws_ecs_cluster.gpu.name}
    ECS_ENABLE_GPU_SUPPORT=true
    ECS_IMAGE_PULL_INACTIVITY_TIMEOUT=5m
    ECS_CONTAINER_START_TIMEOUT=10m
    EOF
  EOT
  )

  # provider default_tags do not reach instances launched by the ASG; tag them so teardown/cost filters can
  # select VidFlow's instances (and never another project's ECS instances in the same account).
  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${local.cluster}-instance", Project = "vidflow", Stack = "gpu-transcoding" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Project = "vidflow", Stack = "gpu-transcoding" }
  }
}

resource "aws_autoscaling_group" "gpu" {
  name_prefix           = "${local.cluster}-"
  min_size              = 0
  max_size              = var.asg_max_size
  vpc_zone_identifier   = local.subnet_ids
  health_check_type     = "EC2"
  force_delete          = true # lets `terraform destroy` remove the ASG while instances are still draining
  protect_from_scale_in = true # required for the capacity provider's managed termination protection
  enabled_metrics       = ["GroupInServiceInstances", "GroupDesiredCapacity"]

  launch_template {
    id      = aws_launch_template.gpu.id
    version = aws_launch_template.gpu.latest_version
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }

  lifecycle {
    # ECS managed scaling owns desired capacity; Terraform must not reset it to 0 mid-job on every apply.
    ignore_changes = [desired_capacity]
  }
}

resource "aws_ecs_capacity_provider" "gpu" {
  name = "${local.cluster}-cp"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.gpu.arn
    managed_termination_protection = "ENABLED" # never terminate an instance that is running a task
    managed_draining               = "ENABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = var.managed_scaling_target_capacity
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = var.asg_max_size
      instance_warmup_period    = var.instance_warmup_seconds
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "gpu" {
  cluster_name       = aws_ecs_cluster.gpu.name
  capacity_providers = [aws_ecs_capacity_provider.gpu.name]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.gpu.name
    weight            = 1
  }
}

# --- Task definition: EC2 launch type, bridge networking, exactly one GPU.
resource "aws_ecs_task_definition" "transcoder" {
  family                   = "${var.name_prefix}-transcoder-gpu"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge"
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "video-transcoder" # the server overrides env by this container name
    image     = local.image
    essential = true
    cpu       = var.task_cpu_units
    memory    = var.task_memory_mib

    resourceRequirements = [{ type = "GPU", value = "1" }]

    # Do NOT set NVIDIA_VISIBLE_DEVICES here: ECS reserves it when resourceRequirements has a GPU and rejects the
    # task definition (it injects the id of the GPU it assigned). NVIDIA_DRIVER_CAPABILITIES=compute,video,utility
    # comes from the image's ENV (ecs-task/Dockerfile.gpu).
    environment = [
      { name = "TRANSCODE_MODE", value = "gpu" },
      { name = "AWS_REGION", value = var.region },
      { name = "TEMP_S3_BUCKET_NAME", value = var.temp_bucket_name },
      { name = "FINAL_S3_BUCKET_NAME", value = var.final_bucket_name },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.transcoder.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "transcoder"
      }
    }
  }])
}
