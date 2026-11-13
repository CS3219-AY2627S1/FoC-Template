from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import Identity, get_notification_service, require_identity
from app.errors import ForbiddenError
from app.schemas.notification import (
    MarkAllReadResponse,
    NotificationListResponse,
    NotificationOut,
)
from app.services.notification_service import NotificationService
from foc_shared.auth import Role

router = APIRouter(prefix="/notifications", tags=["notifications"])

ServiceDep = Annotated[NotificationService, Depends(get_notification_service)]
IdentityDep = Annotated[Identity, Depends(require_identity)]

_MAX_LIMIT = 100


def _require_self_or_admin(identity: Identity, user_id: str) -> None:
    if identity.user_id != user_id and identity.role != Role.ADMIN.value:
        raise ForbiddenError("You may only view your own notifications.")


@router.get("/{user_id}", response_model=NotificationListResponse)
async def list_notifications(
    user_id: str,
    identity: IdentityDep,
    service: ServiceDep,
    unread_only: bool = False,
    limit: int = Query(default=20, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> NotificationListResponse:
    _require_self_or_admin(identity, user_id)
    items, total, unread_count = await service.list_notifications(
        user_id, unread_only=unread_only, limit=limit, offset=offset
    )
    return NotificationListResponse(
        items=[NotificationOut.model_validate(item) for item in items],
        unread_count=unread_count,
        total=total,
    )


@router.post("/{user_id}/{notification_id}/read")
async def mark_read(
    user_id: str,
    notification_id: str,
    identity: IdentityDep,
    service: ServiceDep,
) -> dict[str, str]:
    _require_self_or_admin(identity, user_id)
    await service.mark_read(user_id, notification_id)
    return {"status": "ok"}


@router.post("/{user_id}/read-all", response_model=MarkAllReadResponse)
async def mark_all_read(
    user_id: str,
    identity: IdentityDep,
    service: ServiceDep,
) -> MarkAllReadResponse:
    _require_self_or_admin(identity, user_id)
    marked = await service.mark_all_read(user_id)
    return MarkAllReadResponse(marked_read=marked, unread_count=0)
