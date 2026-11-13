# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29
# Scope: Writing implementation code — write unit tests for the specified boundaries, invalid coordinates, daily schedules, stable error codes and envelope, exact areas, precision, and operation without third-party packages.
# Author review: Not confirmed.
# Details: ../../ai/usage-log.md; ai-20260929-005

import json
import subprocess
import sys
from datetime import time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.validation import (
    APPROVED_AREAS,
    DomainValidationError,
    ValidationIssue,
    derive_offset,
    validate_coordinates,
)


def test_approved_areas():
    assert APPROVED_AREAS == (
        "Engineering", "FASS", "SoC", "BIZ", "PGP", "Science",
        "USC/UHC", "UTown", "YIH", "YST", "KR/NUH",
    )


@pytest.mark.parametrize("latitude", [-90, 0, 90, "-90", "90"])
@pytest.mark.parametrize("longitude", [-180, 0, 180, "-180", "180"])
def test_coordinate_boundaries(latitude, longitude):
    assert validate_coordinates(latitude, longitude) == (
        Decimal(str(latitude)), Decimal(str(longitude)),
    )


@pytest.mark.parametrize("value", [
    1.296123456789, "1.29612345678901234567890123456789012345",
    Decimal("1.29612345678901234567890123456789012345"), "1.296e0",
])
def test_coordinates_are_not_rounded(value):
    expected = Decimal(str(value))
    assert validate_coordinates(value, value) == (expected, expected)


@pytest.mark.parametrize("field", ["latitude", "longitude"])
@pytest.mark.parametrize("value", [
    True, False, None, "", " ", "not a number", [], {}, object(), 1 + 2j,
    float("nan"), float("inf"), float("-inf"),
    "NaN", "Infinity", "-Infinity", Decimal("NaN"), Decimal("sNaN"),
    Decimal("Infinity"), Decimal("-Infinity"),
])
def test_invalid_coordinates(field, value):
    values = {"latitude": 0, "longitude": 0, field: value}
    with pytest.raises(DomainValidationError) as caught:
        validate_coordinates(**values)
    assert len(caught.value.errors) == 1
    issue = caught.value.errors[0]
    assert issue.fields == (f"location.{field}",)
    assert issue.code == "INVALID_COORDINATE"


@pytest.mark.parametrize(("field", "value"), [
    ("latitude", "90.000000000000000000000000000001"),
    ("latitude", "-90.000000000000000000000000000001"),
    ("longitude", "180.000000000000000000000000000001"),
    ("longitude", "-180.000000000000000000000000000001"),
    ("latitude", 91), ("longitude", -181),
])
def test_coordinates_out_of_range(field, value):
    with pytest.raises(DomainValidationError) as caught:
        validate_coordinates(**{"latitude": 0, "longitude": 0, field: value})
    assert len(caught.value.errors) == 1
    assert caught.value.errors[0].fields == (f"location.{field}",)
    assert caught.value.errors[0].code == "COORDINATE_OUT_OF_RANGE"


def test_coordinate_errors_are_collected():
    with pytest.raises(DomainValidationError) as caught:
        validate_coordinates(None, 181)
    assert [(issue.fields, issue.code) for issue in caught.value.errors] == [
        (("location.latitude",), "INVALID_COORDINATE"),
        (("location.longitude",), "COORDINATE_OUT_OF_RANGE"),
    ]


@pytest.mark.parametrize(("opens", "closes", "offset"), [
    (time(10), time(19, 30), 0),
    (time(18), time(2), 1),
    (time(0), time(0), 1),
    (time(10), time(10), 1),
    (None, None, None),
    (time(0), time(23, 59), 0),
    (time(10), time(10, microsecond=1), 0),
    (time(10, microsecond=1), time(10), 1),
])
def test_daily_schedule(opens, closes, offset):
    assert derive_offset(opens, closes) == offset


@pytest.mark.parametrize(("opens", "closes"), [(None, time(19)), (time(10), None)])
def test_incomplete_schedule_envelope(opens, closes):
    with pytest.raises(DomainValidationError) as caught:
        derive_offset(opens, closes)
    assert caught.value.to_dict() == {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Some fields are invalid.",
            "details": [{
                "fields": ["opening_time", "closing_time"],
                "code": "INCOMPLETE_SCHEDULE",
                "message": "Set both opening and closing times, or clear both for unknown hours.",
            }],
        },
    }


@pytest.mark.parametrize("tz", [
    timezone.utc, timezone(timedelta(hours=8)), ZoneInfo("Asia/Singapore"),
])
@pytest.mark.parametrize("field", ["opening_time", "closing_time"])
def test_timezone_rejected(field, tz):
    values = {"opening_time": time(10), "closing_time": time(19)}
    values[field] = values[field].replace(tzinfo=tz)
    with pytest.raises(DomainValidationError) as caught:
        derive_offset(**values)
    assert len(caught.value.errors) == 1
    assert caught.value.errors[0].fields == (field,)
    assert caught.value.errors[0].code == "TIMEZONE_NOT_ALLOWED"


def test_both_timezone_issues_are_collected():
    with pytest.raises(DomainValidationError) as caught:
        derive_offset(time(10, tzinfo=timezone.utc), time(19, tzinfo=timezone.utc))
    assert [(issue.fields, issue.code) for issue in caught.value.errors] == [
        (("opening_time",), "TIMEZONE_NOT_ALLOWED"),
        (("closing_time",), "TIMEZONE_NOT_ALLOWED"),
    ]


def test_invalid_time_types():
    with pytest.raises(DomainValidationError) as caught:
        derive_offset("10:00", False)
    assert [(issue.fields, issue.code) for issue in caught.value.errors] == [
        (("opening_time",), "INVALID_TIME"),
        (("closing_time",), "INVALID_TIME"),
    ]


def test_shared_exception_serializes_multiple_issues():
    issues = [
        ValidationIssue(("location.latitude",), "INVALID_COORDINATE", "Invalid latitude."),
        ValidationIssue(("opening_time", "closing_time"), "INCOMPLETE_SCHEDULE", "Set both."),
    ]
    error = DomainValidationError(iter(issues))
    assert json.loads(json.dumps(error.to_dict())) == {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Some fields are invalid.",
            "details": [issue.to_dict() for issue in issues],
        },
    }


def test_validators_work_without_third_party_packages():
    # -S excludes site-packages, including SQLAlchemy and FastAPI.
    result = subprocess.run(
        [sys.executable, "-S", "-c", (
            "from app.validation import validate_coordinates, derive_offset; "
            "assert validate_coordinates('90', '-180') == (90, -180); "
            "assert derive_offset(None, None) is None"
        )],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
