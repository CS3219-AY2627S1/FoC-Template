# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented paginated username search and batch lookup for current and deleted
# identities.
# Author review: I validated correctness and added boundary checks where needed.

"""Bounded identity projections over the existing User Service schema."""

from __future__ import annotations

import base64
import binascii
import re
from time import perf_counter
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.chat_schemas import (
    ChatParticipantsResponse,
    ChatParticipantSummary,
    ChatUserSearchQuery,
    ChatUserSearchResponse,
    ChatUserSummary,
)
from app.api.errors import ApiError, FieldError
from app.core.logging import logger
from app.models import AccountStatus, User
from app.registration.validation import normalize_username, validate_username


class _SearchCursor(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    v: Literal[1]
    query: str = Field(min_length=1, max_length=64)
    username: str = Field(min_length=1, max_length=64)
    user_id: UUID

    @field_validator("query", "username")
    @classmethod
    def normalized_ordering_value(cls, value: str) -> str:
        if normalize_username(validate_username(value)) != value:
            raise ValueError("Cursor must contain normalized values.")
        return value


def _encode_cursor(cursor: _SearchCursor) -> str:
    return base64.urlsafe_b64encode(cursor.model_dump_json().encode()).decode().rstrip("=")


def _decode_cursor(value: str, *, query: str) -> _SearchCursor:
    try:
        if len(value) > 1024 or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
            raise ValueError("Invalid encoding.")
        payload = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
        cursor = _SearchCursor.model_validate_json(payload)
        if cursor.query != query or _encode_cursor(cursor) != value:
            raise ValueError("Invalid query or noncanonical cursor.")
    except (ValueError, ValidationError, binascii.Error) as error:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "Input validation failed.",
            [FieldError("cursor", "INVALID_VALUE", "Use a cursor for the same username query.")],
        ) from error
    return cursor


async def search_users(
    session: AsyncSession,
    *,
    query: ChatUserSearchQuery,
    caller_id: UUID,
) -> ChatUserSearchResponse:
    """Literal substring matching and keyset pagination, with bounded lookahead."""

    cursor = _decode_cursor(query.cursor, query=query.username) if query.cursor else None
    statement = (
        select(User.id, User.username, User.normalized_username)
        .where(
            User.account_status == AccountStatus.ACTIVE,
            User.username.is_not(None),
            User.normalized_username.is_not(None),
            User.id != caller_id,
            User.normalized_username.contains(query.username, autoescape=True),
        )
        .order_by(User.normalized_username, User.id)
        .limit(query.limit + 1)
    )
    if cursor is not None:
        statement = statement.where(
            tuple_(User.normalized_username, User.id) > tuple_(cursor.username, cursor.user_id)
        )
    started_at = perf_counter()
    rows = (await session.execute(statement)).all()
    page = rows[: query.limit]
    next_cursor = None
    if len(rows) > query.limit:
        last = page[-1]
        next_cursor = _encode_cursor(
            _SearchCursor(
                v=1,
                query=query.username,
                username=last.normalized_username,
                user_id=last.id,
            )
        )
    logger.info(
        "chat username search completed",
        extra={
            "event": "chat_username_search_completed",
            "context": {
                "resultCount": len(page),
                "limit": query.limit,
                "hasNextPage": next_cursor is not None,
                "queryDurationMs": round((perf_counter() - started_at) * 1000, 3),
            },
        },
    )
    return ChatUserSearchResponse(
        items=[ChatUserSummary(user_id=row.id, username=row.username) for row in page],
        next_cursor=next_cursor,
    )


async def lookup_participants(
    session: AsyncSession,
    *,
    user_ids: list[UUID],
) -> ChatParticipantsResponse:
    """Resolve each requested identity once without consulting browser sessions."""

    ordered_ids = list(dict.fromkeys(user_ids))
    started_at = perf_counter()
    rows = (
        await session.execute(
            select(User.id, User.display_name, User.username, User.account_status).where(
                User.id.in_(ordered_ids)
            )
        )
    ).all()
    by_id = {row.id: row for row in rows}
    items = []
    missing = []
    for user_id in ordered_ids:
        row = by_id.get(user_id)
        if row is None:
            missing.append(user_id)
            continue
        deleted = row.account_status == AccountStatus.DELETED
        items.append(
            ChatParticipantSummary(
                user_id=row.id,
                display_name="Deleted User" if deleted else row.display_name,
                username=None if deleted else row.username,
                account_status=row.account_status,
            )
        )
    logger.info(
        "chat participant lookup completed",
        extra={
            "event": "chat_participant_lookup_completed",
            "context": {
                "batchSize": len(user_ids),
                "uniqueCount": len(ordered_ids),
                "resultCount": len(items),
                "missingCount": len(missing),
                "queryDurationMs": round((perf_counter() - started_at) * 1000, 3),
            },
        },
    )
    return ChatParticipantsResponse(items=items, missing_user_ids=missing)
