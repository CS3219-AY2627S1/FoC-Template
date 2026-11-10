# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Implemented the read-only credit-verify integrity check.
# Author review: I validated correctness and supplied additional boundary checks.

"""Operator command: read-only integrity check of the Credit ledger (M4NFR5.2, M4NFR1).

Run it after a restart or recovery: every check counts violations, 0 means PASS, and the
command exits 1 if any check fails. It never writes.
"""

import asyncio
import sys
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.db import Database

INVARIANTS = (
    (
        "M4NFR1.2 balances are never negative",
        "SELECT count(*) FROM credit_service.wallets WHERE available < 0 OR reserved < 0",
    ),
    (
        "M4F1.1.1 every wallet has exactly one initial allocation",
        """SELECT count(*) FROM credit_service.wallets w
           WHERE (SELECT count(*) FROM credit_service.credit_transactions t
                  WHERE t.wallet_user_id = w.user_id AND t.type = 'ALLOCATION') <> 1""",
    ),
    (
        "M4F3.2 reserved balance equals the wallet's active reservations",
        """SELECT count(*) FROM credit_service.wallets w
           LEFT JOIN (SELECT requester_id, sum(amount) AS held
                      FROM credit_service.order_reservations WHERE state = 'RESERVED'
                      GROUP BY requester_id) r ON r.requester_id = w.user_id
           WHERE w.reserved <> coalesce(r.held, 0)""",
    ),
    (
        "M4F6.1 balances can be rebuilt exactly from the ledger",
        """WITH moves AS (
               SELECT wallet_user_id AS user_id,
                      CASE type WHEN 'ALLOCATION' THEN amount
                                WHEN 'TRANSFER' THEN -amount ELSE 0 END AS total,
                      CASE type WHEN 'RESERVATION' THEN amount
                                WHEN 'RELEASE' THEN -amount
                                WHEN 'TRANSFER' THEN -amount ELSE 0 END AS reserved
               FROM credit_service.credit_transactions
               UNION ALL
               SELECT counterparty_user_id, amount, 0
               FROM credit_service.credit_transactions WHERE type = 'TRANSFER'
           ), expected AS (
               SELECT user_id, sum(total) AS total, sum(reserved) AS reserved
               FROM moves GROUP BY user_id
           )
           SELECT count(*) FROM credit_service.wallets w
           LEFT JOIN expected e ON e.user_id = w.user_id
           WHERE w.available + w.reserved <> coalesce(e.total, 0)
              OR w.reserved <> coalesce(e.reserved, 0)""",
    ),
    (
        "M4NFR1.4 credits held equal credits allocated (conservation)",
        """SELECT CASE WHEN
               (SELECT coalesce(sum(available + reserved), 0) FROM credit_service.wallets)
             = (SELECT coalesce(sum(amount), 0) FROM credit_service.credit_transactions
                WHERE type = 'ALLOCATION') THEN 0 ELSE 1 END""",
    ),
)

SIZES = """SELECT (SELECT count(*) FROM credit_service.wallets),
                  (SELECT count(*) FROM credit_service.credit_transactions),
                  (SELECT count(*) FROM credit_service.order_reservations
                   WHERE state = 'RESERVED')"""

# Dead-lettered events that were never processed afterwards still need an operator.
UNRESOLVED = """SELECT count(DISTINCT event_id) FROM credit_service.event_failures f
                WHERE dead_lettered AND event_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM credit_service.processed_events p
                                  WHERE p.event_id = f.event_id)"""


async def verify(settings: Settings, out=sys.stdout) -> bool:
    if settings.database_url is None:
        raise SystemExit("Set DATABASE_URL to the Credit database first.")
    database = Database(settings.database_url.get_secret_value())
    healthy = True
    try:
        async with database.session_context() as session:
            wallets, ledger_rows, active = (await session.execute(text(SIZES))).one()
            print(f"Credit integrity check at {datetime.now(UTC):%Y-%m-%d %H:%M:%S} UTC", file=out)
            print(
                f"  wallets {wallets:,}  transactions {ledger_rows:,}  "
                f"active reservations {active:,}",
                file=out,
            )
            for label, query in INVARIANTS:
                violations = await session.scalar(text(query))
                healthy &= violations == 0
                verdict = "PASS" if violations == 0 else f"FAIL ({violations:,})"
                print(f"  {verdict:<6} {label}", file=out)
            unresolved = await session.scalar(text(UNRESOLVED))
            healthy &= unresolved == 0
            verdict = "PASS" if unresolved == 0 else "ACTION"
            print(f"  {verdict:<6} {unresolved:,} dead-lettered events not yet applied", file=out)
    finally:
        await database.dispose()
    return healthy


def main() -> None:
    sys.exit(0 if asyncio.run(verify(get_settings())) else 1)
