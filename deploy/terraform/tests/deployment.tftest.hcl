# Plan-only tests: no AWS credentials or cloud resources required.
mock_provider "aws" {
  override_during = plan
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["ap-southeast-1a", "ap-southeast-1b"]
    }
  }
  mock_resource "aws_vpc" {
    defaults = { id = "vpc-12345678", cidr_block = "10.42.0.0/16" }
  }
  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:ap-southeast-1:123456789012:repository/demo"
      repository_url = "123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/demo"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:demo-123456" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/demo" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-southeast-1:123456789012:log-group:demo" }
  }
  mock_resource "aws_lb" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:ap-southeast-1:123456789012:loadbalancer/app/demo/1234567890123456"
      arn_suffix = "app/demo/1234567890123456"
    }
  }
  mock_resource "aws_lb_target_group" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:ap-southeast-1:123456789012:targetgroup/demo/1234567890123456"
      arn_suffix = "targetgroup/demo/1234567890123456"
    }
  }
  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:ap-southeast-1:123456789012:service/srv-12345678" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-southeast-1:123456789012:task-definition/demo:1" }
  }
  mock_resource "aws_mq_broker" {
    defaults = {
      instances = [{ endpoints = ["amqps://b-example.mq.ap-southeast-1.amazonaws.com:5671"], console_url = "https://b-example.mq.ap-southeast-1.amazonaws.com", ip_address = "10.42.0.10" }]
    }
  }
}

override_resource {
  target          = aws_security_group.alb[0]
  override_during = plan
  values          = { id = "sg-12345678" }
}

variables {
  allowed_ingress_cidrs = ["203.0.113.10/32"]
}

run "bootstrap_only" {
  command = plan

  assert {
    condition     = length(aws_ecr_repository.service) == 6 && length(aws_secretsmanager_secret.service) == 4
    error_message = "Bootstrap must create six image repositories and four empty application secrets."
  }
  assert {
    condition     = length(aws_ecs_service.app) == 0 && length(aws_mq_broker.demo) == 0 && length(aws_lb.public) == 0 && length(aws_vpc.demo) == 0
    error_message = "Bootstrap must not create runtime infrastructure before images and secrets are populated."
  }
}

run "runtime_before_secrets" {
  command = plan
  variables {
    deploy_runtime = true
    image_tag      = "demo-20261105-1"
    mq_password    = "ExampleOnlyPassword12345"
  }
  assert {
    condition     = length(aws_mq_broker.demo) == 1 && length(aws_ecs_task_definition.app) == 6 && length(aws_ecs_service.app) == 0
    error_message = "Provision the broker endpoint and definitions without starting tasks before secrets are populated."
  }
}

run "runtime" {
  command = plan
  variables {
    deploy_runtime      = true
    start_services      = true
    image_tag           = "demo-20261105-1"
    mq_password         = "ExampleOnlyPassword12345"
    autoscaling_enabled = true
    requests_per_target = 60
  }

  assert {
    condition = tomap({ for name, listener in aws_lb_listener.app : name => listener.port }) == tomap({
      ui = 80, user = 5005, supplier = 3001, credit = 3002, order = 3003
    })
    error_message = "ALB listeners must expose the UI and each backend on its agreed direct port."
  }
  assert {
    condition     = aws_lb_target_group.app["order"].port == 3002 && length(aws_ecs_service.app) == 6
    error_message = "Order listener 3003 must route to container 3002; all six components need independent ECS services."
  }
  assert {
    condition     = !aws_mq_broker.demo[0].publicly_accessible && aws_mq_broker.demo[0].engine_type == "RabbitMQ"
    error_message = "RabbitMQ must be private and managed by Amazon MQ."
  }
  assert {
    condition     = alltrue([for task in aws_ecs_task_definition.app : one(task.runtime_platform).cpu_architecture == "X86_64"])
    error_message = "Fargate and published image architecture must match linux/amd64."
  }
  assert {
    condition     = alltrue([for key in ["user", "supplier", "credit", "order"] : length(jsondecode(aws_ecs_task_definition.app[key].container_definitions)[0].secrets) >= 2])
    error_message = "Backend secrets must be injected by reference, not literal environment variables."
  }
  assert {
    condition     = aws_appautoscaling_target.demo[0].min_capacity == 1 && aws_appautoscaling_target.demo[0].max_capacity == 3
    error_message = "Demo scaling must be bounded from one to three tasks."
  }
  assert {
    condition     = aws_appautoscaling_policy.requests[0].target_tracking_scaling_policy_configuration[0].predefined_metric_specification[0].predefined_metric_type == "ALBRequestCountPerTarget"
    error_message = "Use the direct backend target group's request count for the scaling demonstration."
  }
  assert {
    condition     = alltrue([for key, rule in aws_vpc_security_group_ingress_rule.alb_to_backend : rule.referenced_security_group_id == aws_security_group.alb[0].id])
    error_message = "Public task IPs must not allow direct internet traffic to backends."
  }
  assert {
    condition     = !contains(keys(aws_lb_listener.app), "internal-gateway") && alltrue([for key, rule in aws_vpc_security_group_ingress_rule.backend_to_mq : rule.from_port == 5671 && rule.to_port == 5671])
    error_message = "The gateway stays private and broker clients must use AMQPS on 5671."
  }
  assert {
    condition     = alltrue([for rule in aws_vpc_security_group_ingress_rule.public : contains(var.allowed_ingress_cidrs, rule.cidr_ipv4)])
    error_message = "The ALB must restrict public entry to explicitly configured CIDRs."
  }
  assert {
    condition     = length(jsondecode(aws_ecs_task_definition.app["user"].container_definitions)[0].secrets) == 6 && alltrue([for item in jsondecode(aws_ecs_task_definition.app["user"].container_definitions)[0].environment : !contains(local.secret_keys.user, item.name)])
    error_message = "User bootstrap/signing credentials must be secret references, not plain environment values."
  }
  assert {
    condition     = alltrue([for group in aws_cloudwatch_log_group.service : group.retention_in_days == 7])
    error_message = "Demo logs must have bounded seven-day retention."
  }
  assert {
    condition     = !one(aws_mq_broker.demo[0].logs).general
    error_message = "Do not enable broker general logging that creates unmanaged, indefinitely retained log groups."
  }
}

run "reject_latest_tag" {
  command = plan
  variables {
    deploy_runtime = true
    image_tag      = "latest"
    mq_password    = "ExampleOnlyPassword12345"
  }
  expect_failures = [var.image_tag]
}

run "reject_services_without_runtime" {
  command = plan
  variables {
    start_services = true
  }
  expect_failures = [var.start_services]
}

run "reject_repetitive_broker_password" {
  command = plan
  variables {
    deploy_runtime = true
    image_tag      = "demo-20261105-1"
    mq_password    = "aaaaaaaaaaaa"
  }
  expect_failures = [var.mq_password]
}

run "reject_missing_broker_password" {
  command = plan
  variables {
    deploy_runtime = true
    image_tag      = "demo-20261105-1"
  }
  expect_failures = [var.mq_password]
}

run "scaling_disabled" {
  command = plan
  variables {
    deploy_runtime = true
    start_services = true
    image_tag      = "demo-20261105-1"
    mq_password    = "ExampleOnlyPassword12345"
  }
  assert {
    condition     = length(aws_appautoscaling_target.demo) == 0 && length(aws_appautoscaling_policy.requests) == 0
    error_message = "Autoscaling must be opt-in after baseline measurement."
  }
}
