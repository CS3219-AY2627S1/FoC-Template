# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
# 2026-11-10
# Scope: Added PostgreSQL tests for idempotency, workflow guards, concurrency, append-only
# history and participant reports; covered statements, withdrawal and errand changes.
# Author review: I validated correctness and supplied additional boundary checks.

"""Requires ADMIN_TEST_DATABASE_URL: a DISPOSABLE migrated Admin database (admin URL).

Covers the PostgreSQL guarantees behind N2F3.2-N2F3.7 and N2NFR3.1-N2NFR3.5.
"""

import asyncio
import os
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.admin.disputes import (
    DecisionIncomplete,
    DisputeAlreadyOpen,
    DisputeClosed,
    DisputeNotFound,
    ErrandChanged,
    IdempotencyKeyReused,
    InvalidTransition,
    ReasonRequired,
    VersionConflict,
    WithdrawalNotAllowed,
    dispute_id_for,
    request_fingerprint,
)
from app.admin.repository import DisputeRepository
from app.db import Database

pytestmark = pytest.mark.integration


@pytest.fixture
async def database():
    url = os.environ.get("ADMIN_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set ADMIN_TEST_DATABASE_URL to a disposable migrated Admin database")
    database = Database(url)
    yield database
    await database.dispose()


@pytest.fixture
def repository(database):
    return DisputeRepository(database.session_context)


async def record(repository, *, actor=None, key=None, order_id=None, role=None, problem="OTHER"):
    """Record a dispute as an administrator (role None) or a participant."""
    actor, key, order_id = actor or uuid4(), key or uuid4(), order_id or uuid4()
    details = "Courier never replied." if problem == "OTHER" else None
    admin = role is None
    dispute_id, created = await repository.create(
        dispute_id=dispute_id_for(actor, key),
        order_id=order_id,
        problem=problem,
        problem_details=details,
        description="Raised by phone." if admin else None,
        evidence_refs=["chat:1"] if admin else [],
        actor=actor,
        role=role,
        key=key,
        fingerprint=request_fingerprint(order_id, problem, details),
        correlation_id="integration",
    )
    return dispute_id, created, actor, key, order_id


async def change(repository, dispute_id, to_status, version, reason=None, **extra):
    await repository.transition(
        dispute_id,
        to_status=to_status,
        reason=reason,
        expected_version=version,
        actor=extra.pop("actor", uuid4()),
        correlation_id="integration",
        **extra,
    )


async def test_create_is_idempotent_and_audited(repository):
    dispute_id, created, actor, key, order_id = await record(repository)
    assert created is True and dispute_id == dispute_id_for(actor, key)
    again, created_again, *_ = await record(repository, actor=actor, key=key, order_id=order_id)
    assert (again, created_again) == (dispute_id, False)
    assert (await repository.by_key(actor, key))["id"] == dispute_id
    with pytest.raises(IdempotencyKeyReused):
        await record(repository, actor=actor, key=key, order_id=order_id, problem="ITEM_DAMAGED")
    row, events, statements = await repository.dispute(dispute_id)
    assert (row["status"], row["version"], row["problem"]) == ("OPEN", 1, "OTHER")
    assert [event["to_status"] for event in events] == ["OPEN"] and statements == []
    entries, total = await repository.audit_page(
        actor_id=actor, target_id=None, outcome=None, page=1, page_size=10
    )
    assert total == 1 and entries[0]["action"] == "DISPUTE_CREATE"


async def test_one_open_dispute_per_errand_until_it_closes(repository):
    order_id, requester, courier = uuid4(), uuid4(), uuid4()
    first, *_ = await record(repository, actor=requester, order_id=order_id, role="REQUESTER")
    with pytest.raises(DisputeAlreadyOpen):
        await record(repository, actor=courier, order_id=order_id, role="COURIER")
    with pytest.raises(DisputeAlreadyOpen):
        await record(repository, order_id=order_id)
    await change(repository, first, "WITHDRAWN", 1, "Sorted it out.", reporter=requester)
    second, *_ = await record(repository, actor=courier, order_id=order_id, role="COURIER")
    rows, total = await repository.reports_about(order_id, page=1, page_size=10)
    assert total == 2 and {row["id"] for row in rows} == {first, second}
    mine, total = await repository.reports_for(requester, page=1, page_size=10)
    assert total == 1 and mine[0]["status"] == "WITHDRAWN"


async def test_workflow_and_rejections_leave_the_dispute_unchanged(repository):
    dispute_id, *_ = await record(repository)
    with pytest.raises(InvalidTransition):
        await change(repository, dispute_id, "ACCEPTED", 1, "Too early")
    with pytest.raises(VersionConflict):
        await change(repository, dispute_id, "UNDER_REVIEW", 7)
    await change(repository, dispute_id, "UNDER_REVIEW", 1)
    with pytest.raises(ReasonRequired):
        await change(repository, dispute_id, "REJECTED", 2)
    await change(repository, dispute_id, "REJECTED", 2, "The delivery photo shows the item.")
    row, events, _ = await repository.dispute(dispute_id)
    assert (row["status"], row["version"]) == ("REJECTED", 3)
    assert row["resolution_reason"] == "The delivery photo shows the item."
    assert [event["to_status"] for event in events] == ["OPEN", "UNDER_REVIEW", "REJECTED"]


async def test_only_the_reporter_withdraws_and_only_while_open(repository):
    reporter = uuid4()
    dispute_id, *_ = await record(repository, actor=reporter, role="REQUESTER")
    with pytest.raises(DisputeNotFound):
        await change(repository, dispute_id, "WITHDRAWN", 1, "Not mine", reporter=uuid4())
    await change(repository, dispute_id, "UNDER_REVIEW", 1)
    with pytest.raises(WithdrawalNotAllowed):
        await change(repository, dispute_id, "WITHDRAWN", 2, "Too late", reporter=reporter)
    admin_raised, *_ = await record(repository)
    with pytest.raises(DisputeNotFound):
        await change(repository, admin_raised, "WITHDRAWN", 1, "No reporter", reporter=uuid4())


async def test_errand_changes_run_inside_the_locked_transition(repository):
    reporter = uuid4()
    dispute_id, *_, order_id = await record(repository, actor=reporter, role="COURIER")
    seen = []

    async def release(row):
        seen.append((row["order_id"], row["id"], row["status"]))

    await change(
        repository,
        dispute_id,
        "WITHDRAWN",
        1,
        "Requester found it.",
        actor=reporter,
        reporter=reporter,
        apply=release,
    )
    assert seen == [(order_id, dispute_id, "OPEN")]
    entries, _ = await repository.audit_page(
        actor_id=reporter, target_id=None, outcome=None, page=1, page_size=10
    )
    assert {(entry["action"], entry["target_id"]) for entry in entries} == {
        ("DISPUTE_REPORT", dispute_id),
        ("DISPUTE_WITHDRAW", dispute_id),
        ("ERRAND_DECISION", order_id),
    }


async def test_an_order_refusal_rolls_back_and_a_later_failure_reports_incomplete(repository):
    dispute_id, *_ = await record(repository)
    await change(repository, dispute_id, "UNDER_REVIEW", 1)
    calls = []

    async def refuse(row):
        raise ErrandChanged()

    async def applied(row):
        calls.append(row["id"])

    with pytest.raises(ErrandChanged):
        await change(repository, dispute_id, "ACCEPTED", 2, "Refund", apply=refuse)
    # A stale version is caught before Order is asked, so nothing is applied.
    with pytest.raises(VersionConflict):
        await change(repository, dispute_id, "ACCEPTED", 1, "Refund", apply=applied)
    assert calls == []
    # Order applied the change, then the dispute write failed (the database refuses a reason
    # longer than 1000 characters): the caller is told to repeat the same request.
    with pytest.raises(DecisionIncomplete):
        await change(repository, dispute_id, "ACCEPTED", 2, "x" * 1001, apply=applied)
    assert calls == [dispute_id]
    row, events, _ = await repository.dispute(dispute_id)
    assert row["status"] == "UNDER_REVIEW" and len(events) == 2
    await change(repository, dispute_id, "ACCEPTED", 2, "Refund", apply=applied)
    assert (await repository.dispute(dispute_id))[0]["status"] == "ACCEPTED"


async def test_concurrent_changes_from_the_same_version_succeed_once(repository):
    dispute_id, *_ = await record(repository)

    async def attempt():
        try:
            await change(repository, dispute_id, "UNDER_REVIEW", 1)
            return "ok"
        except (VersionConflict, InvalidTransition):
            return "conflict"

    results = await asyncio.gather(*[attempt() for _ in range(10)])
    assert results.count("ok") == 1
    row, events, _ = await repository.dispute(dispute_id)
    assert row["version"] == 2 and len(events) == 2


async def test_withdrawal_and_review_racing_end_in_one_status(repository):
    reporter = uuid4()
    dispute_id, *_ = await record(repository, actor=reporter, role="REQUESTER")
    released = []

    async def slow_release(row):
        released.append(row["status"])
        await asyncio.sleep(0.2)

    async def attempt(coroutine):
        try:
            await coroutine
            return "ok"
        except (VersionConflict, WithdrawalNotAllowed, InvalidTransition):
            return "refused"

    results = await asyncio.gather(
        attempt(
            change(
                repository,
                dispute_id,
                "WITHDRAWN",
                1,
                "Sorted",
                reporter=reporter,
                apply=slow_release,
            )
        ),
        attempt(change(repository, dispute_id, "UNDER_REVIEW", 1)),
    )
    assert sorted(results) == ["ok", "refused"]
    row = (await repository.dispute(dispute_id))[0]
    # The errand was released only if the withdrawal is what was recorded.
    assert (row["status"] == "WITHDRAWN") == bool(released)


async def test_statements_are_private_records_accepted_only_while_open(repository):
    reporter, other = uuid4(), uuid4()
    dispute_id, *_ = await record(repository, actor=reporter, role="REQUESTER")

    async def send(author, role, body, key=None):
        return await repository.add_statement(
            dispute_id=dispute_id,
            author=author,
            role=role,
            body=body,
            key=key or uuid4(),
            fingerprint=request_fingerprint(dispute_id, body),
            correlation_id="integration",
        )

    key = uuid4()
    first, created = await send(reporter, "REQUESTER", "Nothing arrived.", key)
    again, created_again = await send(reporter, "REQUESTER", "Nothing arrived.", key)
    assert (created, again, created_again) == (True, first, False)
    with pytest.raises(IdempotencyKeyReused):
        await send(reporter, "REQUESTER", "Something else.", key)
    await send(other, "COURIER", "I left it at the door.")
    await change(repository, dispute_id, "UNDER_REVIEW", 1)
    await send(other, "COURIER", "Here is the photo reference.")

    _, _, every = await repository.dispute(dispute_id)
    assert [s["author_role"] for s in every] == ["REQUESTER", "COURIER", "COURIER"]
    mine = await repository.statements_by([dispute_id], reporter)
    assert [s["body"] for s in mine] == ["Nothing arrived."]

    await change(repository, dispute_id, "ACCEPTED", 2, "Item never arrived.")
    with pytest.raises(DisputeClosed):
        await send(other, "COURIER", "One more thing.")


async def test_a_statement_racing_a_decision_never_lands_after_it_closes(repository):
    dispute_id, *_ = await record(repository, role="REQUESTER")
    await change(repository, dispute_id, "UNDER_REVIEW", 1)

    async def statement():
        try:
            await repository.add_statement(
                dispute_id=dispute_id,
                author=uuid4(),
                role="COURIER",
                body="Late detail.",
                key=uuid4(),
                fingerprint="x",
                correlation_id="integration",
            )
            return "sent"
        except DisputeClosed:
            return "closed"

    results = await asyncio.gather(
        statement(), change(repository, dispute_id, "REJECTED", 2, "Not supported.")
    )
    row, events, statements = await repository.dispute(dispute_id)
    closed_at = events[-1]["occurred_at"]
    assert row["status"] == "REJECTED"
    assert all(s["created_at"] <= closed_at for s in statements)
    assert results[0] in ("sent", "closed")


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE admin_service.dispute_events SET reason = 'edited' WHERE dispute_id = :id",
        "DELETE FROM admin_service.dispute_events WHERE dispute_id = :id",
        "UPDATE admin_service.audit_log SET correlation_id = 'edited' WHERE target_id = :id",
        "DELETE FROM admin_service.audit_log WHERE target_id = :id",
        "DELETE FROM admin_service.disputes WHERE id = :id",
        "UPDATE admin_service.disputes SET problem = 'ITEM_DAMAGED', status = 'UNDER_REVIEW', "
        "version = version + 1 WHERE id = :id",
        "UPDATE admin_service.disputes SET status = 'ACCEPTED', resolution_reason = 'skip', "
        "version = version + 1 WHERE id = :id",
        "UPDATE admin_service.disputes SET status = 'WITHDRAWN', resolution_reason = 'admin', "
        "version = version + 1 WHERE id = :id",
    ],
)
async def test_recorded_history_and_audit_cannot_be_rewritten(database, repository, statement):
    dispute_id, *_ = await record(repository)
    with pytest.raises(DBAPIError):
        async with database.session_context() as session, session.begin():
            await session.execute(text(statement), {"id": dispute_id})


async def test_statements_cannot_be_edited_or_removed(database, repository):
    dispute_id, *_ = await record(repository, role="REQUESTER")
    await repository.add_statement(
        dispute_id=dispute_id,
        author=uuid4(),
        role="REQUESTER",
        body="Original.",
        key=uuid4(),
        fingerprint="x",
        correlation_id="integration",
    )
    for statement in (
        "UPDATE admin_service.dispute_statements SET body = 'edited' WHERE dispute_id = :id",
        "DELETE FROM admin_service.dispute_statements WHERE dispute_id = :id",
    ):
        with pytest.raises(DBAPIError):
            async with database.session_context() as session, session.begin():
                await session.execute(text(statement), {"id": dispute_id})


async def test_runtime_role_has_only_the_needed_privileges(database):
    checks = {
        "has_table_privilege('admin_service_app', 'admin_service.disputes', 'DELETE')": False,
        "has_table_privilege('admin_service_app', 'admin_service.dispute_events', 'UPDATE')": False,
        "has_table_privilege('admin_service_app', 'admin_service.audit_log', 'UPDATE')": False,
        "has_table_privilege('admin_service_app', 'admin_service.audit_log', 'INSERT')": True,
        "has_table_privilege('admin_service_app', 'admin_service.dispute_statements', "
        "'INSERT')": True,
        "has_table_privilege('admin_service_app', 'admin_service.dispute_statements', "
        "'UPDATE')": False,
        "has_column_privilege('admin_service_app', 'admin_service.disputes', 'status', "
        "'UPDATE')": True,
        "has_column_privilege('admin_service_app', 'admin_service.disputes', 'problem', "
        "'UPDATE')": False,
        "has_column_privilege('admin_service_app', 'admin_service.disputes', 'description', "
        "'UPDATE')": False,
    }
    async with database.session_context() as session:
        for expression, expected in checks.items():
            assert await session.scalar(text(f"SELECT {expression}")) is expected, expression


GUARD = "ALTER TABLE admin_service.disputes"


async def legacy(database, repository, status="UNDER_REVIEW", reporter=None):
    """A dispute recorded before disputed errands, as the migration marks it."""
    dispute_id, *_ = await record(repository, actor=reporter, role="REQUESTER")
    async with database.session_context() as session, session.begin():
        await session.execute(text(f"{GUARD} DISABLE TRIGGER disputes_guard_update"))
        await session.execute(
            text(
                "UPDATE admin_service.disputes SET legacy_record = true, problem = NULL, "
                "problem_details = NULL, description = 'Arrived cold', status = :status "
                "WHERE id = :id"
            ),
            {"status": status, "id": dispute_id},
        )
        await session.execute(text(f"{GUARD} ENABLE TRIGGER disputes_guard_update"))
    return dispute_id


async def test_deciding_a_legacy_dispute_never_calls_order(database, repository):
    dispute_id = await legacy(database, repository)
    calls = []

    async def apply(row):
        calls.append(row["id"])

    await change(repository, dispute_id, "REJECTED", 1, "Not supported.", apply=apply)
    row, _, _ = await repository.dispute(dispute_id)
    assert row["status"] == "REJECTED" and calls == []


async def test_legacy_disputes_cannot_be_withdrawn(database, repository):
    reporter = uuid4()
    dispute_id = await legacy(database, repository, status="OPEN", reporter=reporter)
    with pytest.raises(WithdrawalNotAllowed):
        await change(repository, dispute_id, "WITHDRAWN", 1, "Sorted", reporter=reporter)
