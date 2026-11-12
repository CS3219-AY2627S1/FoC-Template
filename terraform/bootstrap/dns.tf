# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# Your domain's DNS (Route 53 hosted zone) and the TLS certificate for the API.
#
# These live in bootstrap, not infra, because they must survive `terraform destroy` of infra:
#   - a recreated hosted zone gets NEW nameservers, so you'd have to update your registrar again
#     (and wait for DNS to catch up) after every teardown;
#   - certificate validation also waits on that DNS.
# Cost: USD 0.50/month for the zone; ACM certificates are free.
#
# One-time setup after the first apply (the domain was bought outside this AWS account):
#   terraform output name_servers  ->  set these 4 as your domain's nameservers at your registrar.
# From then on Route 53 answers for the domain, ACM sees its validation record, and the certificate
# turns ISSUED by itself (usually minutes, up to a few hours while DNS changes spread).

resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "${var.project}: managed by terraform/bootstrap"
}

# --- Certificate for the API (used by the ALB) -----------------------------------------------------
# ACM proves you control the domain by asking for a specific DNS record ("DNS validation").
# Terraform creates that record in the zone above, so renewal is automatic as long as it stays.
resource "aws_acm_certificate" "api" {
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.api.domain_validation_options : option.domain_name => option
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 300

  allow_overwrite = true
}

# No aws_acm_certificate_validation resource on purpose: it would make `terraform apply` wait (up
# to 75 minutes) until your registrar points at Route 53. ACM keeps checking on its own for 72 hours.
# Check: aws acm describe-certificate --certificate-arn <arn> --query Certificate.Status
