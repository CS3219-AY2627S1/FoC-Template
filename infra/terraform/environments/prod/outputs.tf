output "image_bucket_names" {
  description = "FOC_USER_BUCKET, FOC_SUPPLIER_BUCKET and FOC_ORDER_BUCKET runtime values."
  value       = { for service, bucket in module.images : service => bucket.s3_bucket_id }
}

output "service_policy_arns" {
  description = "Each service policy is attached only to its owning ECS task role."
  value       = { for name, policy in aws_iam_policy.service_images : name => policy.arn }
}

output "deployment" {
  description = "Non-secret identifiers for release and operations."
  value = {
    setup_tasks = {
      admin-init    = { service = "user", task_definition = local.admin_task_definition }
      supplier-seed = { service = "supplier", task_definition = local.supplier_seed_task_definition }
    }
    desired_count               = var.start_services ? 1 : 0
    bootstrap_tasks             = module.ecs.bootstrap_task_arns
    bootstrap_log_group         = module.ecs.bootstrap_log_group
    databases                   = module.ecs.databases
    task_definitions            = module.ecs.task_definition_arns
    region                      = local.region
    cluster                     = module.ecs.cluster_name
    elastic_ip                  = module.network.elastic_ip
    database_host               = module.rds.address
    database_master_secret_arn  = module.rds.master_user_secret_arn
    configuration_bucket        = module.ecs.configuration_bucket
    repositories                = module.ecs.repository_urls
    core_capacity_provider      = module.ecs.core_capacity_provider
    parameter_prefix            = module.ecs.parameter_prefix
    grafana_cloudwatch_role_arn = module.ecs.grafana_cloudwatch_role_arn
    queues                      = module.messaging.queue_urls
    queue_names                 = module.messaging.queue_names
    topics                      = module.messaging.topic_arns
  }
}

locals {
  required_parameter_arns = concat(
    flatten([for service in values(local.services) : values(service.secrets)]),
    [for secret in local.admin_task_definition.containerDefinitions[0].secrets : secret.valueFrom]
  )
  required_parameter_names = setunion(
    toset([for arn in local.required_parameter_arns : split(":parameter/", arn)[1]]),
    toset(["${var.name_prefix}-jwt-private-key", "${var.name_prefix}-jwt-public-key"])
  )
  generated_database_parameters = toset([for name in keys(local.database_services) : "${var.name_prefix}-database-${name}"])
}

output "required_ssm_parameters" {
  description = "Externally supplied parameters; database setup owns database passwords."
  value       = sort(tolist(setsubtract(local.required_parameter_names, local.generated_database_parameters)))
}
