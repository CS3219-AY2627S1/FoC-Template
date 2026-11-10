"""Chat-service observability handle (shared implementation in ``foc_shared``)."""

from __future__ import annotations

from foc_shared.observability import Observability

OBS = Observability("chat-service", prefix="chat")
