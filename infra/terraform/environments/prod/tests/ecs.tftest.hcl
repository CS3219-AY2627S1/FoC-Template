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
  name_prefix        = "foc-test"
  domain_name        = "foc.example.edu"
  acme_email         = "team@example.edu"
  mail_from          = "noreply@example.edu"
  core_ami_id        = "ami-0123456789abcdef0"
  image_bucket_names = { user = "foc-test-user", supplier = "foc-test-supplier", order = "foc-test-order" }
}

run "production_composition_preserves_application_contracts" {
  command = plan

  assert {
    condition = alltrue([
      for route in values(local.event_subscriptions) : strcontains(
        file("${path.module}/../../../docker/floci/init-resources.sh"),
        "subscribe ${route.publisher} ${route.consumer} '${replace(jsonencode({ eventType = route.event_types }), "\"", "\\\"")}'"
      )
    ]) && length(regexall("(?m)^subscribe ", file("${path.module}/../../../docker/floci/init-resources.sh"))) == length(local.event_subscriptions)
    error_message = "Floci subscriptions must match every production route, with no extra subscriptions."
  }

  assert {
    condition = (
      local.event_consumers == toset(["order", "credit", "realtime"])
      && local.services["order"].environment.FOC_SUPPLIER_SERVICE_URL == "http://supplier:8081/api"
      && local.services["user"].environment.SPRING_DATASOURCE_USERNAME == "foc_user"
      && !contains(keys(local.services["user"].environment), "FOC_DATABASE_USERNAME")
      && !contains(keys(local.services["realtime"].environment), "JAVA_TOOL_OPTIONS")
      && contains(keys(local.services["order"].secrets), "OPENAI_API_KEY")
      && !contains(keys(local.services["supplier"].secrets), "OPENAI_API_KEY")
    )
    error_message = "Production composition must retain runtime isolation, database bindings, internal URLs and the order-only AI secret."
  }

  assert {
    condition = (
      contains(output.required_ssm_parameters, "foc-test-openai-api-key")
      && !contains(output.required_ssm_parameters, "foc-test-database-user")
      && one([for entry in local.supplier_seed_task_definition.containerDefinitions[0].environment : entry.value if entry.name == "SPRING_PROFILES_ACTIVE"]) == "prod,supplier-seed"
    )
    error_message = "External-secret checks must exclude generated database passwords; supplier seed must use its one-off application profile."
  }


  assert {
    condition = (
      toset(keys(local.services["realtime"].environment)) == toset(["AWS_REGION", "NODE_ENV", "JWKS_URL", "SQS_QUEUE_URL"])
      && length(local.services["realtime"].secrets) == 0
      && toset([for name, service in local.services : name if contains(keys(service.secrets), "OPENAI_API_KEY")]) == toset(["order"])
      && toset([for entry in output.deployment.setup_tasks["admin-init"].task_definition.containerDefinitions[0].secrets : entry.name]) == toset(["SPRING_DATASOURCE_PASSWORD", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD"])
    )
    error_message = "Realtime must remain free of Java secrets, only order receives the AI key, and admin setup retains its limited secret scope."
  }

  assert {
    condition = alltrue([for definition in [local.admin_task_definition, local.supplier_seed_task_definition] :
      !contains(keys(definition.containerDefinitions[0]), "restartPolicy")
      && !contains(keys(definition.containerDefinitions[0]), "portMappings")
      && !contains(keys(definition.containerDefinitions[0]), "healthCheck")
      && !contains(keys(definition.containerDefinitions[0]), "versionConsistency")
    ]) && toset([for secret in local.supplier_seed_task_definition.containerDefinitions[0].secrets : secret.name]) == toset(["SPRING_DATASOURCE_PASSWORD"])
    error_message = "Both setup definitions must be one-off tasks without service restart, port or health behavior; supplier setup receives only its database secret."
  }

}
