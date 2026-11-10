# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
# 2026-11-10
# Scope: Generated test doubles for identity, Order and dispute storage; extended them for
# reports, statements and disputed errands.
# Author review: I validated correctness and supplied additional boundary checks.

"""Test doubles shared by ASGI tests. They never touch a real database or User Service."""

from datetime import UTC, datetime
from uuid import uuid4

from app.admin.disputes import (
    FINAL_STATUSES,
    DecisionIncomplete,
    DisputeNotFound,
    VersionConflict,
    WithdrawalNotAllowed,
    check_transition,
)
from app.admin.schemas import Principal

NOW = datetime(2026, 10, 28, 4, 0, tzinfo=UTC)


class NoDatabase:
    async def ping(self):
        return False

    async def dispose(self):
        pass

    def session_context(self):
        raise AssertionError("this test must not open database sessions")


class FakeIdentity:
    """Stands in for User's GET /v1/users/me; records the forwarded tokens."""

    def __init__(self, role="ADMIN", error=None):
        self.role = role
        self.error = error
        self.tokens = []
        self.user_id = uuid4()

    async def identity(self, token):
        self.tokens.append(token)
        if self.error is not None:
            raise self.error
        return Principal(user_id=self.user_id, system_role=self.role, account_status="ACTIVE")


class FakeOrders:
    """Stands in for Order: the errand views and the internal dispute routes."""

    def __init__(self, known=True, error=None, participation=("REQUESTER", "DELIVERED")):
        self.known = known
        self.error = error
        self.participant = participation
        self.calls = []

    async def exists(self, order_id, token):
        self.calls.append(("exists", order_id, token))
        if self.error is not None:
            raise self.error
        return self.known

    async def participation(self, order_id, token, user_id):
        self.calls.append(("participation", order_id, token, user_id))
        return self.participant

    async def open_dispute(self, order_id, dispute_id, actor_type, token):
        self.calls.append(("open", order_id, dispute_id, actor_type, token))
        if self.error is not None:
            raise self.error

    async def restore(self, order_id, dispute_id, actor_type, token):
        self.calls.append(("restore", order_id, dispute_id, actor_type, token))
        if self.error is not None:
            raise self.error

    async def accept(self, order_id, dispute_id, problem, details, token):
        self.calls.append(("accept", order_id, dispute_id, problem, details, token))
        if self.error is not None:
            raise self.error

    def changes(self):
        return [call for call in self.calls if call[0] in ("open", "restore", "accept")]


def dispute_row(**overrides):
    row = {
        "id": uuid4(),
        "order_id": uuid4(),
        "problem": "ITEM_DAMAGED",
        "problem_details": None,
        "legacy_record": False,
        "description": None,
        "evidence_refs": [],
        "status": "OPEN",
        "resolution_reason": None,
        "reporter_role": "REQUESTER",
        "created_by": uuid4(),
        "request_hash": "hash",
        "created_at": NOW,
        "updated_at": NOW,
        "version": 1,
    }
    return {**row, **overrides}


def statement_row(dispute_id, author, body="The courier never replied.", role="REQUESTER"):
    return {
        "id": uuid4(),
        "dispute_id": dispute_id,
        "author_id": author,
        "author_role": role,
        "body": body,
        "created_at": NOW,
    }


class FakeDisputes:
    """Mirrors the repository's rules in memory; integration tests cover the SQL itself."""

    def __init__(self):
        self.calls = []
        self.rejections = []
        self.error = None
        self.audit_error = None
        self.existing = None
        self.created = True
        self.row = None
        self.events = []
        self.statements = []
        self.page = ([], 0)
        self.audit = ([], 0)
        # Fails the write after Order applied the change, like a lost database connection.
        self.fail_after_apply = False

    async def by_key(self, creator, key):
        self.calls.append(("by_key", creator, key))
        return self.existing

    async def create(self, **values):
        self.calls.append(("create", values))
        if self.error is not None:
            raise self.error
        self.row = dispute_row(
            id=values["dispute_id"],
            order_id=values["order_id"],
            problem=values["problem"],
            problem_details=values["problem_details"],
            description=values["description"],
            evidence_refs=values["evidence_refs"],
            reporter_role=values["role"],
            created_by=values["actor"],
        )
        self.events = [
            {
                "sequence": 1,
                "from_status": None,
                "to_status": "OPEN",
                "actor_id": values["actor"],
                "reason": None,
                "occurred_at": NOW,
            }
        ]
        return self.row["id"], self.created

    async def transition(self, dispute_id, *, apply=None, reporter=None, **values):
        self.calls.append(("transition", dispute_id, {**values, "reporter": reporter}))
        if self.error is not None:
            raise self.error
        if self.row is None or self.row["id"] != dispute_id:
            raise DisputeNotFound()
        if reporter is not None and (
            self.row["reporter_role"] is None or self.row["created_by"] != reporter
        ):
            raise DisputeNotFound()
        if self.row["version"] != values["expected_version"]:
            raise VersionConflict()
        if reporter is not None and (self.row["status"] != "OPEN" or self.row["legacy_record"]):
            raise WithdrawalNotAllowed()
        check_transition(self.row["status"], values["to_status"], values["reason"])
        if apply is not None and not self.row["legacy_record"]:
            await apply(dict(self.row))
            if self.fail_after_apply:
                raise DecisionIncomplete()
        self.row = {
            **self.row,
            "status": values["to_status"],
            "resolution_reason": (
                values["reason"] if values["to_status"] in FINAL_STATUSES else None
            ),
            "version": self.row["version"] + 1,
        }

    async def add_statement(self, **values):
        self.calls.append(("add_statement", values))
        if self.error is not None:
            raise self.error
        statement = statement_row(
            values["dispute_id"], values["author"], values["body"], values["role"]
        )
        self.statements.append(statement)
        return statement["id"], self.created

    async def statements_by(self, dispute_ids, author):
        self.calls.append(("statements_by", list(dispute_ids), author))
        wanted = set(dispute_ids)
        return [
            s for s in self.statements if s["dispute_id"] in wanted and s["author_id"] == author
        ]

    async def reports_for(self, reporter, **filters):
        self.calls.append(("reports_for", reporter, filters))
        return self.page

    async def reports_about(self, order_id, **filters):
        self.calls.append(("reports_about", order_id, filters))
        return self.page

    async def record_rejection(self, **values):
        if self.audit_error is not None:
            raise self.audit_error
        self.rejections.append(values)

    async def dispute(self, dispute_id):
        if self.row is None or self.row["id"] != dispute_id:
            return None, [], []
        return self.row, self.events, self.statements

    async def disputes_page(self, **filters):
        self.calls.append(("disputes_page", filters))
        return self.page

    async def audit_page(self, **filters):
        self.calls.append(("audit_page", filters))
        return self.audit
