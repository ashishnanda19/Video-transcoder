output "deploy_user" {
  value = aws_iam_user.deploy.name
}

output "deploy_user_arn" {
  value = aws_iam_user.deploy.arn
}

output "policy_sizes" {
  value       = local.policy_sizes
  description = "Characters used of the 6144 limit per managed policy."
}

output "next_step" {
  value = "Run ./create-profile.sh (with the admin profile) to mint the access key and write the 'vidflow' AWS CLI profile. The key never enters Terraform state."
}
