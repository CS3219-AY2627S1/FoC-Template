# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

import os
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID, uuid4

import jwt
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints
from starlette.concurrency import run_in_threadpool

from main.database import SessionLocal
from main.credit_client import CreditClient
from main.credit_operations import creation_operation
from main.models import CreditOperation, Errand, ErrandStatus
from main.outbox import ErrandCreatedEvent, append_errand_event
from sqlalchemy import select


router = APIRouter()
bearer_scheme = HTTPBearer()

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8081")
SUPPLIER_SERVICE_URL = os.getenv("SUPPLIER_SERVICE_URL", "http://localhost:8080")
JWT_ISSUER = os.getenv("JWT_ISSUER", "campuscouriers-user-service")
jwk_client = PyJWKClient(f"{USER_SERVICE_URL}/.well-known/jwks.json")


class CreateErrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: ErrandStatus
    requester_id: UUID
    courier_id: UUID | None
    supplier_id: UUID
    required_item: str
    credit_value: int
    delivery_building_id: UUID
    delivery_floor: str | None
    delivery_description: str | None
    expires_at: datetime
    created_at: datetime


class CreateErrandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supplier_id: UUID
    required_item: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    credit_value: int = Field(gt=0, le=2_147_483_647, strict=True)
    delivery_building_id: UUID
    delivery_floor: str | None = Field(default=None, max_length=20)
    delivery_description: str | None = Field(default=None, max_length=500)
    expires_at: AwareDatetime


async def verify_supplier(supplier_id: str, access_token: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(
                f"{SUPPLIER_SERVICE_URL}/suppliers/{supplier_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail="Supplier Service is unavailable",
        ) from exc

    if response.status_code == 404:
        return False

    if response.status_code in (401, 403):
        raise HTTPException(status_code=response.status_code, detail="Supplier Service rejected access")

    if response.status_code != 200:
        raise HTTPException(status_code=503, detail="Could not verify supplier_id")

    return True




async def verify_credit_value(credit_value: int, access_token: str) -> bool:
    balance = await run_in_threadpool(CreditClient(access_token).available_balance)
    return balance >= credit_value


def verified_claims(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    try:
        signing_key = jwk_client.get_signing_key_from_jwt(credentials.credentials)
        return jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            issuer=JWT_ISSUER,
            options={"require": ["sub", "exp", "iss"]},
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(status_code=503, detail="User Service keys are unavailable") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def validate_expiry(expires_at: datetime, now: datetime) -> None:
    if expires_at <= now:
        message = "expires_at must be in the future"
    elif expires_at > now + timedelta(days=7):
        message = "expires_at must not exceed seven days from the current time"
    else:
        return

    raise HTTPException(
        status_code=422,
        detail=[{"loc": ["body", "expires_at"], "msg": message, "type": "value_error"}],
    )


def insert_errand(
    request: CreateErrandRequest, requester_id: UUID,
    errand_id: UUID | None = None, reservation_id: UUID | None = None, db=None,
) -> CreateErrandResponse:
    now = datetime.now(timezone.utc)
    validate_expiry(request.expires_at, now)

    errand = Errand(
        id=errand_id or uuid4(),
        status=ErrandStatus.OPEN,
        requester_id=requester_id,
        courier_id=None,
        supplier_id=request.supplier_id,
        required_item=request.required_item,
        credit_value=request.credit_value,
        delivery_building_id=request.delivery_building_id,
        delivery_floor=request.delivery_floor,
        delivery_description=request.delivery_description,
        expires_at=request.expires_at.astimezone(timezone.utc),
        created_at=now,
        credit_reservation_id=reservation_id,
    )
    def save(session):
        session.add(errand)
        session.flush()
        response = CreateErrandResponse.model_validate(errand)
        append_errand_event(session, ErrandCreatedEvent(
            errand_id=response.id,
            requester_id=response.requester_id,
            credit_value=response.credit_value,
            supplier_id=response.supplier_id,
            expires_at=response.expires_at,
            created_at=response.created_at,
        ))
        return response
    if db is not None:
        return save(db)
    with SessionLocal.begin() as session:
        return save(session)


def find_creation(requester_id, key, payload):
    with SessionLocal() as db:
        operation = db.scalar(select(CreditOperation).where(
            CreditOperation.requester_id == requester_id,
            CreditOperation.request_key == key,
        ))
        if operation is None:
            return None
        if operation.action != "CREATE" or operation.payload != payload:
            raise HTTPException(409, "Idempotency-Key was already used for a different request")
        return operation.id


def cleanup_creation(operation_id, token):
    with SessionLocal.begin() as db:
        operation = db.scalar(select(CreditOperation).where(
            CreditOperation.id == operation_id,
        ).with_for_update())
        if operation.state == "COMPENSATING":
            CreditClient(token).release(
                operation.reservation_id, operation.errand_id, operation.payload["credit_value"],
            )
            operation.state = "ABORTED"
    raise HTTPException(409, "Creation was aborted and reserved credits released; use a new Idempotency-Key")


def finish_creation(operation_id, request, requester_id, token):
    reservation = None
    try:
        with SessionLocal.begin() as db:
            operation = db.scalar(select(CreditOperation).where(
                CreditOperation.id == operation_id,
            ).with_for_update())
            if operation.state == "SUCCEEDED":
                return CreateErrandResponse.model_validate(db.get(Errand, operation.errand_id))
            if operation.state == "ABORTED":
                raise HTTPException(409, "Creation was aborted; use a new Idempotency-Key")
            if operation.state == "PENDING":
                # A repeat POST with the same orderId recovers a reservation
                # even if the previous HTTP response was lost.
                reservation = CreditClient(token).reserve(requester_id, operation.errand_id, request.credit_value)
                operation.reservation_id = reservation.reservation_id
                try:
                    validate_expiry(request.expires_at, datetime.now(timezone.utc))
                except HTTPException:
                    operation.state = "COMPENSATING"
                else:
                    response = insert_errand(
                        request, requester_id, operation.errand_id, reservation.reservation_id, db,
                    )
                    operation.state = "SUCCEEDED"
                    # Commit before returning success to the caller.
            else:
                response = None
            succeeded = operation.state == "SUCCEEDED"
        if succeeded:
            return response
    except Exception as exc:
        if reservation is None:
            raise
        # A successful external reservation cannot be undone by DB rollback.
        # Persist cleanup intent; if DB is down the original PENDING intent
        # still lets the same request/key recover its reservation later.
        try:
            with SessionLocal.begin() as db:
                operation = db.scalar(select(CreditOperation).where(
                    CreditOperation.id == operation_id,
                ).with_for_update())
                if db.get(Errand, operation.errand_id) is not None:
                    return CreateErrandResponse.model_validate(db.get(Errand, operation.errand_id))
                operation.reservation_id = reservation.reservation_id
                operation.state = "COMPENSATING"
        except Exception:
            raise HTTPException(503, "Creation outcome is pending; retry with the same Idempotency-Key") from exc
    return cleanup_creation(operation_id, token)


@router.post(
    "/errand/create",
    response_model=CreateErrandResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_errand_request(
    request: CreateErrandRequest,
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    claims: dict = Depends(verified_claims),
    idempotency_key: str | None = Header(default=None, min_length=1, max_length=120),
) -> CreateErrandResponse:
    try:
        requester_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(status_code=401, detail="Access token contains an invalid user ID") from exc

    key = "CREATE:" + (idempotency_key or str(uuid4()))
    response.headers["Idempotency-Key"] = key.removeprefix("CREATE:")
    payload = request.model_dump(mode="json")
    existing = await run_in_threadpool(find_creation, requester_id, key, payload)
    if existing is not None:
        return await run_in_threadpool(finish_creation, existing, request, requester_id, credentials.credentials)

    validate_expiry(request.expires_at, datetime.now(timezone.utc))

    supplier_valid = await verify_supplier(
        str(request.supplier_id),
        credentials.credentials,
    )
    if not supplier_valid:
        raise HTTPException(status_code=422, detail="Supplier does not exist or is unavailable")

    sufficient_credit = await verify_credit_value(request.credit_value, credentials.credentials)
    if not sufficient_credit:
        raise HTTPException(status_code=409, detail="Insufficient credit balance")

    # External checks may take time: verify expiry again before reservation.
    validate_expiry(request.expires_at, datetime.now(timezone.utc))

    operation_id = await run_in_threadpool(creation_operation, SessionLocal, requester_id, key, payload)
    return await run_in_threadpool(
        finish_creation, operation_id, request, requester_id, credentials.credentials,
    )


