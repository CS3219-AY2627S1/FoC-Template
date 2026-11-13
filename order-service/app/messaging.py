"""Kafka topic names and tunables. These are constants, not environment variables."""

from datetime import timedelta

ORDER_TOPIC = "order.events"
CREDIT_TOPIC = "credit.events"
CREDIT_DLQ_TOPIC = "order-service.credit-events.dlq"
CONSUMER_GROUP = "order-service"

INCOMING_EVENT_TYPES = frozenset({"credit.reserved", "credit.reservation_failed"})

ORDER_TTL = timedelta(hours=1)
MAX_ATTEMPTS = 5
RETRY_BACKOFF_SECONDS = (0.5, 1.0, 2.0, 4.0)
RELAY_BATCH_SIZE = 100
RELAY_POLL_SECONDS = 0.5
WORKER_HEARTBEAT_SECONDS = 60.0
EXPIRY_SWEEP_SECONDS = 10
HTTP_TIMEOUT_SECONDS = 3.0
