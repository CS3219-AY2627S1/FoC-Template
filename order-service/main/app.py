# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-06
# Scope (AI-25): Generated Kubernetes manifests, health endpoints and probe settings from my deployment specification.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

import os
import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from main.create_errand import router as create_errand_router
from main.accept_errand import router as accept_errand_router
from main.deliver_errand import router as deliver_errand_router
from main.cancel_errand import router as cancel_errand_router
from main.complete_errand import router as complete_errand_router
from main.fail_errand import router as fail_errand_router
from main.get_errands import router as get_errands_router
from main.recommendations.routes import router as recommendations_router
from main.expiry_worker import expiry_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = asyncio.Event()
    task = asyncio.create_task(expiry_worker(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        await task


cors_allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ORDER_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="Order Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    expose_headers=["Idempotency-Key"],
)

@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    """Liveness/readiness check for Kubernetes probes and the ALB (not routed through the Ingress)."""
    return {"status": "ok"}


app.include_router(create_errand_router)
app.include_router(accept_errand_router)
app.include_router(deliver_errand_router)
app.include_router(cancel_errand_router)
app.include_router(complete_errand_router)
app.include_router(fail_errand_router)
app.include_router(recommendations_router)
app.include_router(get_errands_router)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8002)


