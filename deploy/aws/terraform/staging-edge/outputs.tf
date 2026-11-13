output "cloudfront_url" {
  value       = "https://${aws_cloudfront_distribution.gateway.domain_name}"
  description = "Single HTTPS entry point for Friend on Campus staging."
}

output "cloudfront_distribution_id" { value = aws_cloudfront_distribution.gateway.id }

output "origin_alb_arn" { value = var.alb_arn }

output "origin_alb_dns_name" { value = var.alb_dns_name }
