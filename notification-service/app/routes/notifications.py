# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — the caller-scoped history, unread-count, mark-read, and read-all endpoints, with cursor pagination and an idempotent, concurrency-safe mark-read (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

"""Notification history and read-status endpoints.

Every query is scoped to ``recipient_id = identity.id``. The caller's user ID
comes only from the resolved identity, never from the request.
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth import get_current_identity
from app.clients import Identity
from app.db import get_db
from app.models import Notification
from app.schemas import (
    NotificationDTO,
    NotificationPage,
    ReadAllResult,
    UnreadCount,
    notification_dto_adapter,
)
from foc_observability import log_event


logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 20
MAX_LIMIT = 100

# notifications.id is bigint. Out-of-range integers are handled here instead of
# being sent to PostgreSQL, where the comparison would no longer use the index.
BIGINT_MIN = -(2**63)
BIGINT_MAX = 2**63 - 1

_AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"description": "Missing, malformed, or rejected bearer token"},
    503: {"description": "User Service is unavailable"},
}

router = APIRouter(prefix="/notifications", tags=["notifications"])

CurrentIdentity = Annotated[Identity, Depends(get_current_identity)]
DbSession = Annotated[Session, Depends(get_db)]


def _to_dto(row: Notification) -> NotificationDTO:
    return notification_dto_adapter.validate_python(
        {
            "id": row.id,
            "type": row.type,
            "recipient_role": row.recipient_role,
            "params": row.params,
            "title": row.title,
            "body": row.body,
            "order_id": row.order_id,
            "occurred_at": row.occurred_at,
            "created_at": row.created_at,
            "read_at": row.read_at,
        }
    )


@router.get("", response_model=NotificationPage, responses=_AUTH_RESPONSES)
def list_notifications(
    identity: CurrentIdentity,
    db: DbSession,
    cursor: Annotated[
        int | None,
        Query(description="Return notifications with id below this value"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
) -> NotificationPage:
    """The caller's notifications, newest first."""

    query = select(Notification).where(Notification.recipient_id == identity.id)
    if cursor is not None:
        if cursor <= BIGINT_MIN:
            return NotificationPage(items=[], next_cursor=None)
        query = query.where(Notification.id < min(cursor, BIGINT_MAX))
    # One extra row tells whether another page exists.
    rows = list(
        db.scalars(query.order_by(Notification.id.desc()).limit(limit + 1))
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    return NotificationPage(
        items=[_to_dto(row) for row in rows],
        next_cursor=rows[-1].id if has_more else None,
    )


@router.get("/unread-count", response_model=UnreadCount, responses=_AUTH_RESPONSES)
def unread_count(identity: CurrentIdentity, db: DbSession) -> UnreadCount:
    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.recipient_id == identity.id,
            Notification.read_at.is_(None),
        )
    )
    return UnreadCount(count=count or 0)


@router.post("/read-all", response_model=ReadAllResult, responses=_AUTH_RESPONSES)
def mark_all_read(identity: CurrentIdentity, db: DbSession) -> ReadAllResult:
    result = db.execute(
        update(Notification)
        .where(
            Notification.recipient_id == identity.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=func.now())
        .execution_options(synchronize_session=False)
    )
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "notifications_marked_read",
        recipient_id=identity.id,
        count=result.rowcount,
    )
    return ReadAllResult(updated=result.rowcount)


@router.post(
    "/{id}/read",
    response_model=NotificationDTO,
    responses={**_AUTH_RESPONSES, 404: {"description": "No such notification"}},
)
def mark_read(
    identity: CurrentIdentity,
    db: DbSession,
    notification_id: Annotated[int, Path(alias="id")],
) -> NotificationDTO:
    if not BIGINT_MIN <= notification_id <= BIGINT_MAX:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    # COALESCE keeps the first read_at. A concurrent request waits for the
    # first one's row lock, then sees its committed read_at.
    row = db.scalars(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.recipient_id == identity.id,
        )
        .values(read_at=func.coalesce(Notification.read_at, func.now()))
        .returning(Notification)
        .execution_options(synchronize_session=False)
    ).one_or_none()
    if row is None:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    db.commit()
    log_event(
        logger,
        logging.INFO,
        "notification_marked_read",
        recipient_id=identity.id,
        notification_id=notification_id,
    )
    return _to_dto(row)
