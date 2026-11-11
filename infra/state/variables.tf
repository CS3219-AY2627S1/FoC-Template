# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/state), drafted and edited with Claude Code.
# Reviewed by Don Lee

variable "region" {
  description = "Region of the state bucket (and of every cloud env)."
  type        = string
  default     = "ap-southeast-1"
}
