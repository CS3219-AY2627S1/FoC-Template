variable "aws_region" {
  description = "AWS region; verify Amazon MQ engine and instance availability before applying."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Unique demo resource prefix. Changing it can replace infrastructure."
  type        = string
  default     = "foc-demo"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.project_name))
    error_message = "Use 3–20 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "allowed_ingress_cidrs" {
  description = "Explicit IPv4 source CIDRs allowed to access all demo listeners. Include professor/load-generator networks."
  type        = set(string)
  validation {
    condition     = length(var.allowed_ingress_cidrs) > 0 && alltrue([for cidr in var.allowed_ingress_cidrs : can(cidrnetmask(cidr))])
    error_message = "Supply at least one valid IPv4 CIDR; use your public IP /32 for restricted access."
  }
}

variable "deploy_runtime" {
  description = "False bootstraps only repositories and empty secrets. True creates networking, broker and ECS definitions."
  type        = bool
  default     = false
}

variable "start_services" {
  description = "Enable ECS services only after pushing images and populating secrets, including the provisioned MQ endpoint."
  type        = bool
  default     = false
  validation {
    condition     = !var.start_services || var.deploy_runtime
    error_message = "start_services requires deploy_runtime=true."
  }
}

variable "image_tag" {
  description = "Unique immutable release tag pushed to all six repositories; never latest."
  type        = string
  default     = ""
  validation {
    condition     = !var.deploy_runtime || (can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag)) && lower(var.image_tag) != "latest")
    error_message = "Runtime requires a valid immutable image_tag other than latest."
  }
}

variable "mq_username" {
  description = "Initial RabbitMQ application username. Treat changes as broker replacement."
  type        = string
  default     = "focdemo"
  validation {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_-]{2,49}$", var.mq_username)) && var.mq_username != "guest"
    error_message = "Use a non-guest username of 3–50 letters, digits, underscores or hyphens."
  }
}

variable "mq_password" {
  description = "Initial broker password. AWS provider stores this in state; use TF_VAR_mq_password and protect state/plans."
  type        = string
  sensitive   = true
  default     = ""
  validation {
    condition     = !var.deploy_runtime || (length(var.mq_password) >= 12 && length(var.mq_password) <= 250 && !can(regex("[,:=]", var.mq_password)) && length(toset(regexall(".", var.mq_password))) >= 4)
    error_message = "Runtime requires a 12–250 character MQ password, at least four unique characters, without comma, colon or equals."
  }
}

variable "mq_engine_version" {
  description = "Amazon MQ RabbitMQ version. Verify regional availability using the runbook before applying."
  type        = string
  default     = "4.2"
}

variable "mq_instance_type" {
  description = "Supported broker instance type; m7g.medium is evaluation-sized, not free-tier."
  type        = string
  default     = "mq.m7g.medium"
}

variable "autoscaling_enabled" {
  description = "Opt into backend scaling after baseline measurement; only applies to running ECS services."
  type        = bool
  default     = false
}

variable "autoscaling_service" {
  description = "Backend to scale independently."
  type        = string
  default     = "supplier"
  validation {
    condition     = contains(["user", "supplier", "credit", "order"], var.autoscaling_service)
    error_message = "Choose user, supplier, credit or order."
  }
}

variable "requests_per_target" {
  description = "Measured target requests per minute per task on the direct backend ALB target group, not the UI/gateway route."
  type        = number
  default     = 60
  validation {
    condition     = var.requests_per_target > 0
    error_message = "requests_per_target must be positive; calibrate it from your baseline."
  }
}

variable "force_delete_images" {
  description = "Allow terraform destroy to remove nonempty ECR repositories. Destructive; opt in only for final cleanup."
  type        = bool
  default     = false
}
