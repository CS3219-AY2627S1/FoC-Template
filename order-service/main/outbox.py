# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

"""Errand events published through the transactional outbox.

Each event is added to the caller's session, so it is relayed to Kafka (by Debezium)
if and only if the errand change it describes commits. The Kafka topic is the event
type and the message key is the errand ID, keeping each errand's events in order.
Payload field names are camelCase, matching the other services' events.
"""

from datetime import datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from main.models import ErrandStatus, OutboxEvent


ERRAND_AGGREGATE = "errand"


class ErrandEvent(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    errand_id: UUID
    requester_id: UUID
    credit_value: int


class ErrandCreatedEvent(ErrandEvent):
    supplier_id: UUID
    expires_at: datetime
    created_at: datetime


class ErrandAcceptedEvent(ErrandEvent):
    courier_id: UUID
    accepted_at: datetime


class ErrandDeliveredEvent(ErrandEvent):
    courier_id: UUID
    delivered_at: datetime


class ErrandCancelledEvent(ErrandEvent):
    cancelled_at: datetime


class ErrandCompletedEvent(ErrandEvent):
    courier_id: UUID
    completed_at: datetime


class ErrandFailedEvent(ErrandEvent):
    courier_id: UUID
    failure_reason: str
    failed_at: datetime


class ErrandExpiredEvent(ErrandEvent):
    resulting_status: ErrandStatus
    failure_reason: str | None = None
    expired_at: datetime


EVENT_TYPES: dict[type[ErrandEvent], str] = {
    ErrandCreatedEvent: "errand.created",
    ErrandAcceptedEvent: "errand.accepted",
    ErrandDeliveredEvent: "errand.delivered",
    ErrandCancelledEvent: "errand.cancelled",
    ErrandCompletedEvent: "errand.completed",
    ErrandFailedEvent: "errand.failed",
    ErrandExpiredEvent: "errand.expired",
}


def append_errand_event(db: Session, event: ErrandEvent) -> None:
    db.add(OutboxEvent(
        id=uuid4(),
        aggregatetype=ERRAND_AGGREGATE,
        aggregateid=str(event.errand_id),
        type=EVENT_TYPES[type(event)],
        payload=event.model_dump(mode="json", by_alias=True),
    ))


