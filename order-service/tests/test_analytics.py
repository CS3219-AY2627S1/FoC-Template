# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Added tests for administrator analytics formulas.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F4 analytics formulas over errands created in a Singapore-day period."""

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from app.orders.analytics import period_bounds, summarize, summarize_user

DAY = date(2026, 10, 20)
NOON = datetime(2026, 10, 20, 4, 0, tzinfo=UTC)  # 12:00 in Singapore


def row(state="OPEN", *, created_at=NOON, requester=None, courier=None, supplier=None,
        supplier_name="Campus Cafe", completed_at=None):
    return {
        "id": uuid4(),
        "requester_id": requester or uuid4(),
        "courier_id": courier,
        "supplier_id": supplier or uuid4(),
        "supplier_name": supplier_name,
        "state": state,
        "created_at": created_at,
        "completed_at": completed_at,
    }


def test_period_bounds_cover_whole_singapore_days():
    start, end = period_bounds(date(2026, 10, 28), date(2026, 10, 29))
    assert start == datetime(2026, 10, 27, 16, 0, tzinfo=UTC)
    assert end == datetime(2026, 10, 29, 16, 0, tzinfo=UTC)


def test_empty_period_reports_not_available_rates_and_zero_days():
    result = summarize([], DAY, DAY + timedelta(days=2))
    assert result["totalCreated"] == 0
    assert set(result["rates"].values()) == {None}
    assert [day["created"] for day in result["daily"]] == [0, 0, 0]
    assert result["meanCompletionMinutes"] is None
    assert result["suppliers"] == []


def test_rates_divide_current_states_by_errands_created_in_the_period():
    rows = [row("COMPLETED"), row("COMPLETED"), row("FAILED"), row("OPEN")]
    result = summarize(rows, DAY, DAY)
    assert result["byState"]["COMPLETED"] == 2 and result["byState"]["PICKED_UP"] == 0
    assert result["rates"] == {"completed": 0.5, "cancelled": 0.0, "expired": 0.0, "failed": 0.25}


def test_user_in_both_roles_counts_once_in_combined_participants():
    person = uuid4()
    rows = [row(requester=person, courier=uuid4()), row(requester=uuid4(), courier=person)]
    assert summarize(rows, DAY, DAY)["participants"] == {
        "requesters": 2,
        "couriers": 2,
        "distinctParticipants": 3,
    }


def test_daily_counts_use_singapore_dates():
    rows = [
        row(created_at=datetime(2026, 10, 27, 15, 30, tzinfo=UTC)),  # 23:30 on 27 Oct SGT
        row(created_at=datetime(2026, 10, 27, 16, 30, tzinfo=UTC)),  # 00:30 on 28 Oct SGT
    ]
    assert summarize(rows, date(2026, 10, 27), date(2026, 10, 28))["daily"] == [
        {"day": date(2026, 10, 27), "created": 1},
        {"day": date(2026, 10, 28), "created": 1},
    ]


def test_supplier_activity_and_mean_completion_time():
    cafe, deli = uuid4(), uuid4()
    rows = [
        row("COMPLETED", supplier=cafe, completed_at=NOON + timedelta(minutes=30)),
        row("COMPLETED", supplier=cafe, completed_at=NOON + timedelta(minutes=90)),
        row("OPEN", supplier=cafe),
        row("CANCELLED", supplier=deli, supplier_name="Deli"),
    ]
    result = summarize(rows, DAY, DAY)
    assert result["meanCompletionMinutes"] == 60.0
    assert result["suppliers"] == [
        {"supplierId": cafe, "supplierName": "Campus Cafe", "created": 3, "completed": 2,
         "meanCompletionMinutes": 60.0},
        {"supplierId": deli, "supplierName": "Deli", "created": 1, "completed": 0,
         "meanCompletionMinutes": None},
    ]


def test_supplier_label_uses_the_latest_snapshot_name():
    supplier = uuid4()
    rows = [
        row(supplier=supplier, supplier_name="New Name", created_at=NOON + timedelta(hours=1)),
        row(supplier=supplier, supplier_name="Old Name", created_at=NOON),
    ]
    assert summarize(rows, DAY, DAY)["suppliers"][0]["supplierName"] == "New Name"


def test_user_activity_is_split_by_participation_role():
    person = uuid4()
    rows = [
        row("COMPLETED", requester=person),
        row("FAILED", requester=person),
        row("COMPLETED", courier=person),
    ]
    activity = summarize_user(rows, person)
    assert activity["asRequester"]["total"] == 2
    assert activity["asRequester"]["byState"]["FAILED"] == 1
    assert activity["asCourier"]["total"] == 1
    assert activity["asCourier"]["byState"]["COMPLETED"] == 1
