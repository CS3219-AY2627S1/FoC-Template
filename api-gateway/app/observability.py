# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""API-gateway observability handle.

The gateway's only backend route is a catch-all proxy, so FastAPI cannot give a
route template. ``_route_label`` collapses ``/api/credits/123/balance`` to
``/api/credits/*``: one label per downstream service, which keeps the edge
metrics cheap and comparable to the per-service metrics.
"""

from __future__ import annotations

from foc_shared.observability import Observability

OBS = Observability("api-gateway", prefix="gateway")


def route_label(path: str) -> str:
    parts = [part for part in path.split("/") if part]
    if len(parts) >= 2 and parts[0] == "api":
        return f"/api/{parts[1]}/*"
    return path or "/"
