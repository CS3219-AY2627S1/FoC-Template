# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-28
# Scope: Implemented wallet, transaction-history and admin wallet lookup endpoints; added
# read-only admin settlement and credit analytics endpoints.
# Author review: I validated correctness and supplied additional boundary checks.

"""Authenticated wallet, transaction-history and administrator lookups."""

from datetime import UTC, datetime, time, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request

from app.credits.errors import ApiError
from app.credits.schemas import (
    AnalyticsQuery,
    Circulation,
    CreditAnalytics,
    Page,
    PageQuery,
    Principal,
    SettlementView,
    TransactionView,
    TransferTotals,
    WalletView,
)

router = APIRouter(prefix="/v1", tags=["Credits"])
# Singapore has used UTC+8 without daylight saving since 1982; matches Order's analytics days.
SINGAPORE = timezone(timedelta(hours=8), "Asia/Singapore")


async def authenticate(
    request: Request, authorization: Annotated[str | None, Header()] = None
) -> Principal:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "UNAUTHENTICATED", "A bearer token is required.")
    return await request.app.state.identity.identity(token.strip())


Auth = Annotated[Principal, Depends(authenticate)]
Paging = Annotated[PageQuery, Query()]


def require_admin(principal: Principal) -> None:
    # M4NFR4.1: only the owner and authorized administrators see a wallet.
    if principal.system_role not in ("ADMIN", "SUPER_ADMIN"):
        raise ApiError(403, "FORBIDDEN", "Administrator access is required.")


def wallet_view(row: dict | None) -> WalletView:
    if row is None:
        raise ApiError(404, "WALLET_NOT_READY", "This wallet is still being set up. Try again.")
    return WalletView(
        user_id=row["user_id"],
        available=row["available"],
        reserved=row["reserved"],
        total=row["available"] + row["reserved"],
        updated_at=row["updated_at"],
    )


async def history_page(request: Request, user_id: UUID, query: PageQuery):
    rows, total = await request.app.state.ledger.history(user_id, query.page, query.page_size)
    return Page[TransactionView](
        items=[
            TransactionView(
                transaction_id=row["id"],
                type=row["type"],
                amount=row["amount"],
                wallet_user_id=row["wallet_user_id"],
                counterparty_user_id=row["counterparty_user_id"],
                order_id=row["order_id"],
                created_at=row["created_at"],
            )
            for row in rows
        ],
        page=query.page,
        page_size=query.page_size,
        total=total,
    )


@router.get("/wallets/me", response_model=WalletView)
async def my_wallet(request: Request, principal: Auth):
    # Get-or-create: users who registered before Credit receive their wallet on first view.
    return wallet_view(await request.app.state.ledger.owner_wallet(principal.user_id))


@router.get("/wallets/me/transactions", response_model=Page[TransactionView])
async def my_transactions(request: Request, principal: Auth, query: Paging):
    wallet_view(await request.app.state.ledger.owner_wallet(principal.user_id))
    return await history_page(request, principal.user_id, query)


@router.get("/admin/wallets/{user_id}", response_model=WalletView)
async def admin_wallet(user_id: UUID, request: Request, principal: Auth):
    require_admin(principal)
    return wallet_view(await request.app.state.ledger.wallet(user_id))


@router.get("/admin/wallets/{user_id}/transactions", response_model=Page[TransactionView])
async def admin_transactions(user_id: UUID, request: Request, principal: Auth, query: Paging):
    require_admin(principal)
    return await history_page(request, user_id, query)


@router.get("/admin/credit/reservations/{order_id}", response_model=SettlementView)
async def admin_settlement(order_id: UUID, request: Request, principal: Auth):
    # N2F3.4.2: read-only; disputes never change reservations or balances.
    require_admin(principal)
    row = await request.app.state.ledger.status(order_id)
    if row is None:
        raise ApiError(
            404, "RESERVATION_NOT_FOUND", "No credit reservation exists for this errand."
        )
    return SettlementView(
        order_id=row["order_id"],
        state=row["state"],
        amount=row["amount"],
        updated_at=row["updated_at"],
    )


@router.get("/admin/credit/analytics", response_model=CreditAnalytics)
async def admin_credit_analytics(
    request: Request, principal: Auth, query: Annotated[AnalyticsQuery, Query()]
):
    require_admin(principal)
    totals = await request.app.state.ledger.credit_totals(
        datetime.combine(query.start, time.min, SINGAPORE),
        datetime.combine(query.end + timedelta(days=1), time.min, SINGAPORE),
    )
    return CreditAnalytics(
        start=query.start,
        end=query.end,
        time_zone="Asia/Singapore",
        generated_at=datetime.now(UTC),
        circulation=Circulation(
            available=totals["available"],
            reserved=totals["reserved"],
            total=totals["available"] + totals["reserved"],
        ),
        transfers=TransferTotals(
            count=totals["transfer_count"], amount=totals["transfer_amount"]
        ),
    )
