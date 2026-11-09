from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, proxy
from app.config import settings
from app.observability import OBS, route_label

app = FastAPI(title="FoC API Gateway", version="0.1.0")
# Edge observability: every request is labelled by downstream service
# (/api/credits/*) so the gateway never doubles the per-service panels but
# still shows 401/403/404/5xx that never reach a backend.
OBS.install(app, check_broker=False, route_labeler=route_label)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(proxy.router)
