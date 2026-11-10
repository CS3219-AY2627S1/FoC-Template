# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/global/github-oidc), drafted and edited with Claude Code.
# Reviewed by Don Lee

output "ci_role_arn" {
  description = "GitHub repo variable AWS_ROLE_ARN."
  value       = aws_iam_role.ci.arn
}

output "ci_role_name" {
  value = aws_iam_role.ci.name
}
