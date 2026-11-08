from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import UnauthorizedError
from app.services.notification_service import NotificationService
from foc_shared.auth import HEADER_USER_ID, HEADER_USER_ROLE, Role


@dataclass(frozen=True)
class Identity:
    user_id: str
    role: str


def require_identity(
    x_user_id: str | None = Header(default=None, alias=HEADER_USER_ID),
    x_user_role: str | None = Header(default=None, alias=HEADER_USER_ROLE),
) -> Identity:
    """Identity comes only from gateway-injected headers; a missing or blank
    role degrades to `client`, never `admin`."""
    if not x_user_id:
        raise UnauthorizedError("Authentication required.")
    role = x_user_role or Role.CLIENT.value
    return Identity(user_id=x_user_id, role=role)


async def get_notification_service(
    session: AsyncSession = Depends(get_session),
) -> NotificationService:
    return NotificationService(session)
