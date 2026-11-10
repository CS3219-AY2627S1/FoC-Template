# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-01
# Scope: Terraform configuration (infra/modules/argocd), drafted and edited with Claude Code.
# Reviewed by Don Lee

terraform {
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.0"
    }
  }
}
