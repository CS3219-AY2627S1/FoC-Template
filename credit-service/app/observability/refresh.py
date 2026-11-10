# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""Refresh the scrape-time gauges for credit-service.

The database-pool and balance gauges cannot be computed by a plain Prometheus
collector (the query is async), and a background task would drift. Instead the
shared layer calls this coroutine before every ``/metrics`` scrape, so the
values Prometheus reads are fresh at most one scrape interval old.
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.db import SessionLocal, pool_stats
from app.models.account import CreditAccount
from app.observability import metrics


async def refresh_scrape_gauges() -> None:
    metrics.set_pool_gauges(pool_stats())
    async with SessionLocal() as session:
        row = (
            await session.execute(
                select(
                    func.coalesce(func.sum(CreditAccount.available_balance), 0),
                    func.coalesce(func.sum(CreditAccount.reserved_balance), 0),
                    func.count(),
                ).select_from(CreditAccount)
            )
        ).one()
    metrics.set_balance_gauges(
        available_balance_sum=int(row[0]),
        reserved_balance_sum=int(row[1]),
        accounts_total=int(row[2]),
    )
