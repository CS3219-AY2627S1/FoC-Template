# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/state), drafted and edited with Claude Code.
# Reviewed by Don Lee

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # The one root with state on disk: it creates the bucket every other cloud
  # root keeps its state in. Losing this file is harmless; the bucket stays
  # and can be imported (terraform import aws_s3_bucket.state <name>).
}
