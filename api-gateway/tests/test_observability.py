# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""The gateway edge metrics are labelled per downstream service."""

from __future__ import annotations

from app.observability import OBS, route_label


def test_gateway_route_label_collapses_to_the_downstream_service():
    assert route_label("/api/credits/u-1/balance") == "/api/credits/*"
    assert route_label("/api/orders/abc/approve") == "/api/orders/*"
    assert route_label("/health") == "/health"


def test_observability_uses_the_service_prefix():
    assert OBS.service == "api-gateway"
    assert b"gateway_http_requests_total" in OBS.render()
