# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/nonprod/aws), drafted and edited with Claude Code.
# Reviewed by Don Lee

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # Bucket from infra/state: terraform init -backend-config="bucket=foc-tfstate-<account>"
  backend "s3" {
    key          = "nonprod/aws/terraform.tfstate"
    region       = "ap-southeast-1"
    use_lockfile = true
  }
}
