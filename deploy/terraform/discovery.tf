resource "aws_service_discovery_private_dns_namespace" "demo" {
  count       = var.deploy_runtime ? 1 : 0
  name        = local.namespace
  description = "Private task addresses for the coursework demo"
  vpc         = aws_vpc.demo[0].id
}

resource "aws_service_discovery_service" "app" {
  for_each = local.runtime_services
  name     = each.key
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.demo[0].id
    routing_policy = "MULTIVALUE"
    dns_records {
      ttl  = 10
      type = "A"
    }
  }
  health_check_custom_config {}
}
