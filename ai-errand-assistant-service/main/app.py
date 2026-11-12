#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
#  Scope (AI-64): Generated the main FastAPI application file for the AI Errand Assistant Service, including CORS configuration, health check endpoint, and router inclusion.
# Author review: Code changes were checked and validated

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from main.routes import router

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app = FastAPI(title="AI Errand Assistant Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(router)


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    # Liveness only: no auth and no downstream calls, so it is safe to expose
    # and cheap enough for a container health check.
    return {"status": "ok"}


