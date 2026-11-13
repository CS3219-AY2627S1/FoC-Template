mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = jsonencode({ Version = "2012-10-17", Statement = [] }) }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-southeast-1a", "ap-southeast-1b", "ap-southeast-1c"] }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/foc-test" }
  }
  mock_resource "aws_launch_template" {
    defaults = { id = "lt-0123456789abcdef0" }
  }
  mock_resource "aws_autoscaling_group" {
    defaults = { arn = "arn:aws:autoscaling:ap-southeast-1:123456789012:autoScalingGroup:00000000-0000-0000-0000-000000000001:autoScalingGroupName/foc-test-core" }
  }
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
  mock_data "aws_partition" {
    defaults = {
      partition  = "aws"
      dns_suffix = "amazonaws.com"
    }
  }
}

variables {
  name_prefix                   = "foc-test"
  region                        = "ap-southeast-1"
  domain_name                   = "foc.example.edu"
  acme_email                    = "team@example.edu"
  core_ami_id                   = "ami-0123456789abcdef0"
  core_instance_type            = "t3a.medium"
  start_services                = false
  public_subnet_id              = "subnet-public"
  compute_security_group_id     = "sg-compute"
  eip_allocation_id             = "eipalloc-test"
  service_connect_namespace_arn = "arn:aws:servicediscovery:ap-southeast-1:123456789012:namespace/ns-test"
  database_host                 = "database.example"
  database_master_secret_arn    = "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:foc-test"
  database_bootstrap_sql        = "select 1"
  messaging_kms_key_arn         = "arn:aws:kms:ap-southeast-1:123456789012:key/00000000-0000-0000-0000-000000000001"
  image_bucket_policy_arns      = {}
  topic_arns                    = { catalog = "arn:aws:sns:ap-southeast-1:123456789012:foc-test-catalog-events" }
  queue_arns                    = { stream = "arn:aws:sqs:ap-southeast-1:123456789012:foc-test-stream-events" }
  execution_parameter_arns      = ["arn:aws:ssm:ap-southeast-1:123456789012:parameter/foc-test-catalog-token"]
  services = {
    catalog = {
      database    = "catalog_db"
      username    = "catalog_role"
      port        = 9000, cpu = 256, memory = 512, health_path = "/ready"
      environment = { MODE = "production", ENDPOINT = "https://catalog.example" }
      secrets     = { TOKEN = "arn:aws:ssm:ap-southeast-1:123456789012:parameter/foc-test-catalog-token" }
      volumes     = { data = { host_path = "/var/lib/catalog", container_path = "/data", read_only = false } }
    }
    stream = {
      port        = 9001, cpu = 128, memory = 256, health_path = "/health"
      environment = { NODE_ENV = "production" }
    }
  }

}

run "generic_services_preserve_configuration" {
  command = apply
  module { source = "../../modules/ecs" }

  assert {
    condition = alltrue([for name, task in aws_ecs_task_definition.app :
      jsonencode({ for entry in jsondecode(task.container_definitions)[0].environment : entry.name => entry.value }) == jsonencode(var.services[name].environment)
      && jsonencode({ for entry in jsondecode(task.container_definitions)[0].secrets : entry.name => entry.valueFrom }) == jsonencode(try(var.services[name].secrets, {}))
      && tonumber(task.memory) == var.services[name].memory + 64
      && jsondecode(task.container_definitions)[0].portMappings[0].name == name
      && !contains(keys(jsondecode(task.container_definitions)[0].portMappings[0]), "appProtocol")
      && task.execution_role_arn == aws_iam_role.execution.arn
    ])
    error_message = "Generic service definitions must preserve supplied configuration, ports, proxy memory and the existing execution role."
  }



  assert {
    condition = alltrue([for name, service in aws_ecs_service.app :
      one(service.service_connect_configuration).enabled
      && one(service.service_connect_configuration).namespace == var.service_connect_namespace_arn
      && one(one(service.service_connect_configuration).service).port_name == name
      && one(one(one(service.service_connect_configuration).service).client_alias).dns_name == name
      && one(one(one(service.service_connect_configuration).service).client_alias).port == var.services[name].port
      && length(service.service_registries) == 0
    ]) && length(one(aws_ecs_service.gateway.service_connect_configuration).service) == 0
    error_message = "Service Connect must expose each backend and keep the gateway client-only without legacy registration."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.app["catalog"].container_definitions)[0].mountPoints[0].containerPath == "/data"
      && !jsondecode(aws_ecs_task_definition.app["catalog"].container_definitions)[0].mountPoints[0].readOnly
      && jsondecode(aws_ecs_task_definition.app["catalog"].container_definitions)[0].healthCheck.command[1] == "curl -fsS http://localhost:9000/ready || exit 1"
    )
    error_message = "Volume paths, permissions and health endpoints must be service-configurable."
  }




  assert {
    condition = alltrue(flatten([
      for policy in aws_iam_role_policy.messaging : [
        for statement in jsondecode(policy.policy).Statement : (
          statement.Resource == var.messaging_kms_key_arn
          && contains(["sns.ap-southeast-1.amazonaws.com", "sqs.ap-southeast-1.amazonaws.com"], statement.Condition.StringEquals["kms:ViaService"])
        ) if anytrue([for action in statement.Action : startswith(action, "kms:")])
      ]
    ])) && length([for statement in jsondecode(aws_iam_role_policy.messaging["stream"].policy).Statement : statement if contains(statement.Action, "sns:Publish")]) == 0
    error_message = "KMS access must be restricted to SNS/SQS; consumer-only services must not receive publishing permissions."
  }

  assert {
    condition = (
      toset(keys(aws_ecs_task_definition.database_bootstrap)) == toset(["catalog"])
      && toset([for secret in jsondecode(aws_ecs_task_definition.database_bootstrap["catalog"].container_definitions)[0].secrets : secret.name]) == toset(["PGPASSWORD", "FOC_DATABASE_PASSWORD"])
    )
    error_message = "Only database-owning services get bootstrap tasks, without admin credentials."
  }

  assert {
    condition = alltrue([for task in aws_ecs_task_definition.app :
      jsondecode(task.container_definitions)[0].restartPolicy.enabled
      && jsondecode(task.container_definitions)[0].versionConsistency == "disabled"
      ]) && alltrue([for task in concat([aws_ecs_task_definition.gateway], values(aws_ecs_task_definition.database_bootstrap)) :
      !contains(keys(jsondecode(task.container_definitions)[0]), "restartPolicy")
      && !contains(keys(jsondecode(task.container_definitions)[0]), "versionConsistency")
    ])
    error_message = "Application restart policies must not change gateway or database-bootstrap behavior."
  }

  assert {
    condition = (
      strcontains(base64decode(aws_launch_template.host.user_data), "OnUnitActiveSec=12h")
      && strcontains(base64decode(aws_launch_template.host.user_data), "--deploy-hook /usr/local/bin/deploy-certificate")
      && strcontains(base64decode(aws_launch_template.host.user_data), "RestartSec=5min")
    )
    error_message = "Host configuration must preserve the certificate deploy hook, schedule and retry behavior."
  }



  assert {
    condition = (
      aws_launch_template.host.image_id == var.core_ami_id
      && toset(jsondecode(aws_iam_role_policy.secrets.policy).Statement[0].Resource) == var.execution_parameter_arns
      && contains(jsondecode(aws_iam_role_policy.bootstrap_secrets.policy).Statement[1].Resource, "arn:aws:ssm:ap-southeast-1:123456789012:parameter/foc-test-initial-admin-email")
      && contains(jsondecode(aws_iam_role_policy.bootstrap_secrets.policy).Statement[1].Resource, "arn:aws:ssm:ap-southeast-1:123456789012:parameter/foc-test-initial-admin-password")
    )
    error_message = "The host AMI stays pinned; the shared execution policy uses explicit inputs and existing admin execution permissions are preserved."
  }

  assert {
    condition = (
      toset(flatten([for statement in jsondecode(aws_iam_role_policy.messaging["catalog"].policy).Statement : statement.Action])) == toset(["sns:Publish", "kms:GenerateDataKey", "kms:Decrypt"])
      && toset(flatten([for statement in jsondecode(aws_iam_role_policy.messaging["stream"].policy).Statement : statement.Action])) == toset(["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes", "sqs:GetQueueUrl", "kms:Decrypt"])
      && jsondecode(aws_iam_role_policy.messaging["catalog"].policy).Statement[0].Resource == var.topic_arns["catalog"]
      && jsondecode(aws_iam_role_policy.messaging["stream"].policy).Statement[0].Resource == var.queue_arns["stream"]
    )
    error_message = "Publisher and consumer policies must contain their required actions and exact topic/queue resources, including the required KMS grants."
  }

}

