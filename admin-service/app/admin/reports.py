# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-29, 2026-11-08, 2026-11-10
# Scope: Implemented participant dispute report endpoints and their visibility rules; added
# reporting with a selected problem, private statements and withdrawal.
# Author review: I validated correctness and supplied additional boundary checks.

"""Participant disputes (N2F3.2): requesters and couriers report problems; admins decide.

These routes serve ordinary users. They confirm participation through Order's own participant
view and never expose administrator identities, notes, history or audit records. Both
participants see every dispute about their errand, its selected problem, status and reasons;
each sees only their own statements to administrators.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.admin.api import open_dispute, parse_key
from app.admin.auth import BearerToken, authenticate
from app.admin.disputes import (
    OPEN_STATUSES,
    DisputeClosed,
    DisputeNotFound,
    OrderNotFound,
    request_fingerprint,
)
from app.admin.schemas import (
    AddStatement,
    OwnStatement,
    Page,
    Principal,
    ReportProblem,
    ReportQuery,
    ReportView,
    Withdrawal,
)

router = APIRouter(prefix="/v1/disputes", tags=["Dispute reports"])
Caller = Annotated[Principal, Depends(authenticate)]


def report_view(row, viewer, statements) -> ReportView:
    return ReportView(
        dispute_id=row["id"],
        order_id=row["order_id"],
        own_report=row["reporter_role"] is not None and row["created_by"] == viewer,
        reporter_role=row["reporter_role"],
        problem=row["problem"],
        problem_details=row["problem_details"],
        legacy=row.get("legacy_record", False),
        status=row["status"],
        resolution_reason=row["resolution_reason"],
        statements=[
            OwnStatement(
                statement_id=statement["id"],
                body=statement["body"],
                created_at=statement["created_at"],
            )
            for statement in statements
            if statement["author_id"] == viewer and statement["dispute_id"] == row["id"]
        ],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        version=row["version"],
    )


async def participant_role(request: Request, order_id: UUID, token: str, user_id: UUID) -> str:
    # Non-participants get the same answer as for a missing errand, so nothing is disclosed.
    participation = await request.app.state.orders.participation(order_id, token, user_id)
    if participation is None:
        raise OrderNotFound()
    return participation[0]


async def own_view(request: Request, dispute_id: UUID, viewer: UUID) -> ReportView:
    row, _, statements = await request.app.state.disputes.dispute(dispute_id)
    if row is None:
        raise DisputeNotFound()
    return report_view(row, viewer, statements)


@router.post(
    "",
    status_code=201,
    response_model=ReportView,
    responses={200: {"model": ReportView, "description": "Replay of an identical request"}},
)
async def report_problem(
    request: Request,
    body: ReportProblem,
    caller: Caller,
    token: BearerToken,
    idempotency_key: Annotated[str | None, Header()] = None,
):
    key = parse_key(idempotency_key)
    role = await participant_role(request, body.order_id, token, caller.user_id)
    dispute_id, created = await open_dispute(
        request,
        body=body,
        creator=caller.user_id,
        role=role,
        key=key,
        fingerprint=request_fingerprint(body.order_id, body.problem, body.problem_details),
        token=token,
    )
    view = await own_view(request, dispute_id, caller.user_id)
    return JSONResponse(status_code=201 if created else 200, content=jsonable_encoder(view))


@router.get("", response_model=Page[ReportView])
async def list_reports(
    request: Request,
    caller: Caller,
    token: BearerToken,
    query: Annotated[ReportQuery, Query()],
):
    disputes = request.app.state.disputes
    if query.order_id is None:
        rows, total = await disputes.reports_for(
            caller.user_id, page=query.page, page_size=query.page_size
        )
    else:
        # N2F3.2.5: either participant may follow disputes about the errand; others learn nothing.
        await participant_role(request, query.order_id, token, caller.user_id)
        rows, total = await disputes.reports_about(
            query.order_id, page=query.page, page_size=query.page_size
        )
    statements = await disputes.statements_by([row["id"] for row in rows], caller.user_id)
    return Page[ReportView](
        items=[report_view(row, caller.user_id, statements) for row in rows],
        page=query.page,
        page_size=query.page_size,
        total=total,
    )


@router.post("/{dispute_id}/withdraw", response_model=ReportView)
async def withdraw(
    dispute_id: UUID, request: Request, body: Withdrawal, caller: Caller, token: BearerToken
):
    """The reporter withdraws while the dispute is OPEN; the errand returns to its earlier state.

    Order is told first, while the dispute row is locked, so an administrator starting the
    review at the same moment either waits for the withdrawal or wins and blocks it.
    """
    orders = request.app.state.orders

    async def release(row):
        await orders.restore(row["order_id"], row["id"], "USER", token)

    await request.app.state.disputes.transition(
        dispute_id,
        to_status="WITHDRAWN",
        reason=body.reason,
        expected_version=body.expected_version,
        actor=caller.user_id,
        correlation_id=request.state.correlation_id,
        reporter=caller.user_id,
        apply=release,
    )
    return await own_view(request, dispute_id, caller.user_id)


@router.post(
    "/{dispute_id}/statements",
    status_code=201,
    response_model=ReportView,
    responses={200: {"model": ReportView, "description": "Replay of an identical request"}},
)
async def add_statement(
    dispute_id: UUID,
    request: Request,
    body: AddStatement,
    caller: Caller,
    token: BearerToken,
    idempotency_key: Annotated[str | None, Header()] = None,
):
    """Either participant sends administrators more details while the dispute is open."""
    key = parse_key(idempotency_key)
    disputes = request.app.state.disputes
    row, _, _ = await disputes.dispute(dispute_id)
    if row is None:
        raise DisputeNotFound()
    participation = await request.app.state.orders.participation(
        row["order_id"], token, caller.user_id
    )
    if participation is None:
        raise DisputeNotFound()
    if row["status"] not in OPEN_STATUSES:
        raise DisputeClosed()
    _, created = await disputes.add_statement(
        dispute_id=dispute_id,
        author=caller.user_id,
        role=participation[0],
        body=body.body,
        key=key,
        fingerprint=request_fingerprint(dispute_id, body.body),
        correlation_id=request.state.correlation_id,
    )
    view = await own_view(request, dispute_id, caller.user_id)
    return JSONResponse(status_code=201 if created else 200, content=jsonable_encoder(view))
