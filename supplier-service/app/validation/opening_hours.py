# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29
# Scope: Writing implementation code — derive daily closing offsets under the existing contract and model constraint; reject partial-null schedules, invalid types, and timezone-bearing times.
# Author review: Not confirmed.
# Details: ../../ai/usage-log.md; ai-20260929-005

"""Daily wall-clock schedules in Asia/Singapore, without timezone conversion."""

from datetime import time

from app.validation.errors import DomainValidationError, ValidationIssue


def derive_offset(opening_time: time | None, closing_time: time | None) -> int | None:
    """Derive the closing day from a complete schedule (merge PATCH first).

    Equal times represent 24 hours; two nulls represent unknown hours.
    Invalid inputs raise shared issues rather than transport-specific errors.
    """
    if opening_time is None and closing_time is None:
        return None
    if opening_time is None or closing_time is None:
        raise DomainValidationError([ValidationIssue(
            ("opening_time", "closing_time"),
            "INCOMPLETE_SCHEDULE",
            "Set both opening and closing times, or clear both for unknown hours.",
        )])

    errors = []
    for field, value in (("opening_time", opening_time), ("closing_time", closing_time)):
        if not isinstance(value, time):
            errors.append(ValidationIssue(
                (field,), "INVALID_TIME", "Enter a datetime.time value."
            ))
        elif value.tzinfo is not None:
            errors.append(ValidationIssue(
                (field,), "TIMEZONE_NOT_ALLOWED", "Daily times must not contain a timezone."
            ))
    if errors:
        raise DomainValidationError(errors)
    return 1 if closing_time <= opening_time else 0
