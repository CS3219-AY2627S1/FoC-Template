variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "alb_arn" {
  type        = string
  description = "ARN of the active private Gateway ALB created from the EKS Ingress."
}

variable "alb_dns_name" {
  type        = string
  description = "Private DNS name of the Gateway ALB."
}

variable "alb_security_group_id" {
  type        = string
  description = "Security group attached to the private Gateway ALB."
}
