output "cluster_name" {
  value       = aws_ecs_cluster.gpu.name
  description = "Server env: GPU_CLUSTER"
}

output "capacity_provider_name" {
  value       = aws_ecs_capacity_provider.gpu.name
  description = "Server env: GPU_CAPACITY_PROVIDER"
}

output "task_definition_family" {
  value       = aws_ecs_task_definition.transcoder.family
  description = "Server env: GPU_TASK (family or family:revision; the bare family always runs the latest revision)"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.gpu.repository_url
  description = "Push the GPU image here, tag 'gpu'."
}

output "asg_name" {
  value = aws_autoscaling_group.gpu.name
}

output "log_group" {
  value = aws_cloudwatch_log_group.transcoder.name
}

output "temp_bucket" {
  value = aws_s3_bucket.temp.bucket
}

output "final_bucket" {
  value = aws_s3_bucket.final.bucket
}

output "lambda_function" {
  value = aws_lambda_function.upload_trigger.function_name
}

output "server_iam_user" {
  value       = aws_iam_user.server.name
  description = "Create its key: aws iam create-access-key --user-name <this>"
}

output "cpu_ecr_repository_url" {
  value       = aws_ecr_repository.cpu.repository_url
  description = "Push the CPU (Fargate) image here, tag 'cpu'."
}

# Everything the Render service needs, in one place.
output "server_env" {
  description = "Render environment variables (secrets such as the IAM access key are NOT included)."
  value = {
    TRANSCODE_MODE        = "gpu"
    TEMP_S3_BUCKET_NAME   = aws_s3_bucket.temp.bucket
    FINAL_S3_BUCKET_NAME  = aws_s3_bucket.final.bucket
    GPU_CLUSTER           = aws_ecs_cluster.gpu.name
    GPU_TASK              = aws_ecs_task_definition.transcoder.family
    GPU_CAPACITY_PROVIDER = aws_ecs_capacity_provider.gpu.name
    GPU_ASG_MAX_SIZE      = tostring(var.asg_max_size)
    CLUSTER               = aws_ecs_cluster.cpu.name
    TASK                  = aws_ecs_task_definition.transcoder_cpu.family
    ECS_SUBNETS           = join(",", local.subnet_ids)
    ECS_SECURITY_GROUP    = aws_security_group.fargate.id
    AWS_REGION            = var.region
  }
}
