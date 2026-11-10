# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
# 2026-11-10
# Scope: Implemented dispute workflow rules, request fingerprints and safe rejections; added
# participant report errors and the disputed-errand workflow.
# Author review: I validated correctness and supplied additional boundary checks.

"""Dispute workflow rules (N2F3.3) and safe rejections. Messages never echo input."""

import hashlib
import json
from uuid import NAMESPACE_URL, UUID, uuid5

from app.admin.errors import ApiError

# N2F3.3: an administrator reviews an open dispute, then accepts or rejects it. The reporter may
# withdraw it only while it is still OPEN.
TRANSITIONS = {
    "OPEN": ("UNDER_REVIEW", "WITHDRAWN"),
    "UNDER_REVIEW": ("ACCEPTED", "REJECTED"),
}
FINAL_STATUSES = ("ACCEPTED", "REJECTED", "WITHDRAWN")
OPEN_STATUSES = ("OPEN", "UNDER_REVIEW")
# Dispute IDs derive from the creator and request key, so a retry after Order already held the
# errand reuses the same dispute and completes it (Order treats the repeat as a replay).
DISPUTE_NAMESPACE = uuid5(NAMESPACE_URL, "https://foc.example/admin-service/disputes")


def dispute_id_for(creator: UUID, key: UUID) -> UUID:
    return uuid5(DISPUTE_NAMESPACE, f"{creator}:{key}")


class ReportNotAllowed(ApiError):
    def __init__(self):
        super().__init__(
            409,
            "REPORT_NOT_ALLOWED",
            "Problems can be reported while a courier is working on the errand.",
        )


class DisputeAlreadyOpen(ApiError):
    def __init__(self):
        super().__init__(
            409, "DISPUTE_ALREADY_OPEN", "A problem with this errand is already being reviewed."
        )


class DisputeNotFound(ApiError):
    def __init__(self):
        super().__init__(404, "DISPUTE_NOT_FOUND", "The dispute does not exist.")


class OrderNotFound(ApiError):
    def __init__(self):
        super().__init__(422, "ORDER_NOT_FOUND", "The errand does not exist.")


class ErrandChanged(ApiError):
    def __init__(self):
        super().__init__(
            409,
            "ERRAND_CHANGED",
            "The errand no longer matches this dispute. Refresh and review it again.",
        )


class DecisionIncomplete(ApiError):
    def __init__(self):
        super().__init__(
            409,
            "DECISION_INCOMPLETE",
            "The errand was updated, but the dispute was not. Repeat the same action to finish.",
        )


class WithdrawalNotAllowed(ApiError):
    def __init__(self):
        super().__init__(
            409,
            "WITHDRAWAL_NOT_ALLOWED",
            "Only the reporter can withdraw, and only before an administrator starts reviewing. "
            "Send any update to the administrator instead.",
        )


class DisputeClosed(ApiError):
    def __init__(self):
        super().__init__(
            409, "DISPUTE_CLOSED", "This dispute is closed, so it no longer accepts details."
        )


class InvalidTransition(ApiError):
    def __init__(self):
        super().__init__(
            409, "INVALID_TRANSITION", "This status change is not allowed from the current status."
        )


class ReasonRequired(ApiError):
    def __init__(self):
        super().__init__(
            422, "REASON_REQUIRED", "Give a reason to accept, reject or withdraw a dispute."
        )


class VersionConflict(ApiError):
    def __init__(self):
        super().__init__(
            409,
            "VERSION_CONFLICT",
            "This dispute was changed by someone else. Refresh and review it before retrying.",
        )


class IdempotencyKeyReused(ApiError):
    def __init__(self):
        super().__init__(
            409, "IDEMPOTENCY_KEY_REUSED", "This request key was already used for another request."
        )


def check_transition(current: str, target: str, reason: str | None) -> None:
    """OPEN -> UNDER_REVIEW | WITHDRAWN; UNDER_REVIEW -> ACCEPTED | REJECTED.

    Closing a dispute in any way needs a non-blank reason.
    """
    if target not in TRANSITIONS.get(current, ()):
        raise InvalidTransition()
    if target in FINAL_STATUSES and not reason:
        raise ReasonRequired()


def request_fingerprint(*parts) -> str:
    """Detects a reused idempotency key carrying a different request (N2NFR3.3)."""
    canonical = json.dumps(
        [str(part) if isinstance(part, UUID) else part for part in parts],
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()
