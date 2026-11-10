# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-06
# Scope: Generated the initial Credit Service router scaffold
# Author review: I reviewed correctness and edited the changes to fit the project

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import AuthenticatedUser
from auth.models import UserRoleResponse
from common.db import get_session
from credit.administration import order_diagnostics
from credit.exceptions import CreditNotFoundError
from credit.models import CreditAuditLogResponse, CreditResponse
from credit.service import get_credit_audit_logs, get_current_credit_balance

router = APIRouter(prefix='/credits', tags=['Credit'])


async def require_admin(user: AuthenticatedUser):
    if user.role not in {'admin', 'admin_manager'}:
        raise HTTPException(status_code=403, detail='Administrator access required')
    return user


AdminUser = Annotated[UserRoleResponse, Depends(require_admin)]
Session = Annotated[AsyncSession, Depends(get_session)]


@router.get('/admin/orders/{order_id}')
async def get_admin_order_diagnostics(order_id: UUID, user: AdminUser, session: Session):
    return await order_diagnostics(session, order_id)


@router.get('/current')
async def get_current_credits(user: AuthenticatedUser, session: Session) -> CreditResponse:
    try:
        return await get_current_credit_balance(user.user_id, session)
    except CreditNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from None


@router.get('/credit-audit-logs')
async def get_current_credit_audit_logs(user: AuthenticatedUser, session: Session) -> list[CreditAuditLogResponse]:
    return await get_credit_audit_logs(user.user_id, session)
