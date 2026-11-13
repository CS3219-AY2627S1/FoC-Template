# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""API-gateway observability handle.

The gateway's only backend route is a catch-all proxy, so FastAPI cannot give a
route template. ``route_label`` collapses ``/api/credits/123/balance`` to
``/api/credits/*``: one label per downstream service in ``ROUTE_TABLE``, which
keeps the edge metrics cheap and comparable to the per-service metrics. Every
other path becomes ``<other>`` so client-chosen paths cannot grow the label set.
"""

from __future__ import annotations

from app.exposed_routes import ROUTE_TABLE
from foc_shared.observability import Observability

OBS = Observability("api-gateway", prefix="gateway")

OTHER_ROUTE = "<other>"


def route_label(path: str) -> str:
    parts = [part for part in path.split("/") if part]
    if len(parts) >= 2 and parts[0] == "api" and f"/api/{parts[1]}" in ROUTE_TABLE:
        return f"/api/{parts[1]}/*"
    return OTHER_ROUTE
