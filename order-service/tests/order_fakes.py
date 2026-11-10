# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented test doubles for Order creation, persistence and HTTP dependencies.
# Author review: I validated correctness and added boundary checks where needed.

"""Test-only memory/HTTP doubles. Never imported by app modules."""

from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from app.orders.analytics import period_bounds
from app.orders.errors import ApiError, unavailable
from app.orders.schemas import Principal, Reservation


class FakeClients:
    def __init__(self, actor):
        self.actor = actor
        self.role = "USER"
        self.reservations = {}
        self.closed = set()
        self.reserve_calls = 0
        self.reserve_behavior = "success"
        self.auth_error = None
        self.supplier_error = None
        self.abort_unavailable = False
        self.configured = True

    def ensure_credit_configured(self):
        if not self.configured:
            raise unavailable("CREDIT_UNAVAILABLE")

    async def identity(self, token):
        if self.auth_error:
            raise self.auth_error
        return Principal.model_validate(
            {"userId": self.actor, "systemRole": self.role, "accountStatus": "ACTIVE"}
        )

    async def supplier(self, supplier_id, token):
        if self.supplier_error:
            raise self.supplier_error
        return {
            "name": "Cafe",
            "buildingArea": "COM3",
            "pickupLocationDescription": "Counter",
            "floor": None,
            "latitude": None,
            "longitude": None,
            "updatedAt": datetime.now(UTC).isoformat(),
        }

    async def credit(self, action, op):
        order_id = op["order_id"]
        if action == "abort":
            if self.abort_unavailable:
                raise unavailable("CREDIT_UNAVAILABLE")
            self.closed.add(order_id)
            self.reservations.pop(order_id, None)
            return self.result(op, "CLOSED", None)
        if action == "status":
            if order_id in self.closed:
                return self.result(op, "CLOSED", None)
            return self.reservations.get(order_id)
        self.reserve_calls += 1
        if order_id in self.closed:
            raise ApiError(409, "CREATION_ABORTED", "Closed")
        if self.reserve_behavior == "insufficient":
            raise ApiError(409, "INSUFFICIENT_CREDIT", "Insufficient")
        result = self.reservations.setdefault(order_id, self.result(op, "RESERVED", uuid4()))
        if self.reserve_behavior == "timeout":
            raise unavailable("CREDIT_UNAVAILABLE")
        return result

    def result(self, op, state, reservation_id):
        return Reservation.model_validate(
            {
                "operationId": op["id"],
                "orderId": op["order_id"],
                "requesterId": op["requester_id"],
                "amount": op["payload"]["reward"],
                "reservationId": reservation_id,
                "state": state,
            }
        )


class MemoryRepository:
    def __init__(self):
        self.ops = {}
        self.rows = {}
        self.histories = {}

    async def lookup_key(self, actor, key_hash):
        return next(
            (
                deepcopy(op)
                for op in self.ops.values()
                if op["requester_id"] == actor and op["key_hash"] == key_hash
            ),
            None,
        )

    async def operation(self, operation_id):
        return deepcopy(self.ops.get(operation_id))

    async def begin(self, actor, key_hash, request_hash, body, snapshot):
        existing = await self.lookup_key(actor, key_hash)
        if existing:
            return existing
        now = datetime.now(UTC)
        op = dict(
            id=uuid4(),
            order_id=uuid4(),
            requester_id=actor,
            key_hash=key_hash,
            request_hash=request_hash,
            payload=body.model_dump(mode="json", by_alias=True),
            supplier_snapshot=snapshot,
            stage="VALIDATED",
            created_at=now,
            acceptance_deadline=body.acceptance_deadline,
            updated_at=now,
            attempts=0,
            lease_token=None,
            lease_until=None,
            error_code=None,
            reservation_id=None,
        )
        self.ops[op["id"]] = op
        return deepcopy(op)

    async def claim(self, operation_id):
        op = self.ops[operation_id]
        if op["stage"] in ("SUCCEEDED", "ABORTED") or op["lease_token"]:
            return None
        op.update(lease_token=uuid4(), attempts=op["attempts"] + 1)
        return deepcopy(op)

    async def change(self, operation, *, release=False, delay=0, **values):
        op = self.ops[operation["id"]]
        if op["lease_token"] != operation["lease_token"] or op["stage"] in ("SUCCEEDED", "ABORTED"):
            return None
        op.update(values)
        if release:
            op.update(lease_token=None, lease_until=None)
        return deepcopy(op)

    async def finalize(self, operation, reservation_id, snapshot):
        op = self.ops[operation["id"]]
        if op["lease_token"] != operation["lease_token"] or op["stage"] == "ABORTING":
            return False
        now = datetime.now(UTC)
        if op["acceptance_deadline"] <= now:
            op.update(stage="ABORTING", error_code="DEADLINE_PASSED")
            return False
        body = op["payload"]
        self.rows[op["order_id"]] = dict(
            id=op["order_id"],
            requester_id=op["requester_id"],
            courier_id=None,
            supplier_id=body["supplierId"],
            supplier_snapshot=snapshot,
            item_description=body["itemDescription"],
            delivery_location=body["deliveryLocation"],
            reward=body["reward"],
            state="OPEN",
            reservation_id=reservation_id,
            acceptance_deadline=op["acceptance_deadline"],
            delivery_deadline=datetime.fromisoformat(body["deliveryDeadline"]),
            created_at=now,
            updated_at=now,
        )
        self.histories[op["order_id"]] = [
            dict(
                sequence=1,
                previous_state=None,
                new_state="OPEN",
                actor_id=op["requester_id"],
                actor_type="USER",
                occurred_at=now,
            )
        ]
        op.update(stage="SUCCEEDED", lease_token=None, reservation_id=reservation_id)
        return True

    async def order(self, order_id):
        return deepcopy(self.rows.get(order_id))

    async def list_orders(self, query, *, requester=None, courier=None, available=False):
        rows = [
            deepcopy(row)
            for row in self.rows.values()
            if (not requester or row["requester_id"] == requester)
            and (not courier or row["courier_id"] == courier)
            and (
                not available
                or (row["state"] == "OPEN" and row["acceptance_deadline"] > datetime.now(UTC))
            )
            and (
                not getattr(query, "supplier_id", None)
                or str(row["supplier_id"]) == str(query.supplier_id)
            )
            and (not getattr(query, "order_id", None) or row["id"] == query.order_id)
            and (
                not getattr(query, "participant_id", None)
                or query.participant_id in (row["requester_id"], row["courier_id"])
            )
            and (not getattr(query, "state", None) or row["state"] in query.state)
            and (
                not getattr(query, "created_from", None)
                or row["created_at"] >= period_bounds(query.created_from, query.created_from)[0]
            )
            and (
                not getattr(query, "created_to", None)
                or row["created_at"] < period_bounds(query.created_to, query.created_to)[1]
            )
            and (
                getattr(query, "overdue", None) is None
                or (row.get("overdue_at") is not None) == query.overdue
            )
        ]
        rows.sort(key=lambda row: (row["created_at"], row["id"]), reverse=True)
        start = (query.page - 1) * query.page_size
        return rows[start : start + query.page_size], len(rows)

    async def order_history(self, order_id, query):
        rows = self.histories.get(order_id, [])
        start = (query.page - 1) * query.page_size
        return rows[start : start + query.page_size], len(rows)

    async def created_between(self, start, end, *, participant=None):
        columns = ("id", "requester_id", "courier_id", "supplier_id", "state", "created_at")
        rows = [
            {
                **{column: row[column] for column in columns},
                "supplier_name": row["supplier_snapshot"]["name"],
                "completed_at": row.get("completed_at"),
            }
            for row in self.rows.values()
            if start <= row["created_at"] < end
            and (participant is None or participant in (row["requester_id"], row["courier_id"]))
        ]
        return sorted(rows, key=lambda row: (row["created_at"], str(row["id"])))
