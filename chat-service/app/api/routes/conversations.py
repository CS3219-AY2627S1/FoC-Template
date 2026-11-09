# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Client HTTP API: inbox, history, creating chats. Live traffic goes over /chat/ws."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import current_user
from app.schemas.conversations import CreateDirectBody, CreateGroupBody
from app.state import AppState, get_state

router = APIRouter(prefix="/chat/conversations", tags=["conversations"])


@router.get("")
async def inbox(
    user: uuid.UUID = Depends(current_user), state: AppState = Depends(get_state)
) -> list[dict[str, Any]]:
    return await state.run(lambda s: s.inbox(user))


@router.post("/direct")
async def create_direct(
    body: CreateDirectBody,
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> dict[str, Any]:
    """Get or create the 1:1 chat with another user."""
    return await state.run(lambda s: s.create_direct(user, body.user_id))


@router.post("/group", status_code=status.HTTP_201_CREATED)
async def create_group(
    body: CreateGroupBody,
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> dict[str, Any]:
    return await state.run(lambda s: s.create_group(user, body.title, body.member_ids))


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID,
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> dict[str, Any]:
    return await state.run(lambda s: s.conversation_for(user, conversation_id))


@router.get("/{conversation_id}/messages")
async def history(
    conversation_id: uuid.UUID,
    before_seq: int | None = Query(default=None, ge=0),
    after_seq: int | None = Query(default=None, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> dict[str, Any]:
    """`after_seq`: catch up oldest-first (reconnect, gaps). Otherwise the newest page,
    or the page before `before_seq` (scrolling back). Always returned in seq order."""
    return await state.run(
        lambda s: s.history(
            user, conversation_id, before_seq=before_seq, after_seq=after_seq, limit=limit
        )
    )


@router.post("/{conversation_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave(
    conversation_id: uuid.UUID,
    user: uuid.UUID = Depends(current_user),
    state: AppState = Depends(get_state),
) -> Response:
    await state.run(lambda s: s.leave(user, conversation_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
