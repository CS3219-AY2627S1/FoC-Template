locals {
  service_connect_proxy_memory = 64
}

# Container limits leave room for the ECS agent and OS on the core host.
# After an OOM, increase both the host size and the affected container limit.

resource "aws_ecs_task_definition" "app" {
  for_each = var.services

  family                   = "${var.name_prefix}-${each.key}"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task[each.key].arn
  skip_destroy             = true
  memory                   = each.value.memory + local.service_connect_proxy_memory

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  dynamic "volume" {
    for_each = each.value.volumes
    content {
      name      = volume.key
      host_path = volume.value.host_path
    }
  }

  container_definitions = jsonencode([{
    name                   = each.key
    image                  = "${aws_ecr_repository.app[each.key].repository_url}:bootstrap"
    essential              = true
    cpu                    = each.value.cpu
    memory                 = each.value.memory
    readonlyRootFilesystem = false
    restartPolicy          = { enabled = true }
    versionConsistency     = "disabled"
    startTimeout           = 30
    stopTimeout            = 30
    portMappings           = [{ name = each.key, containerPort = each.value.port, hostPort = 0, protocol = "tcp" }]
    mountPoints            = [for name, path in each.value.volumes : { sourceVolume = name, containerPath = path.container_path, readOnly = path.read_only }]
    environment            = [for name, value in each.value.environment : { name = name, value = value }]
    secrets                = [for name, arn in each.value.secrets : { name = name, valueFrom = arn }]
    healthCheck = {
      command     = ["CMD-SHELL", "curl -fsS http://localhost:${each.value.port}${each.value.health_path} || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 120
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
        mode                  = "non-blocking"
        max-buffer-size       = "1m"
      }
    }
  }])

}

resource "aws_ecs_service" "app" {
  for_each                           = var.services
  name                               = each.key
  cluster                            = aws_ecs_cluster.app.id
  task_definition                    = aws_ecs_task_definition.app[each.key].arn
  desired_count                      = var.start_services ? 1 : 0
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.host.name
    weight            = 1
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_connect_namespace_arn

    service {
      port_name      = each.key
      discovery_name = each.key
      client_alias {
        port     = each.value.port
        dns_name = each.key
      }
    }

    log_configuration {
      log_driver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "service-connect"
      }
    }
  }

  depends_on = [aws_ecs_cluster_capacity_providers.app, aws_iam_role_policy.secrets, aws_iam_role_policy.messaging]

  lifecycle { ignore_changes = [task_definition, desired_count] }
}

resource "aws_ecs_task_definition" "gateway" {
  # Keep previous revisions available for ECS circuit-breaker rollback.
  skip_destroy             = true
  family                   = "${var.name_prefix}-gateway"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge"
  execution_role_arn       = aws_iam_role.execution.arn
  memory                   = 128 + local.service_connect_proxy_memory

  volume {
    name      = "tls"
    host_path = "/var/lib/runtime/tls"
  }

  volume {
    name      = "acme"
    host_path = "/var/lib/runtime/acme"
  }

  container_definitions = jsonencode([{
    name         = "gateway"
    image        = "${aws_ecr_repository.app["gateway"].repository_url}:bootstrap"
    essential    = true
    cpu          = 128
    memory       = 128
    portMappings = [for port in [80, 443] : { containerPort = port, hostPort = port, protocol = "tcp" }],
    mountPoints = [
      { sourceVolume = "tls", containerPath = "/etc/nginx/certs", readOnly = false },
      { sourceVolume = "acme", containerPath = "/var/www/acme", readOnly = true }
    ],
    environment = [
      for name, service in var.services : { name = "FOC_${upper(name)}_UPSTREAM", value = "${name}:${service.port}" }
    ],
    healthCheck = {
      command     = ["CMD-SHELL", "curl -fsS http://localhost/healthz >/dev/null || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app["gateway"].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
        mode                  = "non-blocking"
        max-buffer-size       = "1m"
      }
    }
  }])
}

resource "aws_ecs_service" "gateway" {
  name                               = "gateway"
  cluster                            = aws_ecs_cluster.app.id
  task_definition                    = aws_ecs_task_definition.gateway.arn
  desired_count                      = var.start_services ? 1 : 0
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.host.name
    weight            = 1
  }

  service_connect_configuration {
    enabled   = true
    namespace = var.service_connect_namespace_arn

    log_configuration {
      log_driver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app["gateway"].name
        awslogs-region        = var.region
        awslogs-stream-prefix = "service-connect"
      }
    }
  }

  depends_on = [aws_ecs_service.app]
  lifecycle { ignore_changes = [task_definition, desired_count] }
}
