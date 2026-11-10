# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented local runtime helpers for broker and multi-process tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Loopback-only contract fixture for multi-process tests. Never shipped in the image."""

from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from tests.conftest import Directory

directory = Directory()
identity_app = FastAPI()


@identity_app.get("/health/ready")
async def ready():
    return {"status": "ready"}


@identity_app.post("/test/users")
async def user():
    uid = directory.user()
    return {"userId": str(uid), "accessToken": directory.token(uid)}


@identity_app.post("/test/revoke")
async def revoke(request: Request):
    directory.revoked.add((await request.json())["token"])
    return {}


@identity_app.put("/test/users/{uid}")
async def update(uid: UUID, request: Request):
    directory.people[uid].update(await request.json())
    return {}


@identity_app.api_route("/{path:path}", methods=["GET", "POST"])
async def contract(request: Request):
    import httpx

    upstream = httpx.Request(
        request.method,
        str(request.url),
        headers=dict(request.headers),
        content=await request.body(),
    )
    response = await directory.handle(upstream)
    return JSONResponse(
        response.json() if response.content else {}, status_code=response.status_code
    )
