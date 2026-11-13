data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  topic_arns = [
    for service in var.publisher_names :
    "arn:${data.aws_partition.current.partition}:sns:${var.region}:${data.aws_caller_identity.current.account_id}:${var.name_prefix}-${service}-events"
  ]
  publisher_arns = {
    for consumer in var.consumer_names : consumer => distinct([
      for route in values(var.event_subscriptions) : aws_sns_topic.events[route.publisher].arn
      if route.consumer == consumer
    ])
  }
}

resource "aws_kms_key" "messaging" {
  description             = "${var.name_prefix} SNS/SQS message encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableAccountIAMPolicies"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowTopicDelivery"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
          ArnEquals    = { "aws:SourceArn" = local.topic_arns }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "messaging" {
  name          = "alias/${var.name_prefix}-messaging"
  target_key_id = aws_kms_key.messaging.key_id
}

resource "aws_sns_topic" "events" {
  for_each          = var.publisher_names
  name              = "${var.name_prefix}-${each.key}-events"
  kms_master_key_id = aws_kms_key.messaging.arn
}

resource "aws_sqs_queue" "dead_letter" {
  for_each                  = var.consumer_names
  name                      = "${var.name_prefix}-${each.key}-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.messaging.arn
}

resource "aws_sqs_queue" "events" {
  for_each                   = var.consumer_names
  name                       = "${var.name_prefix}-${each.key}-events"
  message_retention_seconds  = 345600
  visibility_timeout_seconds = 60
  receive_wait_time_seconds  = 20
  kms_master_key_id          = aws_kms_key.messaging.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter[each.key].arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "events" {
  for_each  = var.consumer_names
  queue_url = aws_sqs_queue.dead_letter[each.key].url
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.events[each.key].arn]
  })
}

resource "aws_sqs_queue_policy" "sns" {
  for_each  = var.consumer_names
  queue_url = aws_sqs_queue.events[each.key].url
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      length(local.publisher_arns[each.key]) == 0 ? [] : [{
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.events[each.key].arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
          ArnEquals    = { "aws:SourceArn" = local.publisher_arns[each.key] }
        }
      }],
      [{
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.events[each.key].arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }]
    )
  })
}

resource "aws_sns_topic_subscription" "events" {
  for_each             = var.event_subscriptions
  topic_arn            = aws_sns_topic.events[each.value.publisher].arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.events[each.value.consumer].arn
  raw_message_delivery = true
  filter_policy_scope  = "MessageAttributes"
  filter_policy        = jsonencode({ eventType = each.value.event_types })
  depends_on           = [aws_sqs_queue_policy.sns]
}
