variable "region" {
  description = "AWS deployment region."
  type        = string
}

variable "name_prefix" {
  description = "Environment prefix for AWS resource names."
  type        = string
}

variable "domain_name" {
  description = "Public hostname for the gateway and its TLS certificate."
  type        = string
}

variable "acme_email" {
  description = "Email address for certificate registration."
  type        = string
}

variable "start_services" {
  description = "Whether to run application services."
  type        = bool
}

variable "core_instance_type" {
  description = "EC2 instance type for the core ECS host."
  type        = string
}

variable "services" {
  description = "Service definitions and ECS task settings."
  type = map(object({
    port        = number
    cpu         = number
    memory      = number
    database    = optional(string)
    username    = optional(string)
    health_path = string
    environment = map(string)
    secrets     = optional(map(string), {})
    volumes = optional(map(object({
      host_path      = string
      container_path = string
      read_only      = optional(bool, true)
    })), {})
  }))
  validation {
    condition = alltrue([
      for service in values(var.services) : (service.database == null) == (service.username == null)
    ])
    error_message = "Database and username must be set together."
  }
}

variable "image_bucket_policy_arns" {
  description = "Image access policy ARNs keyed by owning service."
  type        = map(string)
}

variable "public_subnet_id" {
  description = "Public subnet ID for ECS hosts."
  type        = string
}

variable "compute_security_group_id" {
  description = "Security group ID for ECS hosts."
  type        = string
}

variable "eip_allocation_id" {
  description = "Elastic IP allocation ID for the core host."
  type        = string
}

variable "service_connect_namespace_arn" {
  description = "Cloud Map namespace ARN for ECS Service Connect."
  type        = string
}

variable "topic_arns" {
  description = "SNS topic ARNs keyed by publishing service."
  type        = map(string)
}

variable "queue_arns" {
  description = "SQS queue ARNs keyed by consuming service."
  type        = map(string)
}

variable "messaging_kms_key_arn" {
  description = "Customer-managed key that encrypts SNS and SQS messages."
  type        = string
}

variable "database_host" {
  description = "PostgreSQL endpoint hostname."
  type        = string
}

variable "database_master_secret_arn" {
  description = "ARN of the Secrets Manager secret containing RDS master credentials."
  type        = string
}

variable "database_bootstrap_sql" {
  description = "Idempotent SQL for creating service roles and databases."
  type        = string
}

variable "grafana_cloudwatch_reader" {
  description = "Grafana Cloud account and external ID for the optional CloudWatch read role."
  type        = object({ account_id = string, external_id = string })
  default     = null
  sensitive   = true
}

variable "core_ami_id" {
  description = "Pinned ECS-optimized AL2023 x86_64 AMI ID for the core host in the deployment region."
  type        = string

  validation {
    condition     = can(regex("^ami-[0-9a-f]{17}$", var.core_ami_id))
    error_message = "Provide an explicit AMI ID, not an SSM recommended-image alias."
  }
}

variable "execution_parameter_arns" {
  description = "SSM resources the shared execution role may read."
  type        = set(string)
}
