from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, proxy, websocket
from app.config import settings
from app.observability import OBS, route_label


# The internal metrics server binds a fixed port per process, so the gateway
# runs single-worker and scales by replicas.
@asynccontextmanager
async def lifespan(app: FastAPI):
    server, thread = OBS.serve_metrics(settings.metrics_port)
    app.state.metrics_server = server
    app.state.metrics_thread = thread
    try:
        yield
    finally:
        await asyncio.to_thread(server.shutdown)
        thread.join()
        server.server_close()


app = FastAPI(title="FoC API Gateway", version="0.1.0", lifespan=lifespan)
# Edge observability: every request is labelled by downstream service
# (/api/credits/*) so the gateway never doubles the per-service panels but
# still shows 401/403/404/5xx that never reach a backend. /metrics is served
# only on the internal GATEWAY_METRICS_PORT, never on the public port.
OBS.install(app, check_broker=False, metrics_route=False, route_labeler=route_label)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(proxy.router)
app.include_router(websocket.router)
