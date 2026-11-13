"""Kafka topics, consumer groups, and Credit messaging tunables."""

from dataclasses import dataclass


ORDER_TOPIC = "order.events"
CREDIT_TOPIC = "credit.events"
ORDER_EVENTS_DLQ = "credit-service.order-events.dlq"

ORDER_CONSUMER_GROUP = "credit-service-order"

ORDER_EVENT_TYPES = frozenset(
    {"order.created", "order.completed", "order.cancelled", "order.expired"}
)
CREDIT_EVENT_TYPES = frozenset(
    {
        "credit.reserved",
        "credit.reservation_failed",
    }
)
OUTGOING_EVENT_TYPES = CREDIT_EVENT_TYPES


@dataclass(frozen=True)
class EventStream:
    """Kafka resources and relevant event types for one Credit worker."""

    topic: str
    group_id: str
    dlq_topic: str
    event_types: frozenset[str]
    key_field: str
    event_prefix: str


EVENT_STREAMS = {
    "order": EventStream(
        topic=ORDER_TOPIC,
        group_id=ORDER_CONSUMER_GROUP,
        dlq_topic=ORDER_EVENTS_DLQ,
        event_types=ORDER_EVENT_TYPES,
        key_field="order_id",
        event_prefix="order.",
    ),
}

RELAY_BATCH_SIZE = 100
RELAY_POLL_SECONDS = 0.5
WORKER_HEARTBEAT_SECONDS = 60.0
PUBLISH_TIMEOUT_SECONDS = 10
HTTP_TIMEOUT_SECONDS = 3.0
