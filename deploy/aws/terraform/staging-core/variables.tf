variable "aws_region" {
  type        = string
  description = "AWS region for staging."
  default     = "ap-southeast-1"
}

variable "environment" {
  type        = string
  description = "Environment name."
  default     = "staging"
}

variable "eks_version" {
  type        = string
  description = "Pinned EKS control-plane version; update deliberately after compatibility review."
  default     = "1.35"
}

variable "github_deploy_role_arn" {
  type        = string
  description = "OIDC deployment role from the bootstrap stack."
}

variable "kafbat_viewer_role_arn" {
  type        = string
  description = "Optional IAM role whose EKS sessions may privately port-forward to the staging Kafbat dashboard."
  default     = ""

  validation {
    condition = var.kafbat_viewer_role_arn == "" || can(regex(
      "^arn:aws:iam::[0-9]{12}:role/.+$",
      var.kafbat_viewer_role_arn
    ))
    error_message = "kafbat_viewer_role_arn must be empty or an IAM role ARN."
  }
}

variable "budget_email" {
  type        = string
  description = "Email address that receives AWS budget alerts."

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.budget_email))
    error_message = "budget_email must be a valid email address."
  }
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly staging cost alert threshold."
  default     = 25
}

variable "rds_instance_class" {
  type        = string
  description = "Cost-conscious RDS class for coursework staging."
  default     = "db.t4g.micro"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR reserved for the staging VPC."
  default     = "10.42.0.0/16"
}

variable "msk_kafka_version" {
  type        = string
  description = "Pinned Amazon MSK Kafka version. Update only after client and MSK compatibility review."
  # MSK 4.2 is currently Express-only. Provisioned Standard brokers support 4.1 KRaft.
  default = "4.1.x.kraft"

  validation {
    condition = contains([
      "3.8.x.kraft",
      "3.9.x.kraft",
      "4.0.x.kraft",
      "4.1.x.kraft"
    ], var.msk_kafka_version)
    error_message = "Provisioned Standard MSK must use a reviewed KRaft version from 3.8.x through 4.1.x; 4.2 is Express-only."
  }
}

variable "msk_broker_instance_type" {
  type        = string
  description = "Provisioned MSK broker size; three brokers are created across three AZs."
  # T3 brokers cannot run MSK's KRaft metadata mode. M7g is the smallest production-oriented
  # Graviton family supported by the pinned KRaft release.
  default = "kafka.m7g.large"

  validation {
    condition     = !startswith(var.msk_broker_instance_type, "kafka.t3.")
    error_message = "T3 brokers do not support MSK KRaft clusters; use a supported Standard broker family such as kafka.m7g.large."
  }
}

variable "msk_broker_storage_gib" {
  type        = number
  description = "Encrypted EBS storage allocated to each MSK broker."
  default     = 20

  validation {
    condition     = var.msk_broker_storage_gib >= 1
    error_message = "msk_broker_storage_gib must be at least 1 GiB."
  }
}
