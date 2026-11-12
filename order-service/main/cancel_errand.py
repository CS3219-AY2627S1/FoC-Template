# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict

from main.create_errand import bearer_scheme, verified_claims
from main.credit_operations import finish_terminal, prepare_terminal
from main.database import SessionLocal
from main.models import ErrandStatus


router = APIRouter()


class CancelErrandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    errand_id: UUID



class CancelErrandResponse(BaseModel):
    id: UUID
    status: ErrandStatus
    cancelled_at: datetime



@router.post("/errand/cancel", response_model=CancelErrandResponse)
def cancel_errand_request(
    request: CancelErrandRequest,
    claims: dict = Depends(verified_claims),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CancelErrandResponse:
    try:
        requester_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(401, "Access token contains an invalid user ID") from exc
    operation_id = prepare_terminal(
        SessionLocal, request.errand_id, requester_id, "CANCEL",
    )
    return CancelErrandResponse.model_validate(
        finish_terminal(SessionLocal, operation_id, credentials.credentials)
    )


