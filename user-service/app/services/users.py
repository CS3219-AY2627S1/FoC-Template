"""Business logic for user registration, authentication, and profiles."""

import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID, uuid4

from argon2 import PasswordHasher
from fastapi import HTTPException
from sqlalchemy import func, or_, select
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import (
    AUTHENTICATION_ERROR,
    cleanup_sessions,
    revoke_user_sessions,
    SESSION_ABSOLUTE_LIFETIME,
    SESSION_INACTIVITY,
    hash_session_token,
)
from app.models import ADMIN_STATE_LOCK_NAME, AdminStateLock, User, UserSession
from app.schemas import LoginResponse, UserCreate, UserLogin, UserUpdate
from foc_observability import log_event


password_hasher = PasswordHasher()
logger = logging.getLogger(__name__)

# A valid Argon2id hash makes unknown-user attempts take the same verification
# path as known-user attempts without storing or comparing a plaintext secret.
DUMMY_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$mUztqNYD/jws5nZquc6jLw$"
    "Tm7egvuOlE/k+0RImshXBGISk81vSE39bBUf6Lw837U"
)


def _authentication_error() -> HTTPException:
    """Return the same safe error used for invalid bearer credentials."""

    return HTTPException(
        status_code=401,
        detail=AUTHENTICATION_ERROR,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _load_user(user_id: UUID, db: Session, *, lock: bool = False) -> User | None:
    """Load a user, optionally taking a row lock and refreshing its state."""

    statement = (
        select(User)
        .where(User.id == user_id)
        .execution_options(populate_existing=True)
    )
    if lock:
        statement = statement.with_for_update()
    return db.scalar(statement)


def _load_user_by_student_number(
    student_number: str, db: Session, *, lock: bool = False
) -> User | None:
    """Load a user by normalized student number, optionally with a row lock."""

    statement = (
        select(User)
        .where(User.nus_student_number == student_number)
        .execution_options(populate_existing=True)
    )
    if lock:
        statement = statement.with_for_update()
    return db.scalar(statement)


def _lock_admin_state(db: Session) -> None:
    """Lock the migrated singleton row coordinating admin-state mutations."""

    lock = db.scalar(
        select(AdminStateLock)
        .where(AdminStateLock.lock_name == ADMIN_STATE_LOCK_NAME)
        .with_for_update()
    )
    if lock is None:
        raise HTTPException(status_code=503, detail="Administrator state lock unavailable")


def hash_password(password: str) -> str:
    """Return an Argon2id hash for a plaintext password."""

    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password while treating malformed hashes as a failed login."""

    try:
        return password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def login_user(payload: UserLogin, db: Session) -> LoginResponse:
    """Authenticate a user and create a bounded-lived opaque session token."""

    student_number = payload.nus_student_number.strip().upper()

    try:
        user = db.scalar(
            select(User)
            .where(User.nus_student_number == student_number)
            .with_for_update()
        )
    except SQLAlchemyError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "login_failed",
            reason="database_unavailable",
        )
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    password_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_matches = verify_password(payload.password, password_hash)

    if not user or not password_matches or user.status != "active":
        log_event(
            logger,
            logging.WARNING,
            "login_failed",
            reason="invalid_credentials",
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    now = datetime.now(timezone.utc)
    raw_token = secrets.token_urlsafe(32)
    session = UserSession(
        user_id=user.id,
        token_hash=hash_session_token(raw_token),
        created_at=now,
        last_activity_at=now,
        expires_at=now + SESSION_INACTIVITY,
        absolute_expires_at=now + SESSION_ABSOLUTE_LIFETIME,
    )

    try:
        cleanup_sessions(db, now=now)
        db.add(session)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "login_failed",
            reason="session_persistence_failed",
        )
        raise HTTPException(status_code=503, detail="Authentication temporarily unavailable") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "login_failed",
            reason="database_unavailable",
        )
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    log_event(
        logger,
        logging.INFO,
        "login_succeeded",
        user_id=str(user.id),
    )
    return LoginResponse(
        access_token=raw_token,
        expires_in=int(SESSION_INACTIVITY.total_seconds()),
        user=user,
    )


def register_user(payload: UserCreate, db: Session) -> User:
    """Register a user, enforcing uniqueness and securely hashing the password."""

    email = str(payload.email).lower()
    student_number = payload.nus_student_number.strip()

    try:
        existing = db.scalar(
            select(User).where(
                (User.email == email) | (User.nus_student_number == student_number)
            )
        )
    except SQLAlchemyError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "registration_failed",
            reason="database_unavailable",
        )
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    if existing:
        log_event(
            logger,
            logging.WARNING,
            "registration_failed",
            reason="identity_conflict",
        )
        raise HTTPException(status_code=409, detail="Unable to create account")

    user = User(
        id=uuid4(),
        nus_student_number=student_number,
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        log_event(
            logger,
            logging.WARNING,
            "registration_failed",
            reason="identity_conflict",
        )
        raise HTTPException(status_code=409, detail="Unable to create account") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "registration_failed",
            reason="database_unavailable",
        )
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    log_event(
        logger,
        logging.INFO,
        "user_registered",
        user_id=str(user.id),
    )
    return user


def update_user_profile(user: User, payload: UserUpdate, db: Session) -> User:
    """Update only mutable fields on the authenticated user's profile."""

    # Lock the account row before changing credentials or profile state. Login,
    # deactivation, and reactivation acquire the same lock, so a session cannot
    # be created after this operation revokes existing sessions.
    try:
        db.refresh(user, with_for_update=True)
        if user.status != "active":
            raise _authentication_error()
        if not payload.model_fields_set:
            return user
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    if payload.email is not None:
        user.email = str(payload.email).strip().lower()
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)

    try:
        if payload.password is not None:
            revoke_user_sessions(db, user.id)
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Unable to update profile") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    changed_fields = sorted(payload.model_fields_set)
    log_event(
        logger,
        logging.INFO,
        "password_changed" if payload.password is not None else "profile_updated",
        user_id=str(user.id),
        changed_fields=changed_fields,
        sessions_revoked=payload.password is not None,
    )
    return user


def get_user_profile(user_id, db: Session) -> User:
    """Return an active user for a basic profile lookup."""

    try:
        user = db.get(User, user_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    if user is None or user.status != "active":
        raise HTTPException(status_code=404, detail="User not found")
    return user


def is_user_admin(user_id: UUID, db: Session) -> bool:
    """Return whether an existing, active account has administrative access."""

    try:
        user = db.get(User, user_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    # An inactive account must not retain authorization in another service,
    # even if its persisted role is still admin.
    return bool(user and user.status == "active" and user.role == "admin")


def get_user_status(user_id: UUID, db: Session) -> str:
    """Return an account status without disclosing whether a user exists."""

    try:
        user = db.get(User, user_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    return user.status if user else "unknown"


def _require_admin(actor_id: UUID, db: Session) -> None:
    """Reject the request unless the actor is an active administrator."""

    actor = _load_user(actor_id, db)
    if actor is None or actor.status != "active" or actor.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")


def _escape_like(value: str) -> str:
    """Escape LIKE wildcards so a search term only matches literally."""

    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_users_for_admin(
    actor_id: UUID,
    db: Session,
    *,
    query: str | None,
    status: str | None,
    limit: int,
    offset: int,
) -> tuple[list[User], int]:
    """Return a page of accounts in any status for an active administrator.

    ``query`` matches case-insensitively against the student number, email
    and display name. Results are newest first, with the ID as a tiebreaker so
    paging is stable when accounts share a creation time.
    """

    try:
        _require_admin(actor_id, db)

        filters = []
        if status is not None:
            filters.append(User.status == status)
        term = (query or "").strip().lower()
        if term:
            pattern = f"%{_escape_like(term)}%"
            filters.append(
                or_(
                    func.lower(User.nus_student_number).like(pattern, escape="\\"),
                    func.lower(User.email).like(pattern, escape="\\"),
                    func.lower(User.display_name).like(pattern, escape="\\"),
                )
            )

        total = db.scalar(select(func.count()).select_from(User).where(*filters)) or 0
        items = list(
            db.scalars(
                select(User)
                .where(*filters)
                .order_by(User.created_at.desc(), User.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    return items, total


def get_user_for_admin(actor_id: UUID, target_id: UUID, db: Session) -> User:
    """Return any account, whatever its status, to an active administrator."""

    try:
        _require_admin(actor_id, db)
        target = _load_user(target_id, db)
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return target


def suspend_user(actor_id: UUID, target_id: UUID, db: Session) -> User:
    """Suspend an account after authorizing the active administrator.

    Authorization and the status change are performed in the same transaction
    so callers cannot bypass the role check by invoking the service directly or
    by racing an account-status change. All sessions belonging to the target
    are revoked before the transaction commits.
    """

    try:
        # Suspension cannot change administrator state: self-suspension and
        # suspending another administrator are both rejected below. Perform
        # the authorization and target checks before taking account locks.
        actor = _load_user(actor_id, db)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        target = _load_user(target_id, db)
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot suspend their own account",
            )
        if target.role == "admin":
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot suspend another administrator",
            )

        actor = _load_user(actor_id, db, lock=True)
        target = _load_user(target_id, db, lock=True)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot suspend their own account",
            )
        if target.role == "admin":
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot suspend another administrator",
            )

        target.status = "suspended"
        revoke_user_sessions(db, target.id)
        db.commit()
        db.refresh(target)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    log_event(
        logger,
        logging.INFO,
        "account_suspended",
        actor_user_id=str(actor.id),
        target_user_id=str(target.id),
    )
    return target


def unsuspend_user(actor_id: UUID, target_id: UUID, db: Session) -> User:
    """Restore another suspended account to active status.

    Restoring a suspended administrator changes the active-admin set, so that
    case acquires the administrator-state lock before locking user rows.
    Existing sessions are revoked so the restored account must authenticate
    again after suspension.
    """

    try:
        actor = _load_user(actor_id, db)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        target = _load_user(target_id, db)
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot unsuspend their own account",
            )
        if target.status != "suspended":
            raise HTTPException(status_code=409, detail="User is not suspended")

        admin_state_locked = target.role == "admin"
        if admin_state_locked:
            _lock_admin_state(db)

        actor = _load_user(actor_id, db, lock=True)
        target = _load_user(target_id, db, lock=True)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot unsuspend their own account",
            )
        if target.status != "suspended":
            raise HTTPException(status_code=409, detail="User is not suspended")
        if target.role == "admin" and not admin_state_locked:
            raise HTTPException(
                status_code=503,
                detail="Account state changed; please retry the request",
            )

        target.status = "active"
        revoke_user_sessions(db, target.id)
        db.commit()
        db.refresh(target)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    log_event(
        logger,
        logging.INFO,
        "account_unsuspended",
        actor_user_id=str(actor.id),
        target_user_id=str(target.id),
    )
    return target


def revoke_admin_rights(actor_id: UUID, target_id: UUID, db: Session) -> User:
    """Remove administrator rights from another administrator account.

    The actor is locked and re-authorized in the same transaction as the role
    change. Self-revocation is rejected so the successful actor remains an
    administrator after the operation.
    """

    try:
        actor = _load_user(actor_id, db)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        target = _load_user(target_id, db)
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot revoke their own administrator rights",
            )
        if target.role != "admin":
            raise HTTPException(status_code=409, detail="User is not an administrator")

        _lock_admin_state(db)
        actor = _load_user(actor_id, db, lock=True)
        target = _load_user(target_id, db, lock=True)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot revoke their own administrator rights",
            )
        if target.role != "admin":
            raise HTTPException(status_code=409, detail="User is not an administrator")

        target.role = "user"
        db.commit()
        db.refresh(target)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    log_event(
        logger,
        logging.INFO,
        "admin_rights_revoked",
        actor_user_id=str(actor.id),
        target_user_id=str(target.id),
    )
    return target


def grant_admin_rights(actor_id: UUID, target_id: UUID, db: Session) -> User:
    """Grant administrator rights to another active user.

    The actor and target are re-authorized while locked in the same transaction
    as the role change. The administrator-state lock serializes this operation
    with other role and account-status mutations.
    """

    try:
        actor = _load_user(actor_id, db)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        target = _load_user(target_id, db)
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot grant themselves administrator rights",
            )
        if target.role == "admin":
            raise HTTPException(status_code=409, detail="User is already an administrator")
        if target.status != "active":
            raise HTTPException(
                status_code=409,
                detail="Only active users can be made administrators",
            )

        _lock_admin_state(db)
        actor = _load_user(actor_id, db, lock=True)
        target = _load_user(target_id, db, lock=True)
        if actor is None or actor.status != "active" or actor.role != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == actor.id:
            raise HTTPException(
                status_code=403,
                detail="Administrators cannot grant themselves administrator rights",
            )
        if target.role == "admin":
            raise HTTPException(status_code=409, detail="User is already an administrator")
        if target.status != "active":
            raise HTTPException(
                status_code=409,
                detail="Only active users can be made administrators",
            )

        target.role = "admin"
        db.commit()
        db.refresh(target)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    logger.info(
        "admin_rights_granted",
        extra={
            "actor_user_id": str(actor.id),
            "target_user_id": str(target.id),
        },
    )
    return target


def deactivate_user(user: User, db: Session) -> User:
    """Deactivate an account while retaining its persisted profile record."""

    try:
        candidate = _load_user(user.id, db)
        if candidate is None or candidate.status != "active":
            raise _authentication_error()

        admin_state_locked = candidate.role == "admin"
        if admin_state_locked:
            _lock_admin_state(db)

        locked_user = _load_user(user.id, db, lock=True)

        if locked_user is None or locked_user.status != "active":
            raise _authentication_error()
        if locked_user.role == "admin" and not admin_state_locked:
            raise HTTPException(
                status_code=503,
                detail="Account state changed; please retry the request",
            )
        if locked_user.role == "admin":
            active_admin_count = db.scalar(
                select(func.count(User.id)).where(
                    User.role == "admin",
                    User.status == "active",
                )
            )
            if active_admin_count <= 1:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot deactivate the last administrator",
                )

        locked_user.status = "deactivated"
        revoke_user_sessions(db, locked_user.id)
        db.commit()
        db.refresh(locked_user)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc
    log_event(
        logger,
        logging.INFO,
        "account_deactivated",
        user_id=str(locked_user.id),
    )
    return locked_user


def reactivate_user(payload: UserLogin, db: Session) -> User:
    """Reactivate a deactivated account after verifying its credentials.

    Reactivation is intentionally credential-based because a deactivated
    account cannot use ordinary authenticated operations. It updates the
    existing row and never creates a second account.
    """

    student_number = payload.nus_student_number.strip().upper()
    try:
        candidate = _load_user_by_student_number(student_number, db)
    except SQLAlchemyError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "account_reactivation_failed",
            reason="database_unavailable",
        )
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc

    password_hash = candidate.password_hash if candidate else DUMMY_PASSWORD_HASH
    password_matches = verify_password(payload.password, password_hash)
    if not candidate or not password_matches or candidate.status == "suspended":
        log_event(
            logger,
            logging.WARNING,
            "account_reactivation_failed",
            reason="invalid_credentials",
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    try:
        # An administrator reactivation changes the active-admin set, so it
        # follows the same lock order as deactivation and role revocation.
        if candidate.role == "admin":
            _lock_admin_state(db)
        user = _load_user_by_student_number(student_number, db, lock=True)
        if not user:
            log_event(
                logger,
                logging.WARNING,
                "account_reactivation_failed",
                reason="invalid_credentials",
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # Re-check after locking in case the password or account status changed
        # while the credential was being verified.
        if not verify_password(payload.password, user.password_hash) or user.status == "suspended":
            log_event(
                logger,
                logging.WARNING,
                "account_reactivation_failed",
                reason="invalid_credentials",
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user.status = "active"
        db.commit()
        db.refresh(user)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        log_event(
            logger,
            logging.ERROR,
            "account_reactivation_failed",
            reason="database_unavailable",
        )
        raise HTTPException(status_code=503, detail="Database temporarily unavailable") from exc
    log_event(
        logger,
        logging.INFO,
        "account_reactivated",
        user_id=str(user.id),
    )
    return user
