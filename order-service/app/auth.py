"""Authenticate Order Service requests by asking the User Service."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.clients import AuthenticationUnavailableError, Identity, InvalidSessionError


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_identity(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> Identity:
    """Resolve the bearer token. A User Service outage is a 503, not a logout."""

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized()
    try:
        return request.app.state.user_client.resolve_identity(token.strip())
    except InvalidSessionError:
        raise _unauthorized() from None
    except AuthenticationUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication temporarily unavailable",
        ) from None


def get_current_admin(
    identity: Annotated[Identity, Depends(get_current_identity)],
) -> Identity:
    """Allow only administrators. The role is re-read from the User Service on
    every request, so revoked rights or a suspension take effect immediately."""

    if identity.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return identity
