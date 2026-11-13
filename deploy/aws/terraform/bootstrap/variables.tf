variable "aws_region" {
  description = "AWS region used by Friend on Campus staging."
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "staging"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.environment))
    error_message = "environment must be a short lowercase DNS-compatible name."
  }
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to assume deployment roles."
  type        = string
  default     = "AY2627S1-CS3219-P12/FoC-Team-12"

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must use the owner/repository format."
  }
}

variable "github_repository_owner_id" {
  description = "Immutable GitHub organization ID included in this repository's OIDC subject."
  type        = string
  default     = "332145308"

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_owner_id))
    error_message = "github_repository_owner_id must be a positive numeric GitHub ID."
  }
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID included in this repository's OIDC subject."
  type        = string
  default     = "1379941491"

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_id))
    error_message = "github_repository_id must be a positive numeric GitHub ID."
  }
}

variable "state_bucket_name" {
  description = "Pre-created S3 bucket used for Terraform remote state."
  type        = string
}
