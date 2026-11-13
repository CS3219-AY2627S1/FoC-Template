output "topic_arns" {
  description = "SNS topic ARNs keyed by publishing service."
  value       = { for name, topic in aws_sns_topic.events : name => topic.arn }
}

output "queue_urls" {
  description = "SQS queue URLs keyed by consuming service."
  value       = { for name, queue in aws_sqs_queue.events : name => queue.url }
}

output "queue_arns" {
  description = "SQS queue ARNs keyed by consuming service."
  value       = { for name, queue in aws_sqs_queue.events : name => queue.arn }
}

output "queue_names" {
  description = "SQS queue names keyed by consuming service."
  value       = { for name, queue in aws_sqs_queue.events : name => queue.name }
}

output "kms_key_arn" {
  description = "Customer-managed key used by messaging topics and queues."
  value       = aws_kms_key.messaging.arn
}
