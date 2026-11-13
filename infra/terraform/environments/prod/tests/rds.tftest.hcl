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

run "database_stays_private_and_recoverable" {
  command = plan

  module {
    source = "../../modules/rds"
  }

  variables {
    name_prefix                = "foc-test"
    db_instance_class          = "db.t4g.micro"
    database_subnet_ids        = ["subnet-a", "subnet-b"]
    database_security_group_id = "sg-database"
  }

  assert {
    condition = (
      aws_db_instance.postgres.storage_encrypted
      && aws_db_instance.postgres.deletion_protection
      && aws_db_instance.postgres.manage_master_user_password
      && aws_db_instance.postgres.publicly_accessible == false
      && aws_db_instance.postgres.backup_retention_period > 0
      && aws_db_instance.postgres.skip_final_snapshot == false
    )
    error_message = "RDS must stay encrypted, private, deletion-protected, and recoverable from backups and a final snapshot."
  }
}
