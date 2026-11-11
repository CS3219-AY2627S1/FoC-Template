# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/global/github-oidc), drafted and edited with Claude Code.
# Reviewed by Don Lee

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      env        = "global"
      managed-by = "terraform"
      project    = "foc"
    }
  }
}
