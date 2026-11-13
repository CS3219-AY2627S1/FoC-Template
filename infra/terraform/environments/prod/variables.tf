variable "image_bucket_names" {
  description = "Globally unique image bucket names keyed by owning service."
  type        = object({ user = string, supplier = string, order = string })
}

variable "name_prefix" {
  description = "Environment prefix for AWS resource names."
  type        = string
  default     = "foc-prod"
}

variable "domain_name" {
  description = "Public hostname for the gateway and its TLS certificate."
  type        = string
}

variable "acme_email" {
  description = "Email address for certificate registration."
  type        = string
}

variable "mail_from" {
  description = "Sender address for account emails."
  type        = string
}

variable "start_services" {
  description = "Whether to run application services."
  type        = bool
  default     = false
}

variable "core_instance_type" {
  description = "EC2 instance type for the core ECS host."
  type        = string
  default     = "t3a.medium"
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
  default     = "db.t4g.micro"
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
