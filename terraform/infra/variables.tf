# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
# Scope (AI-27): Generated the deploy workflow, CI helper scripts and deploy-role Terraform I specified.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
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
  description = "Region for all resources. Singapore is closest to NUS."
  type        = string
  default     = "ap-southeast-1"
}

variable "project" {
  description = "Prefix for resource names and the Project tag."
  type        = string
  default     = "campuscouriers"
}

# --- Network ---------------------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "Address range of the whole VPC. Subnets are carved out of it in vpc.tf."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to use. 2 is the minimum for an ALB and for RDS Multi-AZ."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "single_nat_gateway" {
  description = "true: one shared NAT gateway (cheaper). false: one per AZ (survives an AZ outage, costs more)."
  type        = bool
  default     = true
}

# --- EKS -------------------------------------------------------------------------------------------
variable "kubernetes_version" {
  description = "EKS Kubernetes version. List options: aws eks describe-cluster-versions. Upgrade one minor version at a time."
  type        = string
  default     = "1.37"
}

variable "cluster_public_access_cidrs" {
  description = "IP ranges allowed to reach the Kubernetes API from the internet (still requires AWS credentials)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "cluster_log_types" {
  description = "Control plane logs sent to CloudWatch. Options: api, audit, authenticator, controllerManager, scheduler."
  type        = list(string)
  default     = ["audit", "authenticator"]
}

variable "cluster_admin_role_arns" {
  description = "Extra IAM role ARNs given cluster admin (the role that creates the cluster already is)."
  type        = list(string)
  default     = []
}

variable "node_capacity_type" {
  description = "SPOT (spare EC2 capacity, ~60-70% cheaper, can be reclaimed with 2 minutes' notice) or ON_DEMAND."
  type        = string
  default     = "SPOT"

  validation {
    condition     = contains(["SPOT", "ON_DEMAND"], var.node_capacity_type)
    error_message = "node_capacity_type must be SPOT or ON_DEMAND."
  }
}

variable "node_instance_types" {
  description = "Instance types for the nodes, all 2 vCPU / 8 GiB. Several types make Spot capacity easier to get."
  type        = list(string)
  default     = ["m6i.large", "m5.large", "m6a.large", "m5a.large", "t3.large", "t3a.large"]
}

variable "node_desired_size" {
  description = "Number of nodes to start with."
  type        = number
  default     = 3
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 5
}

# --- RDS -------------------------------------------------------------------------------------------
variable "db_instance_class" {
  description = "RDS instance size. db.t4g.small = 2 vCPU (burstable), 2 GiB RAM."
  type        = string
  default     = "db.t4g.small"
}

variable "db_multi_az" {
  description = "Keep a synchronous standby in the second AZ that takes over automatically. Doubles the cost."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Days of automatic backups (point-in-time restore). 0 turns backups off."
  type        = number
  default     = 1
}

variable "db_deletion_protection" {
  description = "true: RDS refuses to delete the instance (also blocks terraform destroy)."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "true: destroying the instance deletes the data with no final snapshot. Set false once the data matters."
  type        = bool
  default     = true
}

# --- DNS -------------------------------------------------------------------------------------------
variable "domain_name" {
  description = "Your registered domain (same as in terraform/bootstrap). Its hosted zone is created there."
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain of the backend API (must match terraform/bootstrap and k8s/domain.yaml)."
  type        = string
  default     = "api"
}

variable "app_subdomain" {
  description = "Subdomain the frontend is served at (must match appOrigin in k8s/domain.yaml)."
  type        = string
  default     = "app"
}

# --- GitHub Actions --------------------------------------------------------------------------------
variable "github_repository" {
  description = "owner/name of the GitHub repository whose main branch may deploy (github-actions.tf)."
  type        = string
  default     = "AY2627S1-CS3219-P14/FoC-Template"
}

variable "github_oidc_subject_prefix" {
  description = "Start of the subject in the repository's GitHub OIDC tokens. Find it with: gh api repos/<owner>/<repo>/actions/oidc/customization/sub (sub_claim_prefix)."
  type        = string
  default     = "repo:AY2627S1-CS3219-P14@323944968/FoC-Template@1356783930"
}
