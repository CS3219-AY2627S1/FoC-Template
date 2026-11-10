# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented and debugged lifecycle migration integrity tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Upgrade a generated scratch database, never reset the supplied database."""

import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("state", ["OPEN", "ACCEPTED", "CANCELLED"])
@pytest.mark.parametrize("target", ["order_fulfilment_completion", "order_participant_failure"])
async def test_upgrade_preserves_existing_lifecycle_data(state, target):
    url = os.environ.get("ORDER_WRITE_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set ORDER_WRITE_TEST_DATABASE_URL to a disposable admin database")
    # Existing integration configuration opts into disposable databases; admin
    # permission is required here only for a separate UUID-named migration target.
    control = await asyncpg.connect(url)
    name = "order_upgrade_" + uuid4().hex
    created = False
    connection = None
    try:
        await control.execute(f'CREATE DATABASE "{name}"')
        created = True
        connection = await asyncpg.connect(url, database=name)
        migrations = sorted((Path(__file__).parents[2] / "supabase" / "migrations").glob("*.sql"))
        target_index = next(i for i, path in enumerate(migrations) if target in path.stem)
        for path in migrations[:target_index]:
            await connection.execute(path.read_text(encoding="utf-8"))
        order_id, actor, supplier, reservation = [uuid4() for _ in range(4)]
        await connection.execute(
            """
            INSERT INTO order_service.orders
              (id,requester_id,supplier_id,reservation_id,supplier_snapshot,item_description,
               delivery_location,reward,state,created_at,updated_at,acceptance_deadline,delivery_deadline)
            VALUES ($1,$2,$3,$4,'{}','Existing order','COM3',5,'OPEN',now(),now(),
                    now()+interval '1 hour',now()+interval '2 hours')
        """,
            order_id,
            actor,
            supplier,
            reservation,
        )
        await connection.execute(
            """
            INSERT INTO order_service.order_history
              (order_id,sequence,new_state,actor_id,actor_type,occurred_at)
            VALUES ($1,1,'OPEN',$2,'USER',now())
        """,
            order_id,
            actor,
        )
        if state == "ACCEPTED":
            await connection.execute(
                "UPDATE order_service.orders SET state='ACCEPTED', "
                "courier_id=$2, accepted_at=now() WHERE id=$1",
                order_id,
                uuid4(),
            )
        elif state == "CANCELLED":
            await connection.execute(
                "UPDATE order_service.orders SET state='CANCELLED', cancelled_at=now() WHERE id=$1",
                order_id,
            )
            await connection.execute(
                "INSERT INTO order_service.outbox_events "
                "(event_id,event_type,order_id,reservation_id,occurred_at,next_attempt_at) "
                "VALUES ($1,'order.cancelled.v1',$2,$3,now(),now())",
                uuid4(),
                order_id,
                reservation,
            )
        old_events = [
            dict(row) for row in await connection.fetch("SELECT * FROM order_service.outbox_events")
        ]
        before = dict(
            await connection.fetchrow("SELECT * FROM order_service.orders WHERE id=$1", order_id)
        )
        await connection.execute(migrations[target_index].read_text(encoding="utf-8"))
        after = dict(
            await connection.fetchrow("SELECT * FROM order_service.orders WHERE id=$1", order_id)
        )
        assert all(after[key] == value for key, value in before.items())
        assert after["picked_up_at"] is after["delivered_at"] is after["completed_at"] is None
        assert after["overdue_at"] is None
        if target == "order_participant_failure":
            assert after["failed_at"] is after["failed_by"] is after["failure_reason"] is None
        assert await connection.fetchval("SELECT count(*) FROM order_service.order_history") == 1
        new_events = [
            dict(row) for row in await connection.fetch("SELECT * FROM order_service.outbox_events")
        ]
        assert len(new_events) == len(old_events)
        for old, new in zip(old_events, new_events, strict=True):
            assert all(new[key] == value for key, value in old.items())
    finally:
        if connection is not None:
            await connection.close()
        if created:
            # Name constructed above, no user-supplied identifier or wildcard.
            await control.execute(f'DROP DATABASE "{name}"')
        await control.close()
