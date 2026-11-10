# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-28
# Scope: Generated test doubles for identity and ledger dependencies; extended them for admin
# credit views.
# Author review: I validated correctness and supplied additional boundary checks.

"""Explicit test doubles. Never imported by application code."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.credits.schemas import Principal


class FakeLedger:
    def __init__(self):
        self.calls: list[tuple] = []
        self.error: Exception | None = None
        self.created = True
        self.state = "RESERVED"
        self.reservation: dict | None = None
        self.wallet_row: dict | None = None
        self.history_rows: tuple[list[dict], int] = ([], 0)
        self.totals = {"available": 0, "reserved": 0, "transfer_count": 0, "transfer_amount": 0}
        self.outcome = "APPLIED"
        self.failures: list[dict] = []

    def _row(self, order_id: UUID, request) -> dict:
        return {
            "operation_id": request.operation_id,
            "order_id": order_id,
            "requester_id": request.requester_id,
            "amount": request.amount,
            "reservation_id": None if self.state == "CLOSED" else uuid4(),
            "state": self.state,
        }

    async def reserve(self, order_id, request):
        self.calls.append(("reserve", order_id, request))
        if self.error:
            raise self.error
        return self._row(order_id, request), self.created

    async def abort(self, order_id, request):
        self.calls.append(("abort", order_id, request))
        if self.error:
            raise self.error
        self.state = "CLOSED"
        return self._row(order_id, request), self.created

    async def status(self, order_id):
        self.calls.append(("status", order_id))
        return self.reservation

    async def owner_wallet(self, user_id):
        self.calls.append(("owner_wallet", user_id))
        return self.wallet_row

    async def wallet(self, user_id):
        self.calls.append(("wallet", user_id))
        return self.wallet_row

    async def history(self, user_id, page, page_size):
        self.calls.append(("history", user_id, page, page_size))
        return self.history_rows

    async def credit_totals(self, start, end):
        self.calls.append(("credit_totals", start, end))
        return self.totals

    async def allocate_initial(self, event, attempt):
        self.calls.append(("allocate", event.event_id, attempt))
        if self.error:
            raise self.error
        return self.outcome

    async def settle(self, event, attempt):
        self.calls.append(("settle", event.event_id, attempt))
        if self.error:
            raise self.error
        return self.outcome

    async def record_failure(self, **values):
        self.failures.append(values)


class FakeIdentity:
    def __init__(self, role: str = "USER", user_id: UUID | None = None):
        self.principal = Principal(
            user_id=user_id or uuid4(), system_role=role, account_status="ACTIVE"
        )
        self.error: Exception | None = None
        self.tokens: list[str] = []

    async def identity(self, token: str) -> Principal:
        self.tokens.append(token)
        if self.error:
            raise self.error
        return self.principal


class FakeMessage:
    def __init__(self, body: bytes, amqp_type: str | None, headers: dict | None = None):
        self.body = body
        self.type = amqp_type
        self.headers = headers or {}
        self.message_id = "message-1"
        self.content_type = "application/json"
        self.acked = False

    async def ack(self):
        self.acked = True


class FakeExchange:
    def __init__(self):
        self.published: list[tuple] = []
        self.error: Exception | None = None

    async def publish(self, message, routing_key):
        if self.error:
            raise self.error
        self.published.append((message, routing_key))


class FakeChannel:
    def __init__(self):
        self.default_exchange = FakeExchange()


def wallet_row(user_id: UUID, available: int = 70, reserved: int = 30) -> dict:
    return {
        "user_id": user_id,
        "available": available,
        "reserved": reserved,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }
