# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented transactional participant state updates and history/event persistence.
# Author review: I validated correctness and added boundary checks where needed.

"""Serialize lifecycle decisions per order; no network calls while locks are held."""

from uuid import UUID, uuid4

from sqlalchemy import func, insert, select, update

from app.orders.errors import not_found
from app.orders.lifecycle import (
    Action,
    DisputeActor,
    accept_dispute_values,
    open_dispute_values,
    restore_values,
    transition_values,
)
from app.orders.tables import history, orders, outbox


class LifecycleRepository:
    def __init__(self, sessions):
        self.sessions = sessions

    async def _locked(self, session, order_id: UUID):
        result = await session.execute(
            select(orders).where(orders.c.id == order_id).with_for_update()
        )
        row = result.mappings().one_or_none()
        if row is None:
            raise not_found()
        # transaction_timestamp() would permit a pre-deadline waiter to win too late.
        return row, await session.scalar(select(func.clock_timestamp()))

    async def transition(self, order_id: UUID, actor: UUID, action: Action):
        async with self.sessions() as session, session.begin():
            row, now = await self._locked(session, order_id)
            values = transition_values(row, actor, action, now)
            if not values:
                return row
            return await self._record(session, row, values, actor, now)

    async def open_dispute(
        self, order_id: UUID, actor: UUID, actor_type: DisputeActor, *, dispute_id: UUID
    ):
        """N2F3.2: hold the errand in DISPUTED for a dispute Admin Service is recording."""
        async with self.sessions() as session, session.begin():
            row, now = await self._locked(session, order_id)
            values = open_dispute_values(row, actor, actor_type, dispute_id, now)
            if not values:
                return row
            return await self._record(
                session, row, values, actor, now, actor_type=actor_type, dispute_id=dispute_id
            )

    async def restore(
        self, order_id: UUID, actor: UUID, actor_type: DisputeActor, *, dispute_id: UUID
    ):
        """Return the errand to its earlier state when its dispute is withdrawn or rejected."""
        async with self.sessions() as session, session.begin():
            row, now = await self._locked(session, order_id)
            restored = row["state"] != "DISPUTED" and await self._restored(
                session, order_id, dispute_id
            )
            values = restore_values(row, actor, actor_type, dispute_id, restored=restored)
            if not values:
                return row
            return await self._record(
                session, row, values, actor, now, actor_type=actor_type, dispute_id=dispute_id
            )

    async def accept_dispute(self, order_id: UUID, admin: UUID, *, dispute_id: UUID, failure):
        """N2F3.7: an accepted dispute fails the errand through the same terminal path."""
        async with self.sessions() as session, session.begin():
            row, now = await self._locked(session, order_id)
            values = accept_dispute_values(row, admin, dispute_id, now, failure)
            if not values:
                return row
            return await self._record(
                session, row, values, admin, now, actor_type="ADMIN", dispute_id=dispute_id
            )

    async def _restored(self, session, order_id: UUID, dispute_id: UUID) -> bool:
        """Whether this dispute already returned the errand to its earlier state."""
        found = await session.scalar(
            select(history.c.sequence)
            .where(
                history.c.order_id == order_id,
                history.c.dispute_id == dispute_id,
                history.c.previous_state == "DISPUTED",
                history.c.new_state != "FAILED",
            )
            .limit(1)
        )
        return found is not None

    async def expire_batch(self, limit: int) -> int:
        async with self.sessions() as session, session.begin():
            result = await session.execute(
                select(orders)
                .where(orders.c.state == "OPEN", orders.c.acceptance_deadline <= func.now())
                .order_by(orders.c.acceptance_deadline, orders.c.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
            rows = list(result.mappings())
            for row in rows:
                now = await session.scalar(select(func.clock_timestamp()))
                await self._record(session, row, {"state": "EXPIRED", "expired_at": now}, None, now)
            return len(rows)

    async def _record(
        self, session, row, values, actor, now, *, actor_type="USER", dispute_id=None
    ):
        updated = await session.execute(
            update(orders)
            .where(orders.c.id == row["id"])
            .values(**values, updated_at=now)
            .returning(orders)
        )
        sequence = await session.scalar(
            select(func.coalesce(func.max(history.c.sequence), 0) + 1).where(
                history.c.order_id == row["id"]
            )
        )
        await session.execute(
            insert(history).values(
                order_id=row["id"],
                sequence=sequence,
                previous_state=row["state"],
                new_state=values["state"],
                actor_id=actor,
                actor_type="SYSTEM" if actor is None else actor_type,
                occurred_at=now,
                failure_reason=values.get("failure_reason"),
                failure_details=values.get("failure_details"),
                dispute_id=dispute_id,
            )
        )
        if values["state"] in ("CANCELLED", "EXPIRED", "COMPLETED", "FAILED"):
            settlement = (
                {
                    "requester_id": row["requester_id"],
                    "courier_id": row["courier_id"],
                    "amount": row["reward"],
                }
                if values["state"] == "COMPLETED"
                else {}
            )
            await session.execute(
                insert(outbox).values(
                    event_id=uuid4(),
                    event_type=f"order.{values['state'].lower()}.v1",
                    order_id=row["id"],
                    reservation_id=row["reservation_id"],
                    occurred_at=now,
                    state="PENDING",
                    publish_attempts=0,
                    next_attempt_at=now,
                    **settlement,
                )
            )
        return updated.mappings().one()

    async def overdue_batch(self, limit: int) -> int:
        # Not a lifecycle transition: update only the overdue marker/updated time.
        async with self.sessions() as session, session.begin():
            result = await session.execute(
                select(orders.c.id)
                .where(
                    orders.c.state.in_(("ACCEPTED", "PICKED_UP")),
                    orders.c.overdue_at.is_(None),
                    orders.c.delivery_deadline <= func.now(),
                )
                .order_by(orders.c.delivery_deadline, orders.c.id)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
            ids = list(result.scalars())
            if ids:
                await session.execute(
                    update(orders)
                    .where(orders.c.id.in_(ids))
                    .values(
                        overdue_at=orders.c.delivery_deadline, updated_at=func.clock_timestamp()
                    )
                )
            return len(ids)
