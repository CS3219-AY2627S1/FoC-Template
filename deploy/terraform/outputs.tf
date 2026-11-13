output "aws_region" {
  value = var.aws_region
}

output "ecr_repository_urls" {
  description = "Publish the same unique linux/amd64 release tag to all repositories."
  value       = { for key, repo in aws_ecr_repository.service : key => repo.repository_url }
}

output "secret_arns" {
  description = "Populate these with per-service JSON values outside Terraform before starting tasks."
  value       = { for key, secret in aws_secretsmanager_secret.service : key => secret.arn }
}

output "cluster_name" {
  value = var.deploy_runtime ? aws_ecs_cluster.demo[0].name : null
}

output "service_names" {
  value = { for key, service in aws_ecs_service.app : key => service.name }
}

output "alb_url" {
  value = var.deploy_runtime ? "http://${aws_lb.public[0].dns_name}" : null
}

output "documentation_urls" {
  value = var.deploy_runtime ? {
    for key in local.backend_names : key => "http://${aws_lb.public[0].dns_name}:${local.services[key].public_port}/docs"
  } : {}
}

output "rabbitmq_endpoint" {
  description = "Private AMQPS endpoint, without credentials. Append a URL-encoded vhost as described in the runbook."
  value       = var.deploy_runtime ? aws_mq_broker.demo[0].instances[0].endpoints[0] : null
}

output "dashboard_name" {
  value = var.deploy_runtime ? aws_cloudwatch_dashboard.demo[0].dashboard_name : null
}
