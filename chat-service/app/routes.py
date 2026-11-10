# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented Chat HTTP handlers for discovery, conversations, blocking, and read
# updates.
# Author review: I validated correctness and added boundary checks where needed.

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from app.errors import unauthorized
from app.identity import Principal
from app.schemas import CreateConversation, HistoryQuery, PageQuery, Read, SearchQuery

router = APIRouter(prefix="/v1/chat")


async def principal(request: Request):
    value = request.headers.get("Authorization", "")
    if not value.startswith("Bearer "):
        raise unauthorized()
    return await request.app.state.identity.authenticate(value[7:])


Caller = Annotated[Principal, Depends(principal)]


@router.get("/users")
async def search(request: Request, query: Annotated[SearchQuery, Query()], caller: Caller):
    return await request.app.state.identity.search(caller, query.model_dump(exclude_none=True))


@router.post("/conversations")
async def create(request: Request, body: CreateConversation, caller: Caller):
    return await request.app.state.chat.create(caller.user_id, body.recipientUserId)


@router.get("/conversations")
async def conversations(request: Request, query: Annotated[PageQuery, Query()], caller: Caller):
    return await request.app.state.chat.conversations(caller.user_id, query)


@router.get("/conversations/{cid}")
async def conversation(request: Request, cid: UUID, caller: Caller):
    return await request.app.state.chat.conversation(caller.user_id, cid)


@router.get("/conversations/{cid}/messages")
async def history(
    request: Request, cid: UUID, query: Annotated[HistoryQuery, Query()], caller: Caller
):
    return await request.app.state.chat.history(caller.user_id, cid, query)


@router.post("/conversations/{cid}/read")
async def read(request: Request, cid: UUID, body: Read, caller: Caller):
    return await request.app.state.chat.read(caller.user_id, cid, body.upToSequence)


@router.get("/blocks")
async def blocks(request: Request, query: Annotated[PageQuery, Query()], caller: Caller):
    return await request.app.state.chat.blocks(caller.user_id, query)


@router.put("/blocks/{user_id}")
async def block_user(request: Request, user_id: UUID, caller: Caller):
    return await request.app.state.chat.set_block(caller.user_id, user_id, True)


@router.delete("/blocks/{user_id}")
async def unblock_user(request: Request, user_id: UUID, caller: Caller):
    return await request.app.state.chat.set_block(caller.user_id, user_id, False)
