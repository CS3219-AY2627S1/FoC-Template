module "images" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "5.16.1"

  for_each = var.image_bucket_names
  bucket   = each.value

  control_object_ownership              = true
  attach_deny_insecure_transport_policy = true
  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = { sse_algorithm = "AES256" }
    }
  }
}

resource "aws_iam_policy" "service_images" {
  for_each = module.images
  name     = "${var.name_prefix}-${each.key}-images"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = "${each.value.s3_bucket_arn}/*"
    }]
  })
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = "100"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.acme_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.acme_email]
  }
}

module "network" {
  source      = "../../modules/network"
  name_prefix = var.name_prefix
}

module "messaging" {
  source              = "../../modules/messaging"
  region              = local.region
  name_prefix         = var.name_prefix
  publisher_names     = local.event_publishers
  consumer_names      = local.event_consumers
  event_subscriptions = local.event_subscriptions
}

module "rds" {
  source                     = "../../modules/rds"
  name_prefix                = var.name_prefix
  db_instance_class          = var.db_instance_class
  database_subnet_ids        = module.network.database_subnet_ids
  database_security_group_id = module.network.database_security_group_id
}

module "ecs" {
  source = "../../modules/ecs"

  region             = local.region
  name_prefix        = var.name_prefix
  domain_name        = var.domain_name
  acme_email         = var.acme_email
  start_services     = var.start_services
  core_ami_id        = var.core_ami_id
  core_instance_type = var.core_instance_type
  services           = local.services
  execution_parameter_arns = [
    "${local.parameter_arn}-database-*",
    "${local.parameter_arn}-mail-*",
    "${local.parameter_arn}-grafana-*",
    "${local.parameter_arn}-openai-api-key"
  ]
  image_bucket_policy_arns      = { for name, policy in aws_iam_policy.service_images : name => policy.arn }
  public_subnet_id              = module.network.public_subnet_id
  compute_security_group_id     = module.network.compute_security_group_id
  eip_allocation_id             = module.network.eip_allocation_id
  service_connect_namespace_arn = module.network.service_connect_namespace_arn
  topic_arns                    = module.messaging.topic_arns
  queue_arns                    = module.messaging.queue_arns
  messaging_kms_key_arn         = module.messaging.kms_key_arn
  database_host                 = module.rds.address
  database_master_secret_arn    = module.rds.master_user_secret_arn
  database_bootstrap_sql        = file("${path.module}/../../../scripts/db/bootstrap.sql")
  grafana_cloudwatch_reader     = var.grafana_cloudwatch_reader
}
