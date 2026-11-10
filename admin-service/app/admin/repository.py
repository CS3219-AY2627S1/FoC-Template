# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
# 2026-11-10
# Scope: Implemented dispute, history, report and audit-log transactions with idempotency and
# version checks; added statements, withdrawal and errand-changing transitions.
# Author review: I validated correctness and supplied additional boundary checks.

"""Short PostgreSQL transactions for disputes, their history, statements and the audit log."""

from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

from sqlalchemy import and_, func, insert, select, text, true, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.admin.disputes import (
    FINAL_STATUSES,
    DecisionIncomplete,
    DisputeAlreadyOpen,
    DisputeClosed,
    DisputeNotFound,
    IdempotencyKeyReused,
    VersionConflict,
    WithdrawalNotAllowed,
    check_transition,
)
from app.admin.errors import ApiError
from app.admin.tables import audit_log, dispute_events, dispute_statements, disputes
from app.db import DatabaseUnavailableError


def audit_entry(*, actor, action, target_type, target_id, correlation_id, error_code=None):
    return {
        "id": uuid4(),
        "actor_id": actor,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "outcome": "REJECTED" if error_code else "SUCCESS",
        "error_code": error_code,
        "correlation_id": correlation_id,
    }


class DisputeRepository:
    def __init__(self, sessions):
        self.sessions = sessions

    async def by_key(self, creator: UUID, key: UUID) -> dict | None:
        """The dispute this creator already recorded with this request key, if any."""
        async with self.sessions() as session, session.begin():
            row = (
                await session.execute(
                    select(disputes).where(
                        disputes.c.created_by == creator, disputes.c.idempotency_key == key
                    )
                )
            ).mappings().one_or_none()
            return dict(row) if row else None

    async def create(
        self,
        *,
        dispute_id,
        order_id,
        problem,
        problem_details,
        description,
        evidence_refs,
        actor,
        role,
        key,
        fingerprint,
        correlation_id,
    ) -> tuple[UUID, bool]:
        """Record a dispute Order already holds, with its first history and audit entries.

        role is the reporter's role on the errand, or None when an administrator records it.
        A replay of the same key and body returns the original dispute (created=False).
        """
        try:
            async with self.sessions() as session, session.begin():
                inserted = await session.scalar(
                    pg_insert(disputes)
                    .values(
                        id=dispute_id,
                        order_id=order_id,
                        problem=problem,
                        problem_details=problem_details,
                        description=description,
                        evidence_refs=evidence_refs,
                        status="OPEN",
                        reporter_role=role,
                        created_by=actor,
                        idempotency_key=key,
                        request_hash=fingerprint,
                        version=1,
                    )
                    .on_conflict_do_nothing(index_elements=["created_by", "idempotency_key"])
                    .returning(disputes.c.id)
                )
                if inserted is None:
                    existing = (
                        await session.execute(
                            select(disputes.c.id, disputes.c.request_hash).where(
                                disputes.c.created_by == actor, disputes.c.idempotency_key == key
                            )
                        )
                    ).one()
                    if existing.request_hash != fingerprint:
                        raise IdempotencyKeyReused()
                    return existing.id, False
                await session.execute(
                    insert(dispute_events).values(
                        dispute_id=inserted, sequence=1, to_status="OPEN", actor_id=actor
                    )
                )
                await session.execute(
                    insert(audit_log).values(
                        **audit_entry(
                            actor=actor,
                            action="DISPUTE_CREATE" if role is None else "DISPUTE_REPORT",
                            target_type="DISPUTE",
                            target_id=inserted,
                            correlation_id=correlation_id,
                        )
                    )
                )
                return inserted, True
        except IntegrityError:
            # disputes_one_open_per_errand: another dispute about this errand is still open.
            raise DisputeAlreadyOpen() from None

    async def transition(
        self,
        dispute_id,
        *,
        to_status,
        reason,
        expected_version,
        actor,
        correlation_id,
        reporter: UUID | None = None,
        apply: Callable[[dict], Awaitable[None]] | None = None,
    ) -> None:
        """Change status, append history and audit in one transaction; rejections roll back.

        reporter: the caller must be this dispute's reporter (withdrawal).
        apply: changes the errand through Order once the change is known to be valid. It runs
        while the dispute row is locked, so a concurrent change waits and then sees the new
        version. If the errand changed but this transaction then fails, repeating the same
        request completes it, because Order treats a repeat for the same dispute as a replay.
        """
        applied = False
        try:
            async with self.sessions() as session, session.begin():
                current = (
                    await session.execute(
                        select(disputes).where(disputes.c.id == dispute_id).with_for_update()
                    )
                ).mappings().one_or_none()
                if current is None:
                    raise DisputeNotFound()
                if reporter is not None and (
                    current["reporter_role"] is None or current["created_by"] != reporter
                ):
                    # Others learn nothing about a dispute they cannot withdraw.
                    raise DisputeNotFound()
                if current["version"] != expected_version:
                    raise VersionConflict()
                # Legacy disputes never held their errand, so they cannot be withdrawn into it.
                if reporter is not None and (
                    current["status"] != "OPEN" or current["legacy_record"]
                ):
                    raise WithdrawalNotAllowed()
                check_transition(current["status"], to_status, reason)
                # Deciding a legacy dispute records the decision only; the errand stays as it is.
                if apply is not None and not current["legacy_record"]:
                    await apply(dict(current))
                    applied = True
                await session.execute(
                    update(disputes)
                    .where(disputes.c.id == dispute_id, disputes.c.version == expected_version)
                    .values(
                        status=to_status,
                        resolution_reason=reason if to_status in FINAL_STATUSES else None,
                        version=disputes.c.version + 1,
                        updated_at=func.clock_timestamp(),
                    )
                )
                sequence = await session.scalar(
                    select(func.coalesce(func.max(dispute_events.c.sequence), 0) + 1).where(
                        dispute_events.c.dispute_id == dispute_id
                    )
                )
                await session.execute(
                    insert(dispute_events).values(
                        dispute_id=dispute_id,
                        sequence=sequence,
                        from_status=current["status"],
                        to_status=to_status,
                        actor_id=actor,
                        reason=reason,
                    )
                )
                await session.execute(
                    insert(audit_log).values(
                        **audit_entry(
                            actor=actor,
                            action="DISPUTE_WITHDRAW" if reporter else "DISPUTE_TRANSITION",
                            target_type="DISPUTE",
                            target_id=dispute_id,
                            correlation_id=correlation_id,
                        )
                    )
                )
                if applied:
                    await session.execute(
                        insert(audit_log).values(
                            **audit_entry(
                                actor=actor,
                                action="ERRAND_DECISION",
                                target_type="ORDER",
                                target_id=current["order_id"],
                                correlation_id=correlation_id,
                            )
                        )
                    )
        except (ApiError, SQLAlchemyError, DatabaseUnavailableError, OSError, TimeoutError):
            if applied:
                raise DecisionIncomplete() from None
            raise

    async def add_statement(
        self, *, dispute_id, author, role, body, key, fingerprint, correlation_id
    ) -> tuple[UUID, bool]:
        """Append a participant's statement while the dispute is open; replays return it."""
        try:
            async with self.sessions() as session, session.begin():
                inserted = await session.scalar(
                    pg_insert(dispute_statements)
                    .values(
                        id=uuid4(),
                        dispute_id=dispute_id,
                        author_id=author,
                        author_role=role,
                        body=body,
                        idempotency_key=key,
                        request_hash=fingerprint,
                    )
                    .on_conflict_do_nothing(index_elements=["author_id", "idempotency_key"])
                    .returning(dispute_statements.c.id)
                )
                if inserted is None:
                    existing = (
                        await session.execute(
                            select(
                                dispute_statements.c.id, dispute_statements.c.request_hash
                            ).where(
                                dispute_statements.c.author_id == author,
                                dispute_statements.c.idempotency_key == key,
                            )
                        )
                    ).one()
                    if existing.request_hash != fingerprint:
                        raise IdempotencyKeyReused()
                    return existing.id, False
                await session.execute(
                    insert(audit_log).values(
                        **audit_entry(
                            actor=author,
                            action="DISPUTE_STATEMENT",
                            target_type="DISPUTE",
                            target_id=dispute_id,
                            correlation_id=correlation_id,
                        )
                    )
                )
                return inserted, True
        except IntegrityError:
            # dispute_statements_open_only: the dispute closed before the statement arrived.
            raise DisputeClosed() from None

    async def record_rejection(self, **values) -> None:
        """Audit a rejected attempt in its own transaction, after the attempt rolled back."""
        async with self.sessions() as session, session.begin():
            await session.execute(insert(audit_log).values(**audit_entry(**values)))

    async def dispute(self, dispute_id) -> tuple[dict | None, list[dict], list[dict]]:
        """A dispute with its history and every statement, read from one snapshot."""
        async with self.sessions() as session, session.begin():
            await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            row = (
                await session.execute(select(disputes).where(disputes.c.id == dispute_id))
            ).mappings().one_or_none()
            if row is None:
                return None, [], []
            events = (
                await session.execute(
                    select(dispute_events)
                    .where(dispute_events.c.dispute_id == dispute_id)
                    .order_by(dispute_events.c.sequence)
                )
            ).mappings().all()
            statements = (
                await session.execute(
                    select(dispute_statements)
                    .where(dispute_statements.c.dispute_id == dispute_id)
                    .order_by(dispute_statements.c.created_at, dispute_statements.c.id)
                )
            ).mappings().all()
            return dict(row), [dict(event) for event in events], [dict(s) for s in statements]

    async def statements_by(self, dispute_ids, author) -> list[dict]:
        """One author's statements across these disputes; never anyone else's."""
        if not dispute_ids:
            return []
        async with self.sessions() as session, session.begin():
            rows = (
                await session.execute(
                    select(dispute_statements)
                    .where(
                        dispute_statements.c.dispute_id.in_(dispute_ids),
                        dispute_statements.c.author_id == author,
                    )
                    .order_by(dispute_statements.c.created_at, dispute_statements.c.id)
                )
            ).mappings().all()
            return [dict(row) for row in rows]

    async def disputes_page(self, *, status, order_id, page, page_size):
        filters = []
        if status is not None:
            filters.append(disputes.c.status == status)
        if order_id is not None:
            filters.append(disputes.c.order_id == order_id)
        return await self._page(
            disputes, filters, (disputes.c.created_at.desc(), disputes.c.id.desc()), page, page_size
        )

    async def reports_for(self, reporter, *, page, page_size):
        """Participant reports this user made, about any errand."""
        filters = [disputes.c.created_by == reporter, disputes.c.reporter_role.is_not(None)]
        return await self._page(
            disputes, filters, (disputes.c.created_at.desc(), disputes.c.id.desc()), page, page_size
        )

    async def reports_about(self, order_id, *, page, page_size):
        """Every dispute about one errand, whoever raised it, for its participants to follow."""
        filters = [disputes.c.order_id == order_id]
        return await self._page(
            disputes, filters, (disputes.c.created_at.desc(), disputes.c.id.desc()), page, page_size
        )

    async def audit_page(self, *, actor_id, target_id, outcome, page, page_size):
        filters = []
        if actor_id is not None:
            filters.append(audit_log.c.actor_id == actor_id)
        if target_id is not None:
            filters.append(audit_log.c.target_id == target_id)
        if outcome is not None:
            filters.append(audit_log.c.outcome == outcome)
        return await self._page(
            audit_log,
            filters,
            (audit_log.c.occurred_at.desc(), audit_log.c.id.desc()),
            page,
            page_size,
        )

    async def _page(self, table, filters, ordering, page, page_size):
        condition = and_(*filters) if filters else true()
        async with self.sessions() as session, session.begin():
            # Keep count and page consistent within one request.
            await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
            total = await session.scalar(select(func.count()).select_from(table).where(condition))
            rows = (
                await session.execute(
                    select(table)
                    .where(condition)
                    .order_by(*ordering)
                    .limit(page_size)
                    .offset((page - 1) * page_size)
                )
            ).mappings().all()
            return [dict(row) for row in rows], total
