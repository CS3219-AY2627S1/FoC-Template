"""Atomic settlement repairs, wallet provisioning, and concurrent command delivery."""

import asyncio
import os
import unittest
from datetime import datetime
from uuid import uuid4

from sqlalchemy import event, func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from credit.exceptions import CreditRequestConflictError
from credit.models import (
    CreditAuditAction,
    CreditOperationOutcome,
    CreditRejectionReason,
    ReleaseCreditCommand,
    ReservationRepair,
    ReserveCreditCommand,
    TransferCreditCommand,
)
from credit.orm_models import (
    Base,
    Credit,
    CreditAuditLog,
    CreditOutbox,
    CreditReservation,
)
from credit.service import process_credit_command


@unittest.skipUnless(
    os.environ.get("CREDIT_TEST_DATABASE_URL"), "requires CREDIT_TEST_DATABASE_URL"
)
class SettlementRepairDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.schema = "credit_repair_test_" + uuid4().hex
        url = make_url(os.environ["CREDIT_TEST_DATABASE_URL"])
        if url.drivername == "postgresql":
            url = url.set(drivername="postgresql+psycopg")
        self.engine = create_async_engine(url)

        @event.listens_for(self.engine.sync_engine, "begin")
        def search_path(connection):
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{self.schema}"')

        async with self.engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.requester, self.courier, self.order, self.case = [
            uuid4() for _ in range(4)
        ]
        now = datetime.now()
        async with self.sessions.begin() as session:
            session.add_all(
                [
                    Credit(
                        user_id=user,
                        available_credits=100,
                        reserved_credits=0,
                        created_at=now,
                        updated_at=now,
                    )
                    for user in (self.requester, self.courier)
                ]
            )
        await self.process(
            ReserveCreditCommand(
                request_id=uuid4(),
                order_id=self.order,
                requester_id=self.requester,
                amount=10,
            )
        )
        # Deliberately reproduce a missing-held-credit incident.
        async with self.sessions.begin() as session:
            await session.execute(
                update(Credit)
                .where(Credit.user_id == self.requester)
                .values(reserved_credits=7)
            )
        self.original = TransferCreditCommand(
            request_id=uuid4(), order_id=self.order, courier_id=self.courier
        )
        result = await self.process(self.original)
        self.assertEqual(result.reason, CreditRejectionReason.BALANCE_INCONSISTENT)

    async def asyncTearDown(self):
        async with self.engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        await self.engine.dispose()

    async def process(self, command):
        async with self.sessions() as session:
            return await process_credit_command(session, command)

    def repair(self, action="cover_reserved", original=None):
        original = original or self.original
        return original.model_copy(
            update={
                "request_id": uuid4(),
                "repair": ReservationRepair(
                    action=action,
                    actor_id=self.requester,
                    dispute_id=self.case,
                    rejected_request_id=original.request_id,
                    reason="Verified missing held credits",
                ),
            }
        )

    async def balances(self):
        async with self.sessions() as session:
            accounts = [
                await session.get(Credit, user)
                for user in (self.requester, self.courier)
            ]
            return [
                (account.available_credits, account.reserved_credits)
                for account in accounts
            ]

    async def test_missing_wallet_refusal_is_durable_and_new_checkout_can_succeed(self):
        user_id = uuid4()
        command = ReserveCreditCommand(
            request_id=uuid4(),
            order_id=uuid4(),
            requester_id=user_id,
            amount=10,
        )
        refused = await self.process(command)
        self.assertEqual(refused.outcome, CreditOperationOutcome.REJECTED)
        self.assertEqual(refused.reason, CreditRejectionReason.ACCOUNT_NOT_FOUND)
        async with self.sessions.begin() as session:
            self.assertIsNotNone(await session.get(CreditOutbox, command.request_id))
            now = datetime.now()
            session.add(
                Credit(
                    user_id=user_id,
                    available_credits=100,
                    reserved_credits=0,
                    created_at=now,
                    updated_at=now,
                )
            )
        for _ in range(2):
            self.assertEqual(await self.process(command), refused)
        async with self.sessions() as session:
            wallet = await session.get(Credit, user_id)
            self.assertEqual((wallet.available_credits, wallet.reserved_credits), (100, 0))
        new_checkout = command.model_copy(update={"request_id": uuid4(), "order_id": uuid4()})
        self.assertEqual(
            (await self.process(new_checkout)).outcome, CreditOperationOutcome.SUCCEEDED
        )
        async with self.sessions() as session:
            wallet = await session.get(Credit, user_id)
            self.assertEqual(
                (wallet.available_credits, wallet.reserved_credits), (90, 10)
            )

    async def test_missing_recipient_refusal_is_durable_after_wallet_is_provisioned(
        self,
    ):
        recipient = uuid4()
        command = TransferCreditCommand(
            request_id=uuid4(), order_id=self.order, courier_id=recipient
        )
        async with self.sessions.begin() as session:
            await session.execute(
                update(Credit)
                .where(Credit.user_id == self.requester)
                .values(reserved_credits=10)
            )
        refused = await self.process(command)
        self.assertEqual(refused.outcome, CreditOperationOutcome.REJECTED)
        self.assertEqual(refused.reason, CreditRejectionReason.ACCOUNT_NOT_FOUND)
        async with self.sessions.begin() as session:
            self.assertIsNotNone(await session.get(CreditOutbox, command.request_id))
            now = datetime.now()
            session.add(
                Credit(
                    user_id=recipient,
                    available_credits=100,
                    reserved_credits=0,
                    created_at=now,
                    updated_at=now,
                )
            )
        for _ in range(2):
            self.assertEqual(await self.process(command), refused)
        async with self.sessions() as session:
            self.assertEqual(
                (await session.get(Credit, recipient)).available_credits, 100
            )
            self.assertEqual(
                (await session.get(Credit, self.requester)).reserved_credits, 10
            )

    async def test_cover_and_settlement_commit_once_despite_lost_reply_and_concurrent_replay(
        self,
    ):
        command = self.repair()
        results = await asyncio.wait_for(
            asyncio.gather(*(self.process(command) for _ in range(4))), 20
        )
        self.assertTrue(
            all(
                result.outcome == CreditOperationOutcome.SUCCEEDED for result in results
            )
        )
        self.assertEqual(await self.balances(), [(90, 0), (110, 0)])
        async with self.sessions() as session:
            for action in (
                CreditAuditAction.ADMIN_COVER_RESERVED,
                CreditAuditAction.TRANSFER,
            ):
                self.assertEqual(
                    await session.scalar(
                        select(func.count())
                        .select_from(CreditAuditLog)
                        .where(CreditAuditLog.action == action)
                    ),
                    1,
                )
            audit = await session.scalar(
                select(CreditAuditLog).where(
                    CreditAuditLog.action == CreditAuditAction.ADMIN_COVER_RESERVED
                )
            )
            self.assertEqual(audit.amount, 3)
            self.assertEqual(
                audit.actor_id, self.requester, "admins can handle their own issues"
            )

    async def test_distinct_concurrent_actions_cannot_fund_or_pay_twice(self):
        results = await asyncio.wait_for(
            asyncio.gather(
                self.process(self.repair()),
                self.process(self.repair("charge_reserved")),
            ),
            20,
        )
        self.assertEqual(
            sum(
                result.outcome == CreditOperationOutcome.SUCCEEDED for result in results
            ),
            1,
        )
        balances = await self.balances()
        self.assertIn(balances, ([(90, 0), (110, 0)], [(87, 0), (110, 0)]))
        async with self.sessions() as session:
            self.assertEqual(
                await session.scalar(
                    select(func.count())
                    .select_from(CreditAuditLog)
                    .where(
                        CreditAuditLog.action.in_(
                            (
                                CreditAuditAction.ADMIN_COVER_RESERVED,
                                CreditAuditAction.ADMIN_CHARGE_RESERVED,
                            )
                        ),
                    )
                ),
                1,
            )

    async def test_charge_requester_only_for_shortfall_then_pay_full_reservation(self):
        result = await self.process(self.repair("charge_reserved"))
        self.assertEqual(result.outcome, CreditOperationOutcome.SUCCEEDED)
        self.assertEqual(await self.balances(), [(87, 0), (110, 0)])

    async def test_failed_settlement_rolls_back_funding_and_its_audit(self):
        # A courier-side inconsistency is not repairable by charging the requester.
        async with self.sessions.begin() as session:
            await session.execute(
                update(Credit)
                .where(Credit.user_id == self.courier)
                .values(reserved_credits=1)
            )
        before = await self.balances()
        result = await self.process(self.repair("charge_reserved"))
        self.assertEqual(result.outcome, CreditOperationOutcome.REJECTED)
        self.assertEqual(await self.balances(), before)
        async with self.sessions() as session:
            self.assertEqual(
                await session.scalar(
                    select(func.count())
                    .select_from(CreditAuditLog)
                    .where(
                        CreditAuditLog.action == CreditAuditAction.ADMIN_CHARGE_RESERVED
                    )
                ),
                0,
            )
            self.assertEqual(
                (await session.get(CreditReservation, self.order)).status, "RESERVED"
            )

    async def test_failed_charge_can_be_followed_by_platform_cover_without_partial_charge(
        self,
    ):
        async with self.sessions.begin() as session:
            await session.execute(
                update(Credit)
                .where(Credit.user_id == self.requester)
                .values(available_credits=0)
            )
        charge = self.repair("charge_reserved")
        result = await self.process(charge)
        self.assertEqual(result.reason, CreditRejectionReason.INSUFFICIENT_CREDITS)
        self.assertEqual(await self.balances(), [(0, 7), (100, 0)])
        result = await self.process(self.repair(original=charge))
        self.assertEqual(result.outcome, CreditOperationOutcome.SUCCEEDED)
        self.assertEqual(await self.balances(), [(0, 0), (110, 0)])

    async def test_unknown_outcome_or_changed_recipient_cannot_authorize_funding(self):
        for command in (
            self.repair(
                original=self.original.model_copy(update={"request_id": uuid4()})
            ),
            self.repair().model_copy(update={"courier_id": uuid4()}),
        ):
            result = await self.process(command)
            self.assertEqual(result.outcome, CreditOperationOutcome.REJECTED)
            self.assertEqual(await self.balances(), [(90, 7), (100, 0)])

    async def test_reused_id_with_different_funding_choice_is_a_conflict(self):
        command = self.repair()
        await self.process(command)
        changed = command.model_copy(
            update={
                "repair": command.repair.model_copy(
                    update={"action": "charge_reserved"}
                )
            }
        )
        with self.assertRaises(CreditRequestConflictError):
            await self.process(changed)
        self.assertEqual(await self.balances(), [(90, 0), (110, 0)])

    async def test_release_repair_returns_held_funds_without_paying_courier(self):
        original = ReleaseCreditCommand(request_id=uuid4(), order_id=self.order)
        self.assertEqual(
            (await self.process(original)).reason,
            CreditRejectionReason.BALANCE_INCONSISTENT,
        )
        self.assertEqual(
            (await self.process(self.repair(original=original))).outcome,
            CreditOperationOutcome.SUCCEEDED,
        )
        self.assertEqual(await self.balances(), [(100, 0), (100, 0)])
