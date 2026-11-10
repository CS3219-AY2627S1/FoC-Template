# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
# 2026-11-10
# Scope: Implemented dispute, report, status-change and audit-log API models; added the
# disputed-errand problem, statement and withdrawal models.
# Author review: I validated correctness and supplied additional boundary checks.

"""Versioned API models. JSON uses camelCase; Python uses snake_case."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel


class Principal(BaseModel):
    # User's additional profile fields are deliberately ignored, never persisted.
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore", populate_by_name=True)
    user_id: UUID
    system_role: Literal["USER", "ADMIN", "SUPER_ADMIN"]
    account_status: Literal["ACTIVE"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="forbid", populate_by_name=True)


# RESOLVED appears only on legacy disputes decided before disputed errands.
DisputeStatus = Literal["OPEN", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN", "RESOLVED"]
# The problem a reporter selects; an accepted dispute fails the errand with it (N2F3).
Problem = Literal[
    "ITEM_UNAVAILABLE",
    "ITEM_DAMAGED",
    "UNABLE_TO_PICK_UP",
    "UNABLE_TO_DELIVER",
    "PARTICIPANT_UNREACHABLE",
    "OTHER",
]
ReporterRole = Literal["REQUESTER", "COURIER"]
EvidenceRef = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


def trimmed(value):
    return value.strip() if isinstance(value, str) else value


class ProblemChoice(ApiModel):
    problem: Problem
    # Shown to both participants as "Other: ..."; required only for Other.
    problem_details: str | None = Field(default=None, min_length=1, max_length=500)

    @field_validator("problem_details", mode="before")
    @classmethod
    def blank_details_are_missing(cls, value):
        return trimmed(value) or None

    @model_validator(mode="after")
    def explain_other(self):
        if self.problem == "OTHER" and self.problem_details is None:
            raise ValueError("Explain the problem when selecting Other")
        return self


class CreateDispute(ProblemChoice):
    order_id: UUID
    # Administrators' private case notes and evidence references (N2F3.2.1).
    description: str = Field(min_length=1, max_length=2000)
    evidence_refs: list[EvidenceRef] = Field(default_factory=list, max_length=10)

    @field_validator("description", mode="before")
    @classmethod
    def trim_description(cls, value):
        return trimmed(value)


class ReportProblem(ProblemChoice):
    order_id: UUID


ClosingReason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class Transition(ApiModel):
    # WITHDRAWN belongs to the reporter (POST /v1/disputes/{id}/withdraw), never to admins.
    to_status: Literal["UNDER_REVIEW", "ACCEPTED", "REJECTED"]
    reason: ClosingReason | None = None
    expected_version: StrictInt = Field(ge=1)

    @field_validator("reason", mode="after")
    @classmethod
    def blank_reason_is_missing(cls, value):
        return value or None


class Withdrawal(ApiModel):
    reason: str = Field(min_length=1, max_length=1000)
    expected_version: StrictInt = Field(ge=1)

    @field_validator("reason", mode="before")
    @classmethod
    def trim_reason(cls, value):
        return trimmed(value)


class AddStatement(ApiModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body", mode="before")
    @classmethod
    def trim_body(cls, value):
        return trimmed(value)


class PageQuery(ApiModel):
    page: int = Field(default=1, ge=1, le=1_000_000)
    page_size: int = Field(default=20, ge=1, le=50)


class DisputeQuery(PageQuery):
    status: DisputeStatus | None = None
    order_id: UUID | None = None


class AuditQuery(PageQuery):
    actor_id: UUID | None = None
    target_id: UUID | None = None
    outcome: Literal["SUCCESS", "REJECTED"] | None = None


class HistoryEntry(ApiModel):
    sequence: int
    from_status: DisputeStatus | None
    to_status: DisputeStatus
    actor_id: UUID
    reason: str | None
    occurred_at: datetime


class OwnStatement(ApiModel):
    statement_id: UUID
    body: str
    created_at: datetime


class Statement(OwnStatement):
    author_id: UUID
    author_role: ReporterRole


class ReportQuery(PageQuery):
    order_id: UUID | None = None


class ReportView(ApiModel):
    # What an errand participant may see: the problem, status and reasons, and only their own
    # statements. Administrator identities, notes, evidence and history are never included.
    dispute_id: UUID
    order_id: UUID
    own_report: bool
    # None when an administrator raised the dispute.
    reporter_role: ReporterRole | None
    # None only on legacy disputes recorded before a problem had to be selected.
    problem: Problem | None
    problem_details: str | None
    # A legacy dispute never held its errand; deciding it changes no errand.
    legacy: bool = False
    status: DisputeStatus
    resolution_reason: str | None
    statements: list[OwnStatement]
    created_at: datetime
    updated_at: datetime
    version: int


class DisputeSummary(ApiModel):
    dispute_id: UUID
    order_id: UUID
    # None only on legacy disputes recorded before a problem had to be selected.
    problem: Problem | None
    problem_details: str | None
    # A legacy dispute never held its errand; deciding it changes no errand.
    legacy: bool = False
    # Administrator case notes; None for new participant reports.
    description: str | None
    status: DisputeStatus
    resolution_reason: str | None
    # None when an administrator recorded the dispute; created_by is then that administrator.
    reporter_role: ReporterRole | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    version: int


class DisputeView(DisputeSummary):
    evidence_refs: list[str]
    history: list[HistoryEntry]
    statements: list[Statement]


AuditAction = Literal[
    "DISPUTE_CREATE",
    "DISPUTE_REPORT",
    "DISPUTE_TRANSITION",
    "DISPUTE_WITHDRAW",
    "DISPUTE_STATEMENT",
    "ERRAND_DECISION",
]


class AuditEntry(ApiModel):
    audit_id: UUID
    actor_id: UUID
    action: AuditAction
    target_type: Literal["DISPUTE", "ORDER"]
    target_id: UUID
    outcome: Literal["SUCCESS", "REJECTED"]
    error_code: str | None
    correlation_id: str
    occurred_at: datetime


class Page[T](ApiModel):
    items: list[T]
    page: int
    page_size: int
    total: int
