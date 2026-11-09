# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""Order-service observability handle (shared implementation in ``foc_shared``)."""

from __future__ import annotations

from foc_shared.observability import Observability

OBS = Observability("order-service", prefix="order")
