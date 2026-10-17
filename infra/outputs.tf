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

output "server_runtask_policy_arn" {
  value       = aws_iam_policy.server_runtask.arn
  description = "Attach to the IAM user whose keys the Express server uses (or set server_iam_user_name)."
}

output "log_group" {
  value = aws_cloudwatch_log_group.transcoder.name
}
