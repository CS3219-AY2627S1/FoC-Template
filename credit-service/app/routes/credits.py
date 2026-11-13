"""Credit account HTTP interface."""

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth import (
    get_current_admin,
    get_current_identity,
)
from app.clients import Identity
from app.db import get_db
from app.schemas import (
    AdminAdjustmentRequest,
    CreditAccountCreate,
    CreditBalanceResponse,
    CreditTransactionPage,
)
from app.services.credits import (
    adjust_account,
    ensure_credit_account,
    get_account,
    list_transactions,
)

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
CurrentIdentity = Annotated[Identity, Depends(get_current_identity)]
CurrentAdmin = Annotated[Identity, Depends(get_current_admin)]


@router.get("/credits/me", response_model=CreditBalanceResponse)
def my_balance(identity: CurrentIdentity, db: Db) -> CreditBalanceResponse:
    return CreditBalanceResponse.model_validate(get_account(db, identity.id))


@router.get("/credits/me/transactions", response_model=CreditTransactionPage)
def my_transactions(
    identity: CurrentIdentity,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CreditTransactionPage:
    items, total = list_transactions(db, identity.id, limit=limit, offset=offset)
    return CreditTransactionPage(
        items=items, total=total, limit=limit, offset=offset
    )


@router.get("/admin/credits/{user_id}", response_model=CreditBalanceResponse)
def admin_balance(user_id: UUID, _admin: CurrentAdmin, db: Db) -> CreditBalanceResponse:
    return CreditBalanceResponse.model_validate(get_account(db, user_id))


@router.get(
    "/admin/credits/{user_id}/transactions", response_model=CreditTransactionPage
)
def admin_transactions(
    user_id: UUID,
    _admin: CurrentAdmin,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CreditTransactionPage:
    items, total = list_transactions(db, user_id, limit=limit, offset=offset)
    return CreditTransactionPage(
        items=items, total=total, limit=limit, offset=offset
    )


@router.post(
    "/admin/credits/{user_id}/adjust", response_model=CreditBalanceResponse
)
def admin_adjust(
    user_id: UUID,
    payload: AdminAdjustmentRequest,
    admin: CurrentAdmin,
    db: Db,
    correlation_id: Annotated[
        UUID | None, Header(alias="X-Correlation-ID")
    ] = None,
) -> CreditBalanceResponse:
    account = adjust_account(
        db,
        user_id=user_id,
        actor_user_id=admin.id,
        amount=payload.amount,
        reason=payload.reason,
        correlation_id=correlation_id or uuid4(),
    )
    db.commit()
    db.refresh(account)
    return CreditBalanceResponse.model_validate(account)


@router.put(
    "/admin/credit-accounts/{user_id}",
    response_model=CreditBalanceResponse,
    status_code=status.HTTP_201_CREATED,
)
def provision_account(
    user_id: UUID,
    admin: CurrentAdmin,
    request: Request,
    db: Db,
    payload: Annotated[CreditAccountCreate, Body()] = CreditAccountCreate(),
) -> CreditBalanceResponse:
    if payload.user_id is not None and payload.user_id != user_id:
        raise HTTPException(status_code=422, detail="Path and payload user IDs differ")
    operation_id = uuid4()
    account = ensure_credit_account(
        db,
        user_id=user_id,
        initial_allocation=request.app.state.settings.initial_credit_allocation,
        actor_user_id=admin.id,
        operation_id=operation_id,
        correlation_id=operation_id,
    )
    db.commit()
    db.refresh(account)
    return CreditBalanceResponse.model_validate(account)
