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

override_resource {
  target          = aws_security_group.compute
  override_during = plan
  values          = { id = "sg-compute" }
}

run "database_and_internal_traffic_stay_private" {
  command = plan

  module {
    source = "../../modules/network"
  }

  variables {
    name_prefix = "foc-test"
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.postgres.cidr_ipv4 == null
      && aws_vpc_security_group_ingress_rule.postgres.cidr_ipv6 == null
      && aws_vpc_security_group_ingress_rule.postgres.referenced_security_group_id == "sg-compute"
    )
    error_message = "PostgreSQL must accept connections only from the compute security group."
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.ecs_ports.cidr_ipv4 == null
      && aws_vpc_security_group_ingress_rule.ecs_ports.cidr_ipv6 == null
      && aws_vpc_security_group_ingress_rule.ecs_ports.referenced_security_group_id == "sg-compute"
    )
    error_message = "Traffic between ECS hosts must not be open to the internet."
  }
}
