# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-11-02
# Scope: Generated and refined Voice Assist regression tests and evaluation fixtures.
# Author review: I validated correctness, and added boundary checks.

"""N3F2.1.3 and N3F2.1.4: spoken times resolve in Asia/Singapore against the request time."""

from datetime import UTC, datetime

import pytest

from app.voice_assist.schemas import TimePhrase
from app.voice_assist.times import resolve

# Friday 30 Oct 2026, 13:20:30 in Singapore.
NOW = datetime(2026, 10, 30, 5, 20, 30, tzinfo=UTC)


def phrase(raw="x", day=None, clock=None, minutes=None, next_week=False, date=None, meridiem=None):
    return TimePhrase(
        raw=raw,
        day=day,
        next_week=next_week,
        date=date,
        clock=clock,
        meridiem=meridiem,
        relative_minutes=minutes,
    )


@pytest.mark.parametrize(
    ("spoken", "expected", "display"),
    [
        (phrase(day="TODAY", clock="15:00"), "2026-10-30T07:00:00Z", "Today, 3:00 PM SGT"),
        (
            phrase(day="TOMORROW", clock="09:30", meridiem="AM"),
            "2026-10-31T01:30:00Z",
            "Tomorrow, 9:30 AM SGT",
        ),
        (phrase(clock="15:00"), "2026-10-30T07:00:00Z", "Today, 3:00 PM SGT"),
        (phrase(clock="03:00", meridiem="PM"), "2026-10-30T07:00:00Z", "Today, 3:00 PM SGT"),
        (
            phrase(day="TOMORROW", clock="12:00", meridiem="PM"),
            "2026-10-31T04:00:00Z",
            "Tomorrow, 12:00 PM SGT",
        ),
        # Rounded up to the next minute so the form keeps it in the future.
        (phrase(minutes=20), "2026-10-30T05:41:00Z", "Today, 1:41 PM SGT"),
        (phrase(minutes=60), "2026-10-30T06:21:00Z", "Today, 2:21 PM SGT"),
        (phrase(minutes=30), "2026-10-30T05:51:00Z", "Today, 1:51 PM SGT"),
    ],
)
def test_supported_expressions_resolve(spoken, expected, display):
    field = resolve(spoken, NOW, "latest delivery time")
    assert (field.status, field.value, field.display) == ("FILLED", expected, display)


@pytest.mark.parametrize(
    ("spoken", "expected", "display"),
    [
        # A weekday is its next occurrence, today included.
        (
            phrase(day="MONDAY", clock="09:00", meridiem="AM"),
            "2026-11-02T01:00:00Z",
            "Mon 02 Nov, 9:00 AM SGT",
        ),
        (
            phrase(day="SATURDAY", clock="10:00", meridiem="AM"),
            "2026-10-31T02:00:00Z",
            "Tomorrow, 10:00 AM SGT",
        ),
        (
            phrase(day="FRIDAY", clock="05:00", meridiem="PM"),
            "2026-10-30T09:00:00Z",
            "Today, 5:00 PM SGT",
        ),
        # "Next" is the following Monday-to-Sunday week.
        (
            phrase(day="FRIDAY", next_week=True, clock="03:00", meridiem="PM"),
            "2026-11-06T07:00:00Z",
            "Fri 06 Nov, 3:00 PM SGT",
        ),
        (
            phrase(day="MONDAY", next_week=True, clock="09:00", meridiem="AM"),
            "2026-11-02T01:00:00Z",
            "Mon 02 Nov, 9:00 AM SGT",
        ),
        # "7th of November 11 p.m."
        (
            phrase(date="11-07", clock="11:00", meridiem="PM"),
            "2026-11-07T15:00:00Z",
            "Sat 07 Nov, 11:00 PM SGT",
        ),
        (
            phrase(day="SATURDAY", date="11-07", clock="23:00"),
            "2026-11-07T15:00:00Z",
            "Sat 07 Nov, 11:00 PM SGT",
        ),
    ],
)
def test_weekdays_and_dates_resolve(spoken, expected, display):
    field = resolve(spoken, NOW, "latest delivery time")
    assert (field.status, field.value, field.display) == ("FILLED", expected, display)


def test_a_date_without_a_year_rolls_into_next_year():
    new_year_eve = datetime(2026, 12, 30, 4, 0, tzinfo=UTC)
    field = resolve(phrase(date="01-02", clock="10:00", meridiem="AM"), new_year_eve, "time")
    assert (field.status, field.value) == ("FILLED", "2027-01-02T02:00:00Z")


@pytest.mark.parametrize(
    ("now", "clock", "expected"),
    [
        (NOW, "09:00", "2026-10-30T13:00:00Z"),  # 13:20: 9 AM has passed, so 9 PM
        (NOW, "02:00", "2026-10-30T06:00:00Z"),  # 2 PM
        (datetime(2026, 10, 30, 12, 0, tzinfo=UTC), "09:00", "2026-10-30T13:00:00Z"),  # 20:00
        (datetime(2026, 10, 29, 23, 0, tzinfo=UTC), "09:00", "2026-10-30T01:00:00Z"),  # 07:00
    ],
)
def test_an_hour_without_am_or_pm_today_is_the_next_one(now, clock, expected):
    for spoken in (phrase(clock=clock), phrase(day="TODAY", clock=clock)):
        field = resolve(spoken, now, "latest delivery time")
        assert (field.status, field.value) == ("FILLED", expected)


def test_minutes_cross_midnight_in_singapore_not_utc():
    late = datetime(2026, 10, 30, 15, 50, tzinfo=UTC)  # 23:50 SGT
    field = resolve(phrase(minutes=20), late, "latest delivery time")
    assert field.value == "2026-10-30T16:10:00Z"
    assert field.display == "Tomorrow, 12:10 AM SGT"


def test_tomorrow_uses_the_singapore_date():
    # 00:30 SGT on 31 Oct is still 30 Oct in UTC.
    early = datetime(2026, 10, 30, 16, 30, tzinfo=UTC)
    spoken = phrase(day="TOMORROW", clock="08:00", meridiem="AM")
    field = resolve(spoken, early, "latest delivery time")
    assert field.value == "2026-11-01T00:00:00Z"


def test_missing_phrase_is_missing():
    assert resolve(None, NOW, "latest acceptance time").status == "MISSING"


@pytest.mark.parametrize(
    "spoken",
    [
        phrase(day="TOMORROW"),  # a day without a time
        phrase(day="MONDAY"),
        phrase(date="11-07"),
        phrase(raw="after lunch"),  # unsupported expression
        phrase(clock="3pm"),  # not HH:MM
        phrase(clock="25:00"),
        phrase(minutes=0),
        phrase(minutes=-5),
        phrase(day="TODAY", minutes=10),  # mixed forms
        phrase(date="11-07", minutes=10),
        phrase(clock="10:00", meridiem="AM"),  # clock-only time already passed today
        phrase(clock="12:30"),  # 12:30 AM and PM have both passed
        phrase(clock="21:00", meridiem="AM"),  # contradicts itself
        phrase(day="TODAY", next_week=True, clock="15:00"),
        phrase(next_week=True, clock="15:00"),  # "next week at 3pm"
        phrase(date="02-30", clock="15:00"),
        phrase(date="7 Nov", clock="15:00"),
        phrase(date="10-29", clock="15:00"),  # next occurs a year away
        phrase(day="SUNDAY", date="11-07", clock="15:00"),  # 7 Nov is a Saturday
        phrase(day="TOMORROW", date="11-07", clock="15:00"),
    ],
)
def test_unclear_expressions_are_left_for_manual_entry(spoken):
    field = resolve(spoken, NOW, "latest delivery time")
    assert field.status == "AMBIGUOUS"
    assert field.value is None


@pytest.mark.parametrize(
    "spoken",
    [
        phrase(day="TOMORROW", clock="05:00"),
        phrase(day="MONDAY", clock="09:00"),
        phrase(date="11-07", clock="11:00"),
    ],
)
def test_an_hour_without_am_or_pm_on_a_later_day_is_unclear(spoken):
    field = resolve(spoken, NOW, "latest delivery time")
    assert (field.status, field.value) == ("AMBIGUOUS", None)
    assert "AM or PM" in field.note


@pytest.mark.parametrize(
    "spoken",
    [
        phrase(day="TODAY", clock="09:00", meridiem="AM"),
        phrase(day="FRIDAY", clock="09:00", meridiem="AM"),  # today is Friday
        phrase(date="10-30", clock="09:00", meridiem="AM"),
    ],
)
def test_past_time_with_a_day_is_a_conflict(spoken):
    field = resolve(spoken, NOW, "latest acceptance time")
    assert (field.status, field.value) == ("CONFLICT", None)
