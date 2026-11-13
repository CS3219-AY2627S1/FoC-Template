mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws", dns_suffix = "amazonaws.com" }
  }
  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:ap-southeast-1:123456789012:key/00000000-0000-0000-0000-000000000001"
      key_id = "00000000-0000-0000-0000-000000000001"
    }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ap-southeast-1:123456789012:foc-test-events" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:ap-southeast-1:123456789012:foc-test-events"
      url = "https://sqs.ap-southeast-1.amazonaws.com/123456789012/foc-test-events"
    }
  }
}

run "messaging_topology_and_permissions" {
  command = apply

  module {
    source = "../../modules/messaging"
  }

  variables {
    region          = "ap-southeast-1"
    name_prefix     = "foc-test"
    publisher_names = ["user", "supplier", "order", "credit"]
    consumer_names  = ["user", "supplier", "order", "credit", "realtime"]
    event_subscriptions = {
      supplier_changed = {
        publisher   = "supplier"
        consumer    = "realtime"
        event_types = ["SupplierChangedEvent"]
      }
      errand_message_posted = {
        publisher   = "order"
        consumer    = "realtime"
        event_types = ["ErrandMessagePostedEvent", "ErrandChatReadEvent"]
      }
      user_created = {
        publisher   = "user"
        consumer    = "credit"
        event_types = ["UserCreatedEvent"]
      }
      errand_settlement = {
        publisher   = "order"
        consumer    = "credit"
        event_types = ["ErrandCompletedEvent", "ErrandCancelledEvent", "ErrandExpiredEvent"]
      }
      credit_settlement_result = {
        publisher   = "credit"
        consumer    = "order"
        event_types = ["CreditPaidEvent", "CreditPaymentDeclinedEvent", "CreditRefundedEvent", "CreditRefundDeclinedEvent"]
      }
    }
  }

  assert {
    condition = (
      toset(keys(aws_sns_topic.events)) == toset(["user", "supplier", "order", "credit"])
      && toset(keys(aws_sqs_queue.events)) == toset(["user", "supplier", "order", "credit", "realtime"])
    )
    error_message = "Provision topics for publishers and queues and DLQs for consumers."
  }

  assert {
    condition = alltrue([
      for service, queue in aws_sqs_queue.events : (
        queue.name == "foc-test-${service}-events"
        && queue.visibility_timeout_seconds == 60
        && queue.receive_wait_time_seconds == 20
        && queue.message_retention_seconds == 345600
        && queue.kms_master_key_id == aws_kms_key.messaging.arn
        && jsondecode(queue.redrive_policy).deadLetterTargetArn == aws_sqs_queue.dead_letter[service].arn
        && jsondecode(queue.redrive_policy).maxReceiveCount == 5
        && aws_sqs_queue.dead_letter[service].message_retention_seconds == 1209600
        && aws_sqs_queue.dead_letter[service].kms_master_key_id == aws_kms_key.messaging.arn
      )
    ])
    error_message = "Queues must retain configured polling, encryption, retention, and redrive behavior."
  }

  assert {
    condition = (
      alltrue([for service, topic in aws_sns_topic.events : topic.kms_master_key_id == aws_kms_key.messaging.arn])
      && aws_kms_key.messaging.enable_key_rotation
    )
    error_message = "Topics and queues must use the rotating messaging key."
  }

  assert {
    condition = {
      for name, subscription in aws_sns_topic_subscription.events :
      name => toset(jsondecode(subscription.filter_policy).eventType)
      } == {
      for name, route in var.event_subscriptions : name => route.event_types
    }
    error_message = "Create exactly the configured subscriptions with their requested event filters."
  }

  assert {
    condition = alltrue([
      for subscription in values(aws_sns_topic_subscription.events) :
      subscription.raw_message_delivery
      && subscription.protocol == "sqs"
      && subscription.filter_policy_scope == "MessageAttributes"
    ])
    error_message = "Subscriptions must use raw SQS delivery and filter on message attributes."
  }

  assert {
    condition = alltrue([
      for service, policy in aws_sqs_queue_policy.sns : (
        length(jsondecode(policy.policy).Statement) == (contains(["order", "credit", "realtime"], service) ? 2 : 1)
        && alltrue([
          for statement in jsondecode(policy.policy).Statement : (
            statement.Condition.StringEquals["aws:SourceAccount"] == "123456789012"
          ) if statement.Effect == "Allow"
        ])
        && alltrue([
          for statement in jsondecode(policy.policy).Statement :
          statement.Condition.Bool["aws:SecureTransport"] == "false"
          if statement.Effect == "Deny"
        ])
      )
    ])
    error_message = "Queue policies must restrict SNS delivery to this account and deny non-TLS access."
  }
}
