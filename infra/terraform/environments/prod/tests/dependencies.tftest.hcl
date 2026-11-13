mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = jsonencode({ Version = "2012-10-17", Statement = [] }) }
  }
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["ap-southeast-1a", "ap-southeast-1b", "ap-southeast-1c"]
    }
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
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "ami-0123456789abcdef0"
    }
  }
}

variables {
  core_ami_id = "ami-0123456789abcdef0"
  image_bucket_names = {
    user     = "foc-test-user"
    supplier = "foc-test-supplier"
    order    = "foc-test-order"
  }
  name_prefix = "foc-test"
  domain_name = "foc.example.edu"
  acme_email  = "team@example.edu"
  mail_from   = "noreply@mail.example.edu"
}

run "ecs_identity_is_known_while_network_changes_are_pending" {
  command = plan

  assert {
    condition     = output.deployment.setup_tasks["admin-init"].task_definition.taskRoleArn == "arn:aws:iam::123456789012:role/foc-test-user-task"
    error_message = "ECS account and partition lookups must remain known during planning."
  }

  assert {
    condition = one([
      for secret in output.deployment.setup_tasks["admin-init"].task_definition.containerDefinitions[0].secrets : secret.valueFrom
      if secret.name == "SPRING_DATASOURCE_PASSWORD"
    ]) == "arn:aws:ssm:ap-southeast-1:123456789012:parameter/foc-test-database-user"
    error_message = "ECS parameter ARNs must not become unknown because networking has pending changes."
  }
}
