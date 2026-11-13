output "address" {
  description = "PostgreSQL endpoint used by application tasks."
  value       = aws_db_instance.postgres.address
}

output "master_user_secret_arn" {
  description = "Secrets Manager ARN of the RDS master password."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}
