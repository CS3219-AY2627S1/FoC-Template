# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

output "state_bucket" {
  description = "Name of the S3 bucket holding Terraform state."
  value       = aws_s3_bucket.state.bucket
}

output "backend_hcl" {
  description = "Paste this into terraform/infra/backend.hcl."
  value       = <<-EOT
    bucket       = "${aws_s3_bucket.state.bucket}"
    key          = "${var.project}/infra.tfstate"
    region       = "${var.aws_region}"
    encrypt      = true
    use_lockfile = true
  EOT
}

output "name_servers" {
  description = "Set these as your domain's nameservers at your registrar (one-time)."
  value       = aws_route53_zone.main.name_servers
}

output "hosted_zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "api_hostname" {
  description = "Put this in k8s/domain.yaml (apiHost)."
  value       = aws_acm_certificate.api.domain_name
}

output "api_certificate_arn" {
  value = aws_acm_certificate.api.arn
}
