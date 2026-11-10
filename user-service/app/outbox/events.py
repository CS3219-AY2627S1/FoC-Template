# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Implemented registration event creation and serialization.
# Author review: I validated correctness and added boundary checks where needed.

"""The public, credential-free registration-event contract."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

USER_REGISTERED_EVENT_TYPE = "user.registered.v1"


@dataclass(frozen=True)
class SafeOutboxEvent:
    """The only event representation permitted to leave User Service."""

    event_id: UUID
    event_type: str
    user_id: UUID
    occurred_at: datetime

    def payload(self) -> dict[str, str]:
        """Return exactly the four versioned event fields consumers require."""

        occurred_at = self.occurred_at.astimezone(UTC).isoformat().replace("+00:00", "Z")
        return {
            "eventId": str(self.event_id),
            "eventType": self.event_type,
            "userId": str(self.user_id),
            "occurredAt": occurred_at,
        }
