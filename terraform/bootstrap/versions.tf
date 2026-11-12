# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# The bootstrap stack creates the S3 bucket that holds every OTHER stack's state. It can't keep its
# own state in that bucket (the bucket doesn't exist yet when it first runs), so its state stays in
# a local file: terraform/bootstrap/terraform.tfstate. It's run once, by one person.
terraform {
  required_version = ">= 1.11" # 1.11+ supports S3-native state locking (use_lockfile)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0" # any 6.x, never 7.0 (major versions can break things)
    }
  }
}

provider "aws" {
  region = var.aws_region

  # Refuse to run against any other account, e.g. if your shell is signed into a different one
  allowed_account_ids = [var.aws_account_id]

  # Tags added to every resource this provider creates
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }

  # No credentials here on purpose. The provider finds them the same way the AWS CLI does:
  # environment variables, then the profile named by AWS_PROFILE (your SSO login). See README.
}
