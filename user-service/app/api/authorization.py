# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Implemented Supplier authorization decision handling.
# Author review: I validated correctness and added boundary checks where needed.

"""Narrow current-authorization contract for Supplier Service."""

# ruff: noqa: B008

from __future__ import annotations

from hmac import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from app.api.errors import ApiError
from app.api.schemas import (
    AuthorizationDecisionRequest,
    AuthorizationDecisionResponse,
)
from app.auth.dependencies import AuthenticatedPrincipal, get_current_principal, has_minimum_role
from app.core.config import Settings
from app.models import SystemRole

router = APIRouter(prefix="/v1/internal", tags=["internal"])


def require_supplier_service_identity(
    request: Request,
    supplied_secret: Annotated[str | None, Header(alias="X-FoC-Service-Secret")] = None,
) -> None:
    """Authenticate the only service permitted to request a role decision.

    The shared secret is a Compose development identity. Production replaces it
    with the equivalent task IAM or mTLS identity at the ingress boundary.
    """

    settings: Settings = request.app.state.settings
    configured_secret = settings.supplier_service_shared_secret
    if configured_secret is None or supplied_secret is None:
        raise ApiError(401, "INVALID_SERVICE_IDENTITY", "Service authentication is required.")
    if not compare_digest(supplied_secret, configured_secret.get_secret_value()):
        raise ApiError(401, "INVALID_SERVICE_IDENTITY", "Service authentication is required.")


@router.post("/authorization-decisions", response_model=AuthorizationDecisionResponse)
async def supplier_authorization_decision(
    body: AuthorizationDecisionRequest,
    _: Annotated[None, Depends(require_supplier_service_identity)],
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
) -> AuthorizationDecisionResponse:
    """Return a fail-closed current decision for one supplier-management action."""

    # The action is intentionally parsed even though all Phase 4 supplier-management
    # operations share the ADMIN threshold. It makes a later narrower permission
    # change explicit and prevents Supplier Service from sending an unrecognised action.
    del body
    user = principal.user
    return AuthorizationDecisionResponse(
        subject_id=user.id,
        account_status=user.account_status,
        system_role=user.system_role,
        allowed=has_minimum_role(user.system_role, SystemRole.ADMIN),
    )
