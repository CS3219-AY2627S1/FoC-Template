locals {
  # Keys match ECR repositories, secret outputs, Cloud Map names and build contexts.
  services = {
    ui               = { port = 80, public_port = 80, cpu = 256, memory = 512 }
    internal-gateway = { port = 80, public_port = null, cpu = 256, memory = 512 }
    user             = { port = 5005, public_port = 5005, cpu = 256, memory = 512 }
    supplier         = { port = 3001, public_port = 3001, cpu = 256, memory = 512 }
    credit           = { port = 3002, public_port = 3002, cpu = 256, memory = 512 }
    order            = { port = 3002, public_port = 3003, cpu = 256, memory = 512 }
  }
  backend_names    = toset(["user", "supplier", "credit", "order"])
  runtime_services = var.deploy_runtime ? local.services : {}
  running_services = var.deploy_runtime && var.start_services ? local.services : {}
  public_services  = { for key, config in local.runtime_services : key => config if config.public_port != null }
  runtime_backends = var.deploy_runtime ? local.backend_names : toset([])
  scaling_enabled  = var.deploy_runtime && var.start_services && var.autoscaling_enabled
  namespace        = "${var.project_name}.internal"
  gateway_url      = "http://internal-gateway.${local.namespace}"
  secret_keys = {
    user     = ["DATABASE_URL", "RABBITMQ_URL", "ACCESS_TOKEN_SECRET", "INITIAL_ADMIN_USERNAME", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD"]
    supplier = ["DATABASE_URL", "RABBITMQ_URL"]
    credit   = ["DATABASE_URL", "RABBITMQ_URL"]
    order    = ["DATABASE_URL", "RABBITMQ_URL"]
  }
}
