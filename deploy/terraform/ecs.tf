resource "aws_ecs_cluster" "demo" {
  count = var.deploy_runtime ? 1 : 0
  name  = var.project_name
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

locals {
  environment = {
    ui = {
      INTERNAL_GATEWAY_URL = local.gateway_url
      NGINX_DNS_RESOLVER   = cidrhost("10.42.0.0/16", 2)
    }
    internal-gateway = {
      USER_SERVICE_UPSTREAM     = "http://user.${local.namespace}:5005"
      SUPPLIER_SERVICE_UPSTREAM = "http://supplier.${local.namespace}:3001"
      CREDIT_SERVICE_UPSTREAM   = "http://credit.${local.namespace}:3002"
      ORDER_SERVICE_UPSTREAM    = "http://order.${local.namespace}:3002"
      NGINX_DNS_RESOLVER        = cidrhost("10.42.0.0/16", 2)
    }
    user     = { INTERNAL_GATEWAY_URL = local.gateway_url, COOKIE_SECURE = "false" }
    supplier = { INTERNAL_GATEWAY_URL = local.gateway_url }
    credit   = { INTERNAL_GATEWAY_URL = local.gateway_url, INITIAL_CREDIT_ALLOCATION = "100" }
    order    = { INTERNAL_GATEWAY_URL = local.gateway_url }
  }
}

resource "aws_ecs_task_definition" "app" {
  for_each                 = local.runtime_services
  family                   = "${var.project_name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(each.value.cpu)
  memory                   = tostring(each.value.memory)
  execution_role_arn       = aws_iam_role.execution[each.key].arn
  task_role_arn            = aws_iam_role.task[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = each.key
    image        = "${aws_ecr_repository.service[each.key].repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = each.value.port, protocol = "tcp" }]
    environment  = [for name, value in local.environment[each.key] : { name = name, value = value }]
    secrets = contains(local.backend_names, each.key) ? [for name in local.secret_keys[each.key] : {
      name = name, valueFrom = "${aws_secretsmanager_secret.service[each.key].arn}:${name}::"
    }] : []
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command = contains(local.backend_names, each.key) ? [
        "CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${each.value.port}/health', timeout=4)"
      ] : ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/${each.key == "ui" ? "" : "health"} || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 120
    }
    stopTimeout = 30
  }])
}

resource "aws_ecs_service" "app" {
  for_each                           = local.running_services
  name                               = "${var.project_name}-${each.key}"
  cluster                            = aws_ecs_cluster.demo[0].id
  task_definition                    = aws_ecs_task_definition.app[each.key].arn
  launch_type                        = "FARGATE"
  platform_version                   = "1.4.0"
  desired_count                      = 1
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = each.key == "internal-gateway" ? null : 180
  enable_ecs_managed_tags            = true
  propagate_tags                     = "SERVICE"
  wait_for_steady_state              = true

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.task[each.key].id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.app[each.key].arn
  }

  dynamic "load_balancer" {
    for_each = each.value.public_port == null ? [] : [each.key]
    content {
      target_group_arn = aws_lb_target_group.app[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  # Autoscaling owns desired_count after initial service creation. Reset counts
  # explicitly through ECS if disabling scaling; Terraform will not scale down.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.app,
    aws_iam_role_policy.execution,
    aws_route_table_association.public,
    aws_vpc_security_group_ingress_rule.alb_to_backend,
    aws_vpc_security_group_ingress_rule.gateway_to_backend,
    aws_vpc_security_group_ingress_rule.to_gateway,
    aws_vpc_security_group_ingress_rule.backend_to_mq,
    aws_vpc_security_group_egress_rule.task,
    aws_mq_broker.demo,
  ]
}
