# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""The shared observability layer is mounted with this service's prefix."""

from __future__ import annotations

from app.observability import OBS


def test_observability_uses_the_service_prefix():
    assert OBS.service == "notification-service"
    assert b"notification_http_requests_total" in OBS.render()
