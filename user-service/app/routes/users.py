"""HTTP routes for user account and profile operations."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.auth import AuthContext, get_current_session, revoke_session
from app.db import get_db
from app.schemas import (
    AdminCheckResponse,
    BasicProfileResponse,
    InternalIdentityResponse,
    LoginResponse,
    UserCreate,
    UserLogin,
    UserPage,
    UserResponse,
    UserStatusResponse,
    UserUpdate,
)
from app.service_auth import require_internal_service
from app.services.users import (
    deactivate_user,
    get_user_for_admin,
    get_user_status,
    get_user_profile,
    grant_admin_rights,
    is_user_admin,
    list_users_for_admin,
    login_user,
    reactivate_user,
    register_user,
    revoke_admin_rights,
    suspend_user,
    unsuspend_user,
    update_user_profile,
)
from app.services.profiles import own_profile_response


router = APIRouter()


@router.get("/internal/auth/identity", response_model=InternalIdentityResponse)
def get_internal_identity(
    _: None = Depends(require_internal_service),
    auth: AuthContext = Depends(get_current_session),
):
    """Return only the verified active identity to a trusted service."""

    return InternalIdentityResponse(
        id=auth.user.id,
        role=auth.user.role,
        status=auth.user.status,
    )


@router.get("/internal/users/{user_id}/admin", response_model=AdminCheckResponse)
def check_user_admin(
    user_id: UUID,
    _: None = Depends(require_internal_service),
    db: Session = Depends(get_db),
):
    """Return an active user's admin status to a trusted internal service."""

    return AdminCheckResponse(is_admin=is_user_admin(user_id, db))


@router.get("/internal/users/{user_id}/status", response_model=UserStatusResponse)
def check_user_status(
    user_id: UUID,
    _: None = Depends(require_internal_service),
    db: Session = Depends(get_db),
):
    """Return an account's status to a trusted internal service."""

    return UserStatusResponse(status=get_user_status(user_id, db))


@router.post("/login", response_model=LoginResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user and return a bearer session token."""

    return login_user(payload, db)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Revoke the current bearer session."""

    revoke_session(auth, db)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/users/me", response_model=UserResponse)
def get_current_user(auth: AuthContext = Depends(get_current_session)):
    """Return the authenticated user's profile."""

    return own_profile_response(auth.user)


@router.get("/admin/users", response_model=UserPage)
def list_users(
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
    q: Annotated[str | None, Query(max_length=254)] = None,
    status_filter: Annotated[
        Literal["active", "deactivated", "suspended"] | None, Query(alias="status")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """List accounts in any status for an active administrator, newest first."""

    items, total = list_users_for_admin(
        auth.user_id, db, query=q, status=status_filter, limit=limit, offset=offset
    )
    return UserPage(
        items=[own_profile_response(user) for user in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/admin/users/{user_id}", response_model=UserResponse)
def get_user_as_admin(
    user_id: UUID,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Return any account's full profile, whatever its status, to an administrator."""

    return own_profile_response(get_user_for_admin(auth.user_id, user_id, db))


@router.post("/admin/users/{user_id}/suspend", response_model=UserResponse)
def suspend_account(
    user_id: UUID,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Suspend a user account as an active administrator."""

    return suspend_user(auth.user_id, user_id, db)


@router.post("/admin/users/{user_id}/unsuspend", response_model=UserResponse)
def unsuspend_account(
    user_id: UUID,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Restore another suspended account to active status."""

    return unsuspend_user(auth.user_id, user_id, db)


@router.post("/admin/users/{user_id}/revoke-admin", response_model=UserResponse)
def revoke_admin(
    user_id: UUID,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Revoke administrator rights from another administrator."""

    return revoke_admin_rights(auth.user_id, user_id, db)


@router.post("/admin/users/{user_id}/grant-admin", response_model=UserResponse)
def grant_admin(
    user_id: UUID,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Grant administrator rights to another active user."""

    return grant_admin_rights(auth.user_id, user_id, db)


@router.get("/users/{user_id}", response_model=BasicProfileResponse)
def get_user(user_id: UUID, auth: AuthContext = Depends(get_current_session), db: Session = Depends(get_db)):
    """Return only the display name of another active user."""

    user = get_user_profile(user_id, db)
    if user.id == auth.user.id:
        # The owner should use /users/me to receive their complete profile.
        return BasicProfileResponse(display_name=user.display_name)
    return user


@router.patch("/users/me", response_model=UserResponse)
@router.put("/users/me", response_model=UserResponse)
def update_current_user(
    payload: UserUpdate,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Update mutable fields on the authenticated user's profile."""

    user = update_user_profile(auth.user, payload, db)
    return own_profile_response(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Reject updates addressed to another user's profile."""

    if user_id != auth.user.id:
        raise HTTPException(status_code=403, detail="Cannot modify another user's profile")
    user = update_user_profile(auth.user, payload, db)
    return own_profile_response(user)


@router.delete("/users/me", response_model=UserResponse)
@router.post("/users/me/deactivate", response_model=UserResponse)
def deactivate_current_user(
    auth: AuthContext = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    """Deactivate the current account without deleting its profile record."""

    user = deactivate_user(auth.user, db)
    return own_profile_response(user)


@router.post("/users/me/reactivate", response_model=UserResponse)
@router.post("/users/reactivate", response_model=UserResponse)
@router.post("/reactivate", response_model=UserResponse)
def reactivate_current_user(payload: UserLogin, db: Session = Depends(get_db)):
    """Reactivate an account by verifying its existing login credentials."""

    user = reactivate_user(payload, db)
    return own_profile_response(user)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    """Create and return a newly registered user account."""

    return register_user(payload, db)
