variable "name_prefix" {
  description = "Environment prefix for AWS resource names."
  type        = string
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
}

variable "database_subnet_ids" {
  description = "Subnet IDs for the RDS subnet group."
  type        = list(string)
}

variable "database_security_group_id" {
  description = "Security group ID for the RDS instance."
  type        = string
}
