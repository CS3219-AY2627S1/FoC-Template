# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

variable "aws_account_id" {
  description = "The AWS account to deploy into (12 digits). Terraform refuses to touch any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be exactly 12 digits."
  }
}

variable "aws_region" {
  description = "Region for the state bucket. Singapore is closest to NUS."
  type        = string
  default     = "ap-southeast-1"
}

variable "project" {
  description = "Prefix for resource names and the Project tag."
  type        = string
  default     = "campuscouriers"
}

variable "budget_alert_email" {
  description = "Email that receives AWS cost alerts."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly spend that triggers alerts (at 80% actual and 100% forecast)."
  type        = number
  default     = 50
}

variable "domain_name" {
  description = "Your registered domain, e.g. campuscouriers.app. The API is served at <api_subdomain>.<domain_name>."
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain for the backend API (ALB)."
  type        = string
  default     = "api"
}
