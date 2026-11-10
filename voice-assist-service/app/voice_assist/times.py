# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-11-02
# Scope: Implemented voice-draft time resolution, including weekdays, dates and AM/PM handling.
# Author review: I validated correctness, and added boundary checks.

"""Deterministic time resolution in Asia/Singapore (N3F2.1.3, N3F2.1.4).

The provider only reports what was said; this module decides what it means, so a vague or
unsupported phrase can never become an invented timestamp."""

import re
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.voice_assist.schemas import DraftField, TimePhrase

SGT = ZoneInfo("Asia/Singapore")
_CLOCK = re.compile(r"([01]?\d|2[0-3]):([0-5]\d)")
_DATE = re.compile(r"(\d{1,2})-(\d{1,2})")
WEEKDAYS = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
MAX_RELATIVE_MINUTES = 7 * 24 * 60
MAX_DAYS_AHEAD = 31


def _ceil_minute(value: datetime) -> datetime:
    # The form keeps minutes only; rounding up keeps "in 1 minute" in the future.
    floored = value.replace(second=0, microsecond=0)
    return floored if floored == value else floored + timedelta(minutes=1)


def display(value: datetime, now: datetime) -> str:
    local, today = value.astimezone(SGT), now.astimezone(SGT).date()
    if local.date() == today:
        day = "Today"
    elif local.date() == today + timedelta(days=1):
        day = "Tomorrow"
    else:
        day = local.strftime("%a %d %b")
    clock = local.strftime("%I:%M %p").lstrip("0")
    return f"{day}, {clock} SGT"


def _filled(value: datetime, now: datetime) -> DraftField:
    utc = value.astimezone(UTC)
    return DraftField(
        value=utc.isoformat().replace("+00:00", "Z"), status="FILLED", display=display(utc, now)
    )


def _calendar_date(text: str, today: date) -> date:
    match = _DATE.fullmatch(text.strip())
    if not match:
        raise ValueError("not MM-DD")
    month, day = int(match[1]), int(match[2])
    # A date without a year is its next occurrence; date() rejects days such as 30 Feb.
    said = date(today.year, month, day)
    if said < today:
        said = date(today.year + 1, month, day)
    if said > today + timedelta(days=MAX_DAYS_AHEAD):
        raise ValueError("too far ahead")
    return said


def _said_date(phrase: TimePhrase, today: date) -> date | None:
    """The Singapore date the requester named, or None when no day was said. Raises ValueError
    when the day cannot be pinned down or the words name different days."""
    if phrase.next_week and phrase.day not in WEEKDAYS:
        raise ValueError("'next' without a weekday")
    said = None if phrase.date is None else _calendar_date(phrase.date, today)
    if phrase.day in WEEKDAYS:
        weekday = WEEKDAYS.index(phrase.day)
        if said is not None:
            # "Saturday the 7th": the date decides, the weekday only has to agree with it.
            if said.weekday() != weekday:
                raise ValueError("weekday does not match the date")
        elif phrase.next_week:
            # "Next Friday" is the Friday of the following Monday-to-Sunday week.
            said = today + timedelta(days=7 - today.weekday() + weekday)
        else:
            said = today + timedelta(days=(weekday - today.weekday()) % 7)
    elif phrase.day is not None:
        named = today + timedelta(days=1 if phrase.day == "TOMORROW" else 0)
        if said not in (None, named):
            raise ValueError("today or tomorrow does not match the date")
        said = named
    return said


def _hours(clock: str, meridiem: str | None) -> tuple[list[int], int]:
    """The 24-hour readings of a clock time and its minute. A 1-12 hour said without AM or PM
    has two readings."""
    match = _CLOCK.fullmatch(clock.strip())
    if not match:
        raise ValueError("not HH:MM")
    hour, minute = int(match[1]), int(match[2])
    if 1 <= hour <= 12:
        if meridiem is None:
            return [hour % 12, hour % 12 + 12], minute
        return [hour % 12 + (12 if meridiem == "PM" else 0)], minute
    if meridiem is not None and meridiem != ("AM" if hour == 0 else "PM"):
        raise ValueError("24-hour time contradicts AM or PM")
    return [hour], minute


def resolve(phrase: TimePhrase | None, now: datetime, label: str) -> DraftField:
    """Resolve one spoken time against the draft-generation request time."""
    if phrase is None:
        return DraftField(status="MISSING", note=f"Enter the {label}.")
    unclear = DraftField(
        status="AMBIGUOUS", note=f"We could not tell the exact {label}. Enter it below."
    )
    if phrase.relative_minutes is not None:
        if phrase.day is not None or phrase.date is not None or phrase.clock is not None:
            return unclear
        if not 0 < phrase.relative_minutes <= MAX_RELATIVE_MINUTES:
            return unclear
        return _filled(_ceil_minute(now + timedelta(minutes=phrase.relative_minutes)), now)
    if phrase.clock is None:
        # A day alone such as "tomorrow", or an unsupported expression such as "after lunch".
        return unclear
    today = now.astimezone(SGT).date()
    try:
        said = _said_date(phrase, today)
        hours, minute = _hours(phrase.clock, phrase.meridiem)
    except ValueError:
        return unclear
    day = said or today
    readings = [datetime(day.year, day.month, day.day, hour, minute, tzinfo=SGT) for hour in hours]
    if len(readings) > 1 and day != today:
        return DraftField(
            status="AMBIGUOUS",
            note=f"We could not tell if the {label} is AM or PM. Enter it below.",
        )
    ahead = [value for value in readings if value > now]
    if ahead:
        # Without AM or PM, a time today is the next time that hour comes round.
        return _filled(min(ahead), now)
    if said is None:
        # A clock time without a day means today only while it is still ahead.
        return DraftField(
            status="AMBIGUOUS",
            note=f"That time has passed today. Enter the {label} with the right day.",
        )
    return DraftField(status="CONFLICT", note=f"That {label} has already passed.")
