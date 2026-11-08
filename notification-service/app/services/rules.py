from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from app.schemas.events import NotificationSourceEvent

# Mirrors order-service/app/services/supplier_deactivation.py reason string.
SUPPLIER_DEACTIVATION_REASON = re.compile(r"^Supplier .+ deactivated\.$")


@dataclass(frozen=True)
class NotificationDraft:
    recipient_id: str
    event_id: str
    event_type: str
    order_id: str
    order_name: str
    order_status: str
    title: str
    body: str
    created_at: datetime


def build_notifications(event: NotificationSourceEvent, event_id: str) -> list[NotificationDraft]:
    name = event.order_name or f"Order {event.order_id[:8]}"

    def draft(recipient_id: str, order_status: str, title: str, body: str) -> NotificationDraft:
        return NotificationDraft(
            recipient_id=recipient_id,
            event_id=event_id,
            event_type=event.event_type,
            order_id=event.order_id,
            order_name=name,
            order_status=order_status,
            title=title,
            body=body,
            created_at=event.timestamp,
        )

    if event.event_type == "OrderAccepted":
        return [
            draft(event.requester_id, "ACCEPTED", "Courier found", f'A courier accepted "{name}".')
        ]

    if event.event_type == "OrderPickedUp":
        return [
            draft(
                event.requester_id,
                "PICKED_UP",
                "Order picked up",
                f'"{name}" has been picked up.',
            )
        ]

    if event.event_type == "OrderDelivered":
        return [
            draft(
                event.requester_id,
                "AWAITING_APPROVAL",
                "Delivery awaiting approval",
                f'"{name}" was delivered and is awaiting your approval.',
            )
        ]

    if event.event_type in ("OrderApproved", "OrderCompleted"):
        drafts = [
            draft(
                event.requester_id,
                "COMPLETED",
                "Order complete",
                f'Your order "{name}" is complete.',
            )
        ]
        if event.courier_id:
            drafts.append(
                draft(
                    event.courier_id,
                    "COMPLETED",
                    "Delivery approved",
                    f'Your delivery of "{name}" was approved.',
                )
            )
        return drafts

    if event.event_type == "CourierWithdrawn":
        return [
            draft(
                event.requester_id,
                "OPEN",
                "Courier withdrew",
                f'The courier withdrew from "{name}"; it is open again.',
            )
        ]

    if event.event_type == "OrderExpired":
        return [
            draft(
                event.requester_id,
                "EXPIRED",
                "Order expired",
                f'"{name}" expired without being accepted.',
            )
        ]

    if event.event_type == "OrderCancelled":
        if event.reason and SUPPLIER_DEACTIVATION_REASON.match(event.reason):
            body = f'"{name}" was cancelled because the supplier was deactivated.'
            drafts = [draft(event.requester_id, "CANCELLED", "Order cancelled", body)]
            if event.courier_id:
                drafts.append(draft(event.courier_id, "CANCELLED", "Order cancelled", body))
            return drafts
        if not event.courier_id:
            return []
        body = f'The requester cancelled "{name}".'
        if event.reason:
            body = f"{body} Reason: {event.reason}"
        return [draft(event.courier_id, "CANCELLED", "Order cancelled", body)]

    return []
