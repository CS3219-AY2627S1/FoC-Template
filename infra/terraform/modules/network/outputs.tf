output "public_subnet_id" {
  description = "Public subnet for ECS hosts."
  value       = aws_subnet.public.id

  depends_on = [aws_route.internet, aws_route_table_association.public]
}

output "database_subnet_ids" {
  description = "Private subnets for the PostgreSQL subnet group."
  value       = [for subnet in aws_subnet.database : subnet.id]
}

output "compute_security_group_id" {
  description = "Security group for ECS hosts and the public gateway."
  value       = aws_security_group.compute.id

  depends_on = [
    aws_vpc_security_group_egress_rule.compute,
    aws_vpc_security_group_ingress_rule.web,
    aws_vpc_security_group_ingress_rule.ecs_ports
  ]
}

output "database_security_group_id" {
  description = "Security group allowing PostgreSQL from ECS hosts."
  value       = aws_security_group.database.id
}

output "eip_allocation_id" {
  description = "Allocation ID of the gateway Elastic IP."
  value       = aws_eip.gateway.id
}

output "elastic_ip" {
  description = "Public address associated with the gateway host."
  value       = aws_eip.gateway.public_ip
}

output "service_connect_namespace_arn" {
  description = "Cloud Map namespace ARN for ECS Service Connect."
  value       = aws_service_discovery_private_dns_namespace.app.arn
}
