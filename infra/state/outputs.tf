# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/state), drafted and edited with Claude Code.
# Reviewed by Don Lee

output "bucket" {
  description = "Pass to every cloud root: terraform init -backend-config=\"bucket=<this>\"."
  value       = aws_s3_bucket.state.bucket
}
