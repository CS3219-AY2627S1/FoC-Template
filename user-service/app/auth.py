"""Bearer-session authentication dependencies and lifecycle helpers."""

import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, UserSession
from foc_observability import log_event


SESSION_INACTIVITY = timedelta(minutes=30)
SESSION_ABSOLUTE_LIFETIME = timedelta(hours=24)
# A protected request still validates the session against the database, but a
# session heartbeat only needs to be persisted periodically.  This prevents
# high-frequency consumers such as the Order Service from turning every read
# into a write while keeping the refresh interval far below the idle timeout.
SESSION_REFRESH_INTERVAL = timedelta(minutes=1)
SESSION_CLEANUP_INTERVAL = timedelta(hours=1)
AUTHENTICATION_ERROR = "Invalid authentication credentials"
_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,256}$")

bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def hash_session_token(token: str) -> str:
    """Hash a bearer token before it is used in a database lookup or stored."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def cleanup_sessions(db: Session, now: datetime | None = None) -> int:
    """Delete revoked and expired sessions and return the deleted row count.

    The caller owns the transaction and is responsible for committing it.
    """

    cleanup_time = now or datetime.now(timezone.utc)
    result = db.execute(
        delete(UserSession).where(
            or_(
                UserSession.revoked_at.is_not(None),
                UserSession.expires_at <= cleanup_time,
                UserSession.absolute_expires_at <= cleanup_time,
            )
        )
    )
    return result.rowcount or 0


def revoke_user_sessions(
    db: Session, user_id: UUID, now: datetime | None = None
) -> int:
    """Revoke every active session for a user within the caller's transaction."""

    revoked_at = now or datetime.now(timezone.utc)
    result = db.execute(
        update(UserSession)
        .where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
        .values(revoked_at=revoked_at)
    )
    return result.rowcount or 0


@dataclass(frozen=True)
class AuthContext:
    """The authenticated user and the session used for the current request."""

    user: User
    session: UserSession
    user_id: UUID


def _authentication_error() -> HTTPException:
    """Return the same safe error for every invalid authentication attempt."""

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=AUTHENTICATION_ERROR,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _utc(value: datetime) -> datetime:
    """Treat legacy naive database timestamps as UTC for safe comparisons."""

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthContext:
    """Validate a bearer session and refresh its inactivity deadline."""

    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
        or not _TOKEN_PATTERN.fullmatch(credentials.credentials)
    ):
        raise _authentication_error()

    now = datetime.now(timezone.utc)
    token_hash = hash_session_token(credentials.credentials)

    try:
        session = db.scalar(
            select(UserSession).where(
                UserSession.token_hash == token_hash,
                UserSession.revoked_at.is_(None),
            )
        )
        if session is None:
            raise _authentication_error()

        last_activity_at = _utc(session.last_activity_at)
        inactivity_expiry = min(
            _utc(session.expires_at),
            last_activity_at + SESSION_INACTIVITY,
        )
        if now >= inactivity_expiry or now >= _utc(session.absolute_expires_at):
            raise _authentication_error()

        user = db.get(User, session.user_id)
        if user is None or user.status != "active":
            raise _authentication_error()
        user_id = user.id

        if now >= last_activity_at + SESSION_REFRESH_INTERVAL:
            # Make the heartbeat conditional in the database as well as in
            # Python. Concurrent requests using the same token can otherwise
            # all observe the old timestamp and each issue an UPDATE.
            refresh_result = db.execute(
                update(UserSession)
                .where(
                    UserSession.id == session.id,
                    UserSession.revoked_at.is_(None),
                    UserSession.last_activity_at < now - SESSION_REFRESH_INTERVAL,
                )
                .values(
                    last_activity_at=now,
                    expires_at=min(
                        now + SESSION_INACTIVITY,
                        _utc(session.absolute_expires_at),
                    ),
                )
                .execution_options(synchronize_session=False)
            )
            if refresh_result.rowcount:
                db.commit()
                db.refresh(session)
            else:
                # Another request may have refreshed or revoked this session
                # after the initial read. Re-read the authoritative state so a
                # concurrent revocation cannot be mistaken for a successful
                # heartbeat.
                db.refresh(session)
                db.refresh(user)
                current_inactivity_expiry = min(
                    _utc(session.expires_at),
                    _utc(session.last_activity_at) + SESSION_INACTIVITY,
                )
                if (
                    session.revoked_at is not None
                    or now >= current_inactivity_expiry
                    or now >= _utc(session.absolute_expires_at)
                    or user.status != "active"
                ):
                    raise _authentication_error()
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication temporarily unavailable",
        ) from exc

    return AuthContext(user=user, session=session, user_id=user_id)


def revoke_session(context: AuthContext, db: Session) -> None:
    """Invalidate the currently authenticated session."""

    context.session.revoked_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "logout_failed",
            user_id=str(context.user_id),
            reason="database_unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication temporarily unavailable",
        ) from exc
    log_event(
        logger,
        logging.INFO,
        "logout_succeeded",
        user_id=str(context.user_id),
    )
