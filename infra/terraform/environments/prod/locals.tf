locals {
  region = "ap-southeast-1"

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
      event_types = ["ErrandCancelledEvent", "ErrandExpiredEvent", "ErrandCompletedEvent"]
    }
    credit_settlement_result = {
      publisher   = "credit"
      consumer    = "order"
      event_types = ["CreditPaidEvent", "CreditPaymentDeclinedEvent", "CreditRefundedEvent", "CreditRefundDeclinedEvent"]
    }
  }
  event_publishers = toset([for route in values(local.event_subscriptions) : route.publisher])
  event_consumers  = toset([for route in values(local.event_subscriptions) : route.consumer])
}
