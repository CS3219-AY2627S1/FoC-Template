"""Order idempotency, settlement deadlines, and dispute recovery."""

import asyncio
import os
import unittest
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import event, func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from orders import administration, creation, credit_results, disputes, repository
from orders.models import (
    CreditOperation,
    CreditOperationOutcome,
    CreditRejectionReason,
    CreditResult,
)
from orders.orm_models import (
    Base,
    CreditCommandOutbox,
    CreditStatus,
    ErrandRequest,
    OrderCreationKey,
    OrderDispute,
    Status,
)
from orders.policy import participant_actions


@unittest.skipUnless(os.environ.get("ORDER_TEST_DATABASE_URL"), "requires ORDER_TEST_DATABASE_URL")
class OrderDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema = "order_test_" + uuid4().hex
        url = make_url(os.environ["ORDER_TEST_DATABASE_URL"])
        if url.drivername == "postgresql":
            url = url.set(drivername="postgresql+psycopg")
        self.engine = create_async_engine(url)

        @event.listens_for(self.engine.sync_engine, "begin")
        def set_search_path(connection):
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{self.schema}"')

        async with self.engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.requester = uuid4()
        self.fields = dict(
            supplier_id=uuid4(), supplier_snapshot={},
            items=[{"name": "Tea", "quantity": 1}], pickup_notes=None, credits=10,
        )

    async def asyncTearDown(self):
        async with self.engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        await self.engine.dispose()

    async def create(self, **changes):
        async with self.sessions() as session:
            return await creation.create_order_idempotently(
                session, self.requester, "key", **(self.fields | changes),
            )

    async def confirm_reserve(self, session, order_id):
        command = await session.scalar(select(CreditCommandOutbox).where(
            CreditCommandOutbox.order_id == order_id, CreditCommandOutbox.routing_key == "credit.reserve"))
        await credit_results.handle_reservation_result(session, CreditResult(
            request_id=command.id, order_id=order_id, operation=CreditOperation.RESERVE,
            outcome=CreditOperationOutcome.SUCCEEDED))
        await session.commit()

    async def test_concurrent_retries_reserve_only_once(self):
        orders = await asyncio.wait_for(asyncio.gather(*(self.create() for _ in range(8))), 20)
        self.assertEqual(len({order.id for order in orders}), 1)
        async with self.sessions() as session:
            for model in (ErrandRequest, OrderCreationKey, CreditCommandOutbox):
                self.assertEqual(await session.scalar(select(func.count()).select_from(model)), 1)

    async def test_replay_accepts_snapshot_changes_but_rejects_changed_intent(self):
        first = await self.create()
        replay = await self.create(supplier_snapshot={"name": "Updated supplier"})
        self.assertEqual(first.id, replay.id)
        self.assertEqual(replay.supplier_snapshot, {})
        with self.assertRaises(creation.CreationConflict):
            await self.create(credits=11)

    async def test_late_reservation_is_refunded_once_without_reopening(self):
        order = await self.create()
        async with self.sessions() as session:
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id)
                                  .values(created_at=func.clock_timestamp() - timedelta(days=1)))
            await session.commit()
            self.assertEqual(await repository.expire_initializing_orders(session), [order.id])
            case = await disputes.open_financial_dispute(session, order.id, 'Credit operation overdue; outcome requires reconciliation.')
            reserve = await session.scalar(select(CreditCommandOutbox).where(
                CreditCommandOutbox.order_id == order.id))
            reply = CreditResult(
                request_id=reserve.id, order_id=order.id,
                operation=CreditOperation.RESERVE,
                outcome=CreditOperationOutcome.SUCCEEDED,
            )
            for _ in range(2):
                await credit_results.handle_reservation_result(session, reply)
                await session.commit()
            stored = await repository.get_order_by_id(session, order.id)
            self.assertEqual((stored.status, stored.credit_status), (Status.EXPIRED, CreditStatus.PENDING))
            self.assertIsNone(case.closed_at)
            commands = list(await session.scalars(select(CreditCommandOutbox).where(
                CreditCommandOutbox.order_id == order.id)))
            self.assertEqual(len(commands), 2)
            release = next(c for c in commands if c.routing_key == "credit.release")
            released = reply.model_copy(update={
                "request_id": release.id, "operation": CreditOperation.RELEASE,
            })
            await credit_results.handle_release_result(session, released)
            await session.commit()
            self.assertEqual((stored.status, stored.credit_status), (Status.EXPIRED, CreditStatus.SUCCEEDED))
            self.assertIsNotNone(case.closed_at)
            self.assertIsNone(case.closed_by)
            self.assertEqual(case.resolution, 'recovered')
            self.assertEqual(stored.status_reason, disputes.RECOVERED_REFUND_REASON)

    async def test_expiry_refund_opens_financial_case_only_after_settlement_timeout(self):
        order = await self.create()
        async with self.sessions() as session:
            await self.confirm_reserve(session, order.id)
            # Refunds have their own deadline, independent of the order's age.
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                created_at=func.clock_timestamp() - timedelta(days=1),
                expires_at=func.clock_timestamp() - timedelta(seconds=1),
            ))
            await session.commit()
            self.assertEqual(await repository.expire_orders(session), [order.id])
            stored = await repository.get_order_by_id(session, order.id)
            self.assertEqual((stored.status, stored.credit_operation, stored.credit_status),
                             (Status.EXPIRED, "RELEASE", CreditStatus.PENDING))
            self.assertGreater(stored.settlement_due_at, await session.scalar(select(func.clock_timestamp())))
            self.assertEqual(await repository.dispute_overdue_orders(session), [])
            self.assertEqual(await session.scalar(select(func.count()).select_from(OrderDispute)), 0)

            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                settlement_due_at=func.clock_timestamp() - timedelta(seconds=1),
            ))
            await session.commit()
            self.assertEqual(await repository.dispute_overdue_orders(session), [order.id])
            case = await session.scalar(select(OrderDispute).where(OrderDispute.order_id == order.id))
            self.assertEqual(case.kind, "financial")
            self.assertIsNone(case.closed_at)

    async def test_expired_initialization_still_opens_financial_case(self):
        order = await self.create()
        async with self.sessions() as session:
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                created_at=func.clock_timestamp() - timedelta(days=1),
            ))
            await session.commit()
            self.assertEqual(await repository.expire_initializing_orders(session), [order.id])
            self.assertEqual(await repository.dispute_overdue_orders(session), [order.id])
            case = await session.scalar(select(OrderDispute).where(OrderDispute.order_id == order.id))
            self.assertEqual(case.kind, "financial")
            self.assertIsNone(case.closed_at)

    async def test_participant_actions_match_locked_transitions_and_deadlines(self):
        order = await self.create()
        courier = uuid4()
        async with self.sessions() as session:
            await self.confirm_reserve(session, order.id)
            stored = await repository.get_order_by_id(session, order.id)
            now = await session.scalar(select(func.clock_timestamp()))
            self.assertEqual(participant_actions(stored, self.requester, now), ["cancel"])
            self.assertIsNone(await repository.accept_order(session, order.id, self.requester))
            self.assertIsNotNone(await repository.accept_order(session, order.id, courier))
            stored = await repository.get_order_by_id(session, order.id)
            self.assertEqual(participant_actions(stored, courier, now), ["pickup", "dispute"])
            self.assertIsNone(await repository.pickup_order(session, order.id, self.requester))
            self.assertIsNotNone(await repository.pickup_order(session, order.id, courier))
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                progress_due_at=func.clock_timestamp() - timedelta(seconds=1)))
            await session.commit()
            self.assertIsNone(await repository.deliver_order(session, order.id, courier))
            stored = await repository.get_order_by_id(session, order.id)
            now = await session.scalar(select(func.clock_timestamp()))
            self.assertEqual(participant_actions(stored, courier, now), ["dispute"])
            reported = await repository.dispute_order(session, order.id, courier, "Late delivery")
            self.assertEqual(participant_actions(reported, courier, now), [])
            repeated = await repository.dispute_order(session, order.id, courier, "Changed reason")
            self.assertEqual(repeated.disputes[0].reason, "Late delivery")

    async def test_late_transfer_completes_without_disputing(self):
        order = await self.create()
        courier = uuid4()
        async with self.sessions() as session:
            await self.confirm_reserve(session, order.id)
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                status=Status.DELIVERED, credit_status=CreditStatus.SUCCEEDED,
                courier_id=courier, progress_due_at=func.clock_timestamp() + timedelta(days=1),
            ))
            await session.commit()
            await repository.receive_order(session, order.id, self.requester)
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id)
                                  .values(settlement_due_at=func.clock_timestamp() - timedelta(seconds=1)))
            await session.commit()
            self.assertEqual(await repository.dispute_overdue_orders(session), [order.id])
            transfer = await session.scalar(select(CreditCommandOutbox).where(
                CreditCommandOutbox.order_id == order.id,
                CreditCommandOutbox.routing_key == "credit.transfer",
            ))
            reply = CreditResult(
                request_id=transfer.id, order_id=order.id,
                operation=CreditOperation.TRANSFER,
                outcome=CreditOperationOutcome.SUCCEEDED,
            )
            await credit_results.handle_transfer_result(session, reply)
            await session.commit()
            stored = await repository.get_order_by_id(session, order.id)
            self.assertEqual((stored.status, stored.credit_status), (Status.COMPLETED, CreditStatus.SUCCEEDED))
            self.assertIsNone(stored.settlement_due_at)
            case = await session.scalar(select(OrderDispute).where(OrderDispute.order_id == order.id))
            self.assertIsNotNone(case.closed_at)
            self.assertIsNone(case.closed_by)

    async def test_rejected_timeout_remains_open_for_review(self):
        order = await self.create()
        async with self.sessions() as session:
            case = await disputes.open_financial_dispute(session, order.id, 'Credit operation overdue; outcome requires reconciliation.')
            command = await session.scalar(select(CreditCommandOutbox).where(
                CreditCommandOutbox.order_id == order.id))
            await credit_results.handle_reservation_result(session, CreditResult(
                request_id=command.id, order_id=order.id, operation=CreditOperation.RESERVE,
                outcome=CreditOperationOutcome.REJECTED,
                reason=CreditRejectionReason.INSUFFICIENT_CREDITS,
            ))
            await session.commit()
            await disputes.close_recovered_timeout_cases(session, order.id)
            self.assertIsNone(case.closed_at)

    async def test_recovery_waits_for_all_outcomes_and_preserves_other_cases(self):
        order = await self.create()
        async with self.sessions() as session:
            case = await disputes.open_financial_dispute(session, order.id, 'Credit operation overdue; outcome requires reconciliation.')
            # Even a succeeded order cannot hide an unknown command outcome.
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id)
                                  .values(credit_status=CreditStatus.SUCCEEDED))
            await disputes.close_recovered_timeout_cases(session, order.id)
            self.assertIsNone(case.closed_at)
            await self.confirm_reserve(session, order.id)
            self.assertIsNotNone(case.closed_at)
            # Participant and fulfilment complaints require administrator decisions.
            for kind, reason, actor in [('financial', 'Credit operation overdue', self.requester),
                                        ('fulfilment', 'Fulfilment deadline exceeded.', None)]:
                case.closed_at = None
                case.kind, case.reason, case.opened_by = kind, reason, actor
                await disputes.close_recovered_timeout_cases(session, order.id)
                self.assertIsNone(case.closed_at)

    async def test_resolution_is_atomic_idempotent_and_audited(self):
        order = await self.create()
        admin, courier = uuid4(), uuid4()
        async with self.sessions() as session:
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                status=Status.ACCEPTED, credit_status=CreditStatus.SUCCEEDED,
                courier_id=courier, status_reason="Supplier closed",
            ))
            await session.commit()
            await self.confirm_reserve(session, order.id)
            await repository.dispute_order(session, order.id, courier, "Supplier closed")
            case = await session.scalar(select(OrderDispute).where(OrderDispute.order_id == order.id))
            for _ in range(2):
                resolved = await administration.resolve_dispute(session, case.id, admin, "refund", "No delivery")
                self.assertEqual((resolved.status, resolved.credit_status), (Status.ACCEPTED, CreditStatus.PENDING))
                self.assertEqual(resolved.status_reason, "Supplier closed")
            self.assertEqual(await session.scalar(select(func.count()).select_from(OrderDispute)), 1)
            self.assertEqual(await session.scalar(select(func.count()).select_from(CreditCommandOutbox)), 2)
            logs = await repository.get_order_audit_logs(session, order.id)
            self.assertTrue(any(log.actor_id == admin and "No delivery" in (log.reason or "") for log in logs))
            with self.assertRaises(administration.ResolutionConflict):
                await administration.resolve_dispute(session, case.id, admin, "pay", "No delivery")
            await session.rollback()
            release = await session.scalar(select(CreditCommandOutbox).where(
                CreditCommandOutbox.order_id == order.id, CreditCommandOutbox.routing_key == "credit.release",
            ))
            await credit_results.handle_release_result(session, CreditResult(
                request_id=release.id, order_id=order.id, operation=CreditOperation.RELEASE,
                outcome=CreditOperationOutcome.SUCCEEDED,
            ))
            await session.commit()
            resolved = await repository.get_order_by_id(session, order.id)
            self.assertEqual((resolved.status, resolved.credit_status), (Status.ACCEPTED, CreditStatus.SUCCEEDED))

    async def test_participant_admin_can_pay_own_order_and_preserve_fulfilment(self):
        order = await self.create()
        courier = uuid4()
        async with self.sessions() as session:
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                status=Status.ACCEPTED, credit_status=CreditStatus.SUCCEEDED, courier_id=courier,
            ))
            await session.commit()
            await self.confirm_reserve(session, order.id)
            await repository.dispute_order(session, order.id, courier, "Delivery contested")
            case = await session.scalar(select(OrderDispute).where(OrderDispute.order_id == order.id))
            resolved = await administration.resolve_dispute(session, case.id, courier, "pay", "Delivered")
            self.assertEqual(case.closed_by, courier)
            self.assertEqual((resolved.status, resolved.credit_status), (Status.ACCEPTED, CreditStatus.PENDING))
            self.assertIsNone(resolved.progress_due_at)
            # Settlement timeouts are financial cases, not new fulfilment disputes.
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id)
                                  .values(settlement_due_at=func.clock_timestamp() - timedelta(seconds=1)))
            await session.commit()
            self.assertEqual(await repository.dispute_overdue_orders(session), [order.id])
            financial = await session.scalar(select(OrderDispute).where(
                OrderDispute.order_id == order.id, OrderDispute.kind == 'financial'))
            self.assertIsNotNone(financial)
            self.assertIsNone(await repository.dispute_order(session, order.id, courier, 'Again'))
            self.assertIsNone(await repository.pickup_order(session, order.id, courier))
            transfer = await session.scalar(select(CreditCommandOutbox).where(
                CreditCommandOutbox.order_id == order.id, CreditCommandOutbox.routing_key == "credit.transfer",
            ))
            await credit_results.handle_transfer_result(session, CreditResult(
                request_id=transfer.id, order_id=order.id, operation=CreditOperation.TRANSFER,
                outcome=CreditOperationOutcome.SUCCEEDED,
            ))
            await session.commit()
            self.assertEqual((resolved.status, resolved.credit_status), (Status.ACCEPTED, CreditStatus.SUCCEEDED))
            self.assertIsNone(resolved.settlement_due_at)
            self.assertIsNone(await repository.dispute_order(session, order.id, courier, 'Again'))

    async def test_pending_settlement_cannot_be_refunded(self):
        order = await self.create()
        async with self.sessions() as session:
            await session.execute(update(ErrandRequest).where(ErrandRequest.id == order.id).values(
                status=Status.RECEIVED, credit_status=CreditStatus.PENDING, courier_id=uuid4(),
            ))
            repository.add_credit_command(session, repository.TransferCreditCommand(
                request_id=uuid4(), order_id=order.id, courier_id=uuid4(),
            ))
            await session.commit()
            case = await disputes.open_financial_dispute(session, order.id, "Settlement overdue")
            await session.commit()
            with self.assertRaises(administration.ResolutionConflict):
                await administration.resolve_dispute(session, case.id, uuid4(), "refund", "Unsafe")

    async def test_rejection_stops_command_replay(self):
        order = await self.create()
        async with self.sessions() as session:
            command = await repository.find_pending_credit_command(session, 60)
            self.assertIsNotNone(command)
            await credit_results.handle_reservation_result(session, CreditResult(
                request_id=command.id, order_id=order.id, operation=CreditOperation.RESERVE,
                outcome=CreditOperationOutcome.REJECTED, reason=CreditRejectionReason.INSUFFICIENT_CREDITS,
            ))
            await session.commit()
            self.assertIsNone(await repository.find_pending_credit_command(session, 60))
            self.assertEqual((await session.get(ErrandRequest, order.id)).status, Status.REJECTED)
            self.assertIsNone(await session.scalar(select(OrderDispute.id).where(
                OrderDispute.order_id == order.id,
            )))
