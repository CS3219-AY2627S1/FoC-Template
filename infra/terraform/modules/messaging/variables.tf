variable "region" {
  description = "AWS region for messaging encryption and topic policies."
  type        = string
}

variable "name_prefix" {
  description = "Environment prefix for AWS resource names."
  type        = string
}

variable "publisher_names" {
  description = "Publishing service names to provision SNS topics for."
  type        = set(string)
}

variable "event_subscriptions" {
  description = "SNS-to-SQS routes and allowed event types."
  type        = map(object({ publisher = string, consumer = string, event_types = set(string) }))
  validation {
    condition = alltrue([
      for route in values(var.event_subscriptions) :
      contains(var.publisher_names, route.publisher) && contains(var.consumer_names, route.consumer)
    ])
    error_message = "Subscription publishers and consumers must appear in their explicit capability lists."
  }
}

variable "consumer_names" {
  description = "Consuming service names to provision SQS queues and DLQs for."
  type        = set(string)
}
