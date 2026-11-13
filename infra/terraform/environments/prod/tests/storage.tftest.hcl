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

override_resource {
  target          = module.images["user"].aws_s3_bucket.this[0]
  override_during = plan
  values          = { arn = "arn:aws:s3:::foc-test-user", id = "foc-test-user" }
}
override_resource {
  target          = module.images["supplier"].aws_s3_bucket.this[0]
  override_during = plan
  values          = { arn = "arn:aws:s3:::foc-test-supplier", id = "foc-test-supplier" }
}
override_resource {
  target          = module.images["order"].aws_s3_bucket.this[0]
  override_during = plan
  values          = { arn = "arn:aws:s3:::foc-test-order", id = "foc-test-order" }
}

run "service_buckets_and_permissions" {
  command = plan
  assert {
    condition     = length(module.images) == 3 && length(toset([for bucket in module.images : bucket.s3_bucket_id])) == 3
    error_message = "Each service must have a separate bucket."
  }
  assert {
    condition = alltrue([
      for service, policy in aws_iam_policy.service_images : (
        jsondecode(policy.policy).Statement[0].Resource == "${module.images[service].s3_bucket_arn}/*"
        && toset(jsondecode(policy.policy).Statement[0].Action) == toset(["s3:GetObject", "s3:PutObject", "s3:DeleteObject"])
        && length(jsondecode(policy.policy).Statement) == 1
      )
    ])
    error_message = "Each service policy must grant access only to its own bucket."
  }
}
