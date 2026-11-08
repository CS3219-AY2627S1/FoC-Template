output "bucket_name" {
  description = "Name of the S3 bucket that holds shared Terraform state."
  value       = aws_s3_bucket.tfstate.id
}
