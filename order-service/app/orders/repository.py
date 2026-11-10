# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented Order creation persistence, retries and read queries.
# Author review: I validated correctness and added boundary checks where needed.

"""Short PostgreSQL transactions with durable leases and atomic finalization."""

from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import and_, func, or_, select, text, true, update
from sqlalchemy.dialects.postgresql import insert

from app.orders.analytics import period_bounds
from app.orders.schemas import CreateOrder
from app.orders.tables import history, operations, orders

TERMINAL_OPERATIONS = ("SUCCEEDED", "ABORTED")


class OrderRepository:
    def __init__(self, sessions):
        self.sessions = sessions

    async def lookup_key(self, actor: UUID, key_hash: str):
        async with self.sessions() as session:
            result = await session.execute(
                select(operations).where(
                    operations.c.requester_id == actor,
                    operations.c.key_hash == key_hash,
                )
            )
            return result.mappings().one_or_none()

    async def operation(self, operation_id: UUID):
        async with self.sessions() as session:
            result = await session.execute(
                select(operations).where(operations.c.id == operation_id)
            )
            return result.mappings().one_or_none()

    async def begin(self, actor, key_hash, request_hash, body, snapshot):
        async with self.sessions() as session, session.begin():
            now = await session.scalar(select(func.clock_timestamp()))
            await session.execute(
                insert(operations)
                .values(
                    id=uuid4(),
                    order_id=uuid4(),
                    requester_id=actor,
                    key_hash=key_hash,
                    request_hash=request_hash,
                    payload=body.model_dump(mode="json", by_alias=True),
                    supplier_snapshot=snapshot,
                    stage="VALIDATED",
                    created_at=now,
                    updated_at=now,
                    acceptance_deadline=body.acceptance_deadline,
                    next_attempt_at=now,
                    attempts=0,
                )
                .on_conflict_do_nothing(index_elements=["requester_id", "key_hash"])
            )
            result = await session.execute(
                select(operations).where(
                    operations.c.requester_id == actor,
                    operations.c.key_hash == key_hash,
                )
            )
            return result.mappings().one()

    async def claim(self, operation_id: UUID):
        async with self.sessions() as session, session.begin():
            now = await session.scalar(select(func.clock_timestamp()))
            result = await session.execute(
                update(operations)
                .where(
                    operations.c.id == operation_id,
                    operations.c.stage.not_in(TERMINAL_OPERATIONS),
                    or_(operations.c.lease_until.is_(None), operations.c.lease_until <= now),
                )
                .values(
                    lease_token=uuid4(),
                    lease_until=now + timedelta(seconds=30),
                    attempts=operations.c.attempts + 1,
                    updated_at=now,
                )
                .returning(operations)
            )
            return result.mappings().one_or_none()

    async def change(self, operation, *, release=False, delay=0, **values):
        async with self.sessions() as session, session.begin():
            now = await session.scalar(select(func.clock_timestamp()))
            values.update(updated_at=now)
            if release:
                values.update(
                    lease_token=None,
                    lease_until=None,
                    next_attempt_at=now + timedelta(seconds=delay),
                )
            result = await session.execute(
                update(operations)
                .where(
                    operations.c.id == operation["id"],
                    operations.c.lease_token == operation["lease_token"],
                    operations.c.stage.not_in(TERMINAL_OPERATIONS),
                )
                .values(**values)
                .returning(operations)
            )
            return result.mappings().one_or_none()

    async def finalize(self, operation, reservation_id, snapshot):
        async with self.sessions() as session, session.begin():
            result = await session.execute(
                select(operations)
                .where(
                    operations.c.id == operation["id"],
                )
                .with_for_update()
            )
            current = result.mappings().one()
            if current["lease_token"] != operation["lease_token"] or current["stage"] not in (
                "RESERVATION_UNKNOWN",
                "READY_TO_FINALIZE",
            ):
                return False
            now = await session.scalar(select(func.clock_timestamp()))
            if current["acceptance_deadline"] <= now:
                await session.execute(
                    update(operations)
                    .where(
                        operations.c.id == current["id"],
                    )
                    .values(stage="ABORTING", error_code="DEADLINE_PASSED", updated_at=now)
                )
                return False
            body = CreateOrder.model_validate(current["payload"])
            await session.execute(
                insert(orders).values(
                    id=current["order_id"],
                    requester_id=current["requester_id"],
                    supplier_id=body.supplier_id,
                    supplier_snapshot=snapshot,
                    item_description=body.item_description,
                    delivery_location=body.delivery_location,
                    reward=body.reward,
                    state="OPEN",
                    reservation_id=reservation_id,
                    acceptance_deadline=body.acceptance_deadline,
                    delivery_deadline=body.delivery_deadline,
                    created_at=now,
                    updated_at=now,
                )
            )
            await session.execute(
                insert(history).values(
                    order_id=current["order_id"],
                    sequence=1,
                    previous_state=None,
                    new_state="OPEN",
                    actor_id=current["requester_id"],
                    actor_type="USER",
                    occurred_at=now,
                )
            )
            await session.execute(
                update(operations)
                .where(operations.c.id == current["id"])
                .values(
                    stage="SUCCEEDED",
                    reservation_id=reservation_id,
                    supplier_snapshot=snapshot,
                    updated_at=now,
                    lease_token=None,
                    lease_until=None,
                    error_code=None,
                )
            )
            return True

    async def due(self, limit: int):
        async with self.sessions() as session:
            result = await session.scalars(
                select(operations.c.id)
                .where(
                    operations.c.stage.not_in(TERMINAL_OPERATIONS),
                    operations.c.next_attempt_at <= func.clock_timestamp(),
                    or_(
                        operations.c.lease_until.is_(None),
                        operations.c.lease_until <= func.clock_timestamp(),
                    ),
                )
                .order_by(operations.c.next_attempt_at, operations.c.id)
                .limit(limit)
            )
            return list(result)

    async def order(self, order_id):
        async with self.sessions() as session:
            result = await session.execute(select(orders).where(orders.c.id == order_id))
            return result.mappings().one_or_none()

    async def list_orders(self, query, *, requester=None, courier=None, available=False):
        filters = []
        if available:
            filters.extend(
                [
                    orders.c.state == "OPEN",
                    orders.c.acceptance_deadline > func.transaction_timestamp(),
                ]
            )
        if requester is not None:
            filters.append(orders.c.requester_id == requester)
        if courier is not None:
            filters.append(orders.c.courier_id == courier)
        if getattr(query, "supplier_id", None):
            filters.append(orders.c.supplier_id == query.supplier_id)
        # Administrator-only filters (N2F2.2); absent on participant and open-list queries.
        if getattr(query, "order_id", None):
            filters.append(orders.c.id == query.order_id)
        if getattr(query, "participant_id", None):
            filters.append(
                or_(
                    orders.c.requester_id == query.participant_id,
                    orders.c.courier_id == query.participant_id,
                )
            )
        if getattr(query, "state", None):
            filters.append(orders.c.state.in_(query.state))
        if getattr(query, "created_from", None):
            start, _ = period_bounds(query.created_from, query.created_from)
            filters.append(orders.c.created_at >= start)
        if getattr(query, "created_to", None):
            _, end = period_bounds(query.created_to, query.created_to)
            filters.append(orders.c.created_at < end)
        if getattr(query, "overdue", None) is not None:
            filters.append(
                orders.c.overdue_at.is_not(None) if query.overdue else orders.c.overdue_at.is_(None)
            )
        condition = and_(*filters) if filters else true()
        async with self.sessions() as session, session.begin():
            # Keep count and page consistent within one request, not across separate requests.
            await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            total = await session.scalar(select(func.count()).select_from(orders).where(condition))
            result = await session.execute(
                select(orders)
                .where(condition)
                .order_by(
                    orders.c.created_at.desc(),
                    orders.c.id.desc(),
                )
                .limit(query.page_size)
                .offset((query.page - 1) * query.page_size)
            )
            return list(result.mappings()), total

    async def order_history(self, order_id, query):
        async with self.sessions() as session, session.begin():
            await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            result = await session.execute(
                select(history)
                .where(history.c.order_id == order_id)
                .order_by(history.c.sequence)
                .limit(query.page_size)
                .offset((query.page - 1) * query.page_size)
            )
            rows = list(result.mappings())
            total = await session.scalar(
                select(func.count()).select_from(history).where(history.c.order_id == order_id)
            )
            return rows, total

    async def created_between(self, start, end, *, participant=None):
        """Only the columns analytics needs, for errands created in [start, end) (N2F4)."""
        statement = select(
            orders.c.id,
            orders.c.requester_id,
            orders.c.courier_id,
            orders.c.supplier_id,
            orders.c.supplier_snapshot["name"].astext.label("supplier_name"),
            orders.c.state,
            orders.c.created_at,
            orders.c.completed_at,
        ).where(orders.c.created_at >= start, orders.c.created_at < end)
        if participant is not None:
            statement = statement.where(
                or_(orders.c.requester_id == participant, orders.c.courier_id == participant)
            )
        async with self.sessions() as session:
            result = await session.execute(statement.order_by(orders.c.created_at, orders.c.id))
            return list(result.mappings())
