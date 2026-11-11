# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-02
# Scope: Terraform configuration (infra/local/aws), drafted and edited with Claude Code.
# Reviewed by Don Lee

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # Local env keeps state on disk (terraform.tfstate, git-ignored).
}
