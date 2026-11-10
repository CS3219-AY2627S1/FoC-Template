# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11, 2026-10-16
# Scope: Implemented Credit test-double behavior and retained it only in automated tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Automated-test Credit double; not packaged or deployable as a FoC service."""

import hmac
import json
import sqlite3
from contextlib import contextmanager
from typing import Literal
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt, model_validator


class Request(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operationId: UUID
    requesterId: UUID
    amount: StrictInt = Field(gt=0, le=2_147_483_647)


class TerminalEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eventId: UUID
    eventType: Literal[
        "order.cancelled.v1", "order.expired.v1", "order.completed.v1", "order.failed.v1"
    ]
    orderId: UUID
    reservationId: UUID
    occurredAt: AwareDatetime
    requesterId: UUID | None = None
    courierId: UUID | None = None
    amount: StrictInt | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def completion_identity(self):
        if self.eventType == "order.completed.v1":
            if (
                not self.requesterId
                or not self.courierId
                or not self.amount
                or self.requesterId == self.courierId
            ):
                raise ValueError("Completion requires matching participants and amount")
        elif any(value is not None for value in (self.requesterId, self.courierId, self.amount)):
            raise ValueError("Release carries no transfer identity")
        return self


class StubError(Exception):
    def __init__(self, status: int, code: str):
        self.status, self.code = status, code


class Store:
    def __init__(self, path: str):
        self.path = path
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS reservations (
                    order_id TEXT PRIMARY KEY, body TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def read(db, order_id):
        row = db.execute(
            "SELECT body FROM reservations WHERE order_id = ?", (str(order_id),)
        ).fetchone()
        return json.loads(row[0]) if row else None

    @staticmethod
    def save(db, value):
        db.execute(
            "INSERT OR REPLACE INTO reservations VALUES (?, ?)",
            (value["orderId"], json.dumps(value)),
        )

    def get(self, order_id):
        with self.connect() as db:
            return self.read(db, order_id)

    def change(self, order_id, request: Request, abort=False, mode="success"):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = self.read(db, order_id)
            identity = request.model_dump(mode="json")
            if previous and any(previous[key] != value for key, value in identity.items()):
                raise StubError(409, "IDENTITY_CONFLICT")
            if previous:
                if abort and previous["state"] == "TRANSFERRED":
                    raise StubError(409, "SETTLEMENT_CONFLICT")
                if abort and previous["state"] != "CLOSED":
                    previous["state"] = "CLOSED"
                    self.save(db, previous)
                return previous
            if not abort and mode != "success":
                raise StubError(409, mode.upper())
            value = {
                **identity,
                "orderId": str(order_id),
                "reservationId": None if abort else str(uuid4()),
                "state": "CLOSED" if abort else "RESERVED",
            }
            self.save(db, value)
            return value

    def release(self, event: TerminalEvent):
        # Historical method name retained for release-test compatibility; handles settlement.
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM events WHERE event_id = ?", (str(event.eventId),)
            ).fetchone():
                return
            value = self.read(db, event.orderId)
            if not value or value["reservationId"] != str(event.reservationId):
                raise ValueError("Unknown reservation")
            target = "TRANSFERRED" if event.eventType == "order.completed.v1" else "RELEASED"
            if target == "TRANSFERRED" and (
                str(event.requesterId) != value["requesterId"] or event.amount != value["amount"]
            ):
                raise ValueError("Mismatched transfer")
            if value["state"] == "RESERVED":
                value["state"] = target
                if target == "TRANSFERRED":
                    value["courierId"] = str(event.courierId)
                self.save(db, value)
            elif target == "TRANSFERRED" and (
                value["state"] != target or value.get("courierId") != str(event.courierId)
            ):
                raise ValueError("Conflicting settlement")
            db.execute("INSERT INTO events VALUES (?)", (str(event.eventId),))


def create_app(store: Store, secret: str, mode="success"):
    modes = {"success", "insufficient_credit", "wallet_not_ready", "unavailable"}
    if not secret or mode not in modes:
        raise ValueError("Simulator requires a secret and a supported mode")
    app = FastAPI(title="Automated-test Credit double")

    @app.exception_handler(StubError)
    async def error_handler(request, error):
        return JSONResponse(
            status_code=error.status,
            content={"error": {"code": error.code, "message": "Local Credit simulation response."}},
        )

    def authorize(x_foc_service_secret: str = Header(default="")):
        if not hmac.compare_digest(x_foc_service_secret.encode(), secret.encode()):
            raise StubError(401, "UNAUTHENTICATED")
        if mode == "unavailable":
            raise StubError(503, "CREDIT_UNAVAILABLE")

    @app.get("/health/ready")
    def health():
        return {"simulation": True, "mode": mode}

    prefix = "/v1/internal/order-reservations/{order_id}"

    def contract(value):
        # Internal recipient evidence is not an extra field in the reservation HTTP contract.
        return {key: item for key, item in value.items() if key != "courierId"}

    @app.get(prefix, dependencies=[Depends(authorize)])
    def status(order_id: UUID):
        value = store.get(order_id)
        if not value:
            raise StubError(404, "NOT_FOUND")
        return contract(value)

    @app.put(prefix, dependencies=[Depends(authorize)])
    def reserve(order_id: UUID, request: Request):
        return contract(store.change(order_id, request, mode=mode))

    @app.put(prefix + "/creation-abort", dependencies=[Depends(authorize)])
    def abort(order_id: UUID, request: Request):
        return contract(store.change(order_id, request, abort=True))

    return app


