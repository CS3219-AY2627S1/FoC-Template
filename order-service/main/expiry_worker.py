# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

import asyncio
import logging
import os
from datetime import datetime, timezone

from sqlalchemy import select

from main.database import SessionLocal
from main.models import Errand, ErrandStatus
from main.outbox import ErrandExpiredEvent, append_errand_event


logger = logging.getLogger(__name__)
INTERVAL_SECONDS = int(os.getenv("ERRAND_EXPIRY_INTERVAL_SECONDS", "60"))
ACCEPTED_EXPIRY_REASON = "Errand expired before delivery"


def expire_overdue_errands() -> int:
    now = datetime.now(timezone.utc)

    with SessionLocal.begin() as db:
        errands = db.scalars(
            select(Errand)
            .where(
                Errand.status.in_((ErrandStatus.OPEN, ErrandStatus.ACCEPTED)),
                Errand.expires_at <= now,
            )
            .with_for_update(skip_locked=True)
        ).all()

        for errand in errands:
            if errand.status == ErrandStatus.OPEN:
                resulting_status = ErrandStatus.EXPIRED
                failure_reason = None
            else:
                resulting_status = ErrandStatus.FAILED
                failure_reason = ACCEPTED_EXPIRY_REASON
                errand.failed_at = now
                errand.failure_reason = failure_reason

            errand.status = resulting_status
            append_errand_event(
                db,
                ErrandExpiredEvent(
                    errand_id=errand.id,
                    requester_id=errand.requester_id,
                    credit_value=errand.credit_value,
                    resulting_status=resulting_status,
                    failure_reason=failure_reason,
                    expired_at=now,
                ),
            )

        return len(errands)


async def expiry_worker(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            count = await asyncio.to_thread(expire_overdue_errands)
            if count:
                logger.info("Processed %d expired errands", count)
        except Exception:
            logger.exception("Errand expiry worker failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            pass


