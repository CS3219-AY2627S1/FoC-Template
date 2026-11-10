# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Implemented administrator errand analytics calculations.
# Author review: I validated correctness and supplied additional boundary checks.

"""Administrator errand analytics computed on request from Order's own records (N2F4)."""

from collections import Counter
from datetime import date, datetime, time, timedelta, timezone

STATES = (
    "OPEN",
    "ACCEPTED",
    "PICKED_UP",
    "DELIVERED",
    "DISPUTED",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
)
RATE_STATES = {
    "completed": "COMPLETED",
    "cancelled": "CANCELLED",
    "expired": "EXPIRED",
    "failed": "FAILED",
}
# Singapore has used UTC+8 without daylight saving since 1982. A fixed offset avoids depending
# on an IANA time-zone database in slim images and on Windows.
SINGAPORE = timezone(timedelta(hours=8), "Asia/Singapore")


def period_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """Half-open instant range covering whole Singapore calendar days from start to end."""
    return (
        datetime.combine(start, time.min, SINGAPORE),
        datetime.combine(end + timedelta(days=1), time.min, SINGAPORE),
    )


def by_state(rows) -> dict[str, int]:
    counts = Counter(row["state"] for row in rows)
    return {state: counts.get(state, 0) for state in STATES}


def mean_completion_minutes(rows) -> float | None:
    durations = [
        (row["completed_at"] - row["created_at"]).total_seconds() / 60
        for row in rows
        if row["state"] == "COMPLETED" and row["completed_at"] is not None
    ]
    return round(sum(durations) / len(durations), 1) if durations else None


def summarize(rows, start: date, end: date) -> dict:
    """Rows are the errands created in the period; rates are N/A (None) without any."""
    total = len(rows)
    states = by_state(rows)
    created_per_day = Counter(row["created_at"].astimezone(SINGAPORE).date() for row in rows)
    requesters = {row["requester_id"] for row in rows}
    couriers = {row["courier_id"] for row in rows if row["courier_id"] is not None}
    suppliers: dict = {}
    for row in sorted(rows, key=lambda row: row["created_at"]):
        group = suppliers.setdefault(row["supplier_id"], {"rows": []})
        group["rows"].append(row)
        group["name"] = row["supplier_name"]  # the latest snapshot labels the supplier
    return {
        "totalCreated": total,
        "byState": states,
        "rates": {
            key: None if total == 0 else round(states[state] / total, 4)
            for key, state in RATE_STATES.items()
        },
        "daily": [
            {"day": day, "created": created_per_day.get(day, 0)}
            for day in (start + timedelta(days=offset) for offset in range((end - start).days + 1))
        ],
        "participants": {
            "requesters": len(requesters),
            "couriers": len(couriers),
            "distinctParticipants": len(requesters | couriers),
        },
        "meanCompletionMinutes": mean_completion_minutes(rows),
        "suppliers": sorted(
            (
                {
                    "supplierId": supplier_id,
                    "supplierName": group["name"],
                    "created": len(group["rows"]),
                    "completed": sum(row["state"] == "COMPLETED" for row in group["rows"]),
                    "meanCompletionMinutes": mean_completion_minutes(group["rows"]),
                }
                for supplier_id, group in suppliers.items()
            ),
            key=lambda item: (-item["created"], item["supplierName"], str(item["supplierId"])),
        ),
    }


def summarize_user(rows, user_id) -> dict:
    """Separate a user's errands by participation role (N2F4.3)."""
    requested = [row for row in rows if row["requester_id"] == user_id]
    couriered = [row for row in rows if row["courier_id"] == user_id]
    return {
        "asRequester": {"total": len(requested), "byState": by_state(requested)},
        "asCourier": {"total": len(couriered), "byState": by_state(couriered)},
    }
