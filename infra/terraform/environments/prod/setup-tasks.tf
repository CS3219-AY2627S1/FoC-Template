locals {
  admin_task_definition = {
    family                  = "${var.name_prefix}-admin-init"
    requiresCompatibilities = ["EC2"]
    networkMode             = "bridge"
    executionRoleArn        = module.ecs.bootstrap_execution_role_arn
    taskRoleArn             = module.ecs.task_role_arns["user"]
    volumes = [for name, volume in local.services.user.volumes : {
      name = name, host = { sourcePath = volume.host_path }
    }]
    containerDefinitions = [{
      name      = "admin-init"
      essential = true
      cpu       = local.services.user.cpu
      memory    = local.services.user.memory
      mountPoints = [for name, volume in local.services.user.volumes : {
        sourceVolume = name, containerPath = volume.container_path, readOnly = true
      }]
      environment = [for name, value in merge(local.services.user.environment, {
        SPRING_PROFILES_ACTIVE                 = "prod,admin-init"
        MANAGEMENT_OTLP_METRICS_EXPORT_ENABLED = "false"
        MANAGEMENT_TRACING_ENABLED             = "false"
        INITIAL_ADMIN_NAME                     = "System Administrator"
      }) : { name = name, value = value }]
      secrets = [
        { name = "SPRING_DATASOURCE_PASSWORD", valueFrom = "${local.parameter_arn}-database-user" },
        { name = "INITIAL_ADMIN_EMAIL", valueFrom = "${local.parameter_arn}-initial-admin-email" },
        { name = "INITIAL_ADMIN_PASSWORD", valueFrom = "${local.parameter_arn}-initial-admin-password" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = module.ecs.bootstrap_log_group
          awslogs-region        = local.region
          awslogs-stream-prefix = "admin-init"
        }
      }
    }]
  }

  supplier_seed_task_definition = {
    family                  = "${var.name_prefix}-supplier-seed"
    requiresCompatibilities = ["EC2"]
    networkMode             = "bridge"
    executionRoleArn        = module.ecs.bootstrap_execution_role_arn
    taskRoleArn             = module.ecs.task_role_arns["supplier"]
    containerDefinitions = [{
      name      = "supplier-seed"
      essential = true
      cpu       = local.services.supplier.cpu
      memory    = local.services.supplier.memory
      environment = [for name, value in merge(local.services.supplier.environment, {
        SPRING_PROFILES_ACTIVE                 = "prod,supplier-seed"
        MANAGEMENT_OTLP_METRICS_EXPORT_ENABLED = "false"
        MANAGEMENT_TRACING_ENABLED             = "false"
      }) : { name = name, value = value }]
      secrets = [{ name = "SPRING_DATASOURCE_PASSWORD", valueFrom = "${local.parameter_arn}-database-supplier" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = module.ecs.bootstrap_log_group
          awslogs-region        = local.region
          awslogs-stream-prefix = "supplier-seed"
        }
      }
    }]
  }
}
