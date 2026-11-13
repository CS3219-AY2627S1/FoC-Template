output "github_infra_role_arn" {
  value       = aws_iam_role.github_infra.arn
  description = "Configure as the AWS_INFRA_ROLE_ARN GitHub repository variable."
}

output "github_deploy_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "Configure as the AWS_DEPLOY_ROLE_ARN GitHub repository variable."
}

output "aws_account_id" {
  value = data.aws_caller_identity.current.account_id
}
