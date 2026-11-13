# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — test the specified shared seed scalar rules, precision, schedule derivation, forbidden fields, and independent error aggregation without category placeholders.
# Author review: All affected work reviewed by Keith.
# Details: ../../ai/usage-log.md; ai-20260930-006

"""Seed scalar validation without category placeholders or persistence."""

from copy import deepcopy
from datetime import time, timezone
from decimal import Decimal

import pytest

from app.schemas import LocationInput, SupplierSeedInput, SupplierSeedResult
from app.validation.errors import DomainValidationError
from app.validation.suppliers import validate_supplier_seed_values


@pytest.fixture
def data():
    return {
        "name": " Campus Café ", "area": " Science ",
        "location": {"latitude": "1.29612345678901234567890123456789", "longitude": "103.77"},
    }


def issues(data):
    with pytest.raises(DomainValidationError) as caught:
        validate_supplier_seed_values(data)
    return [(issue.fields, issue.code) for issue in caught.value.errors]


def test_clean_result_and_input_preservation(data):
    before = deepcopy(data)
    result = validate_supplier_seed_values(data)
    assert isinstance(result, SupplierSeedResult)
    assert isinstance(result.location, LocationInput)
    assert result.name == "Campus Café" and result.area == "Science"
    assert result.location.latitude == Decimal(data["location"]["latitude"])
    assert result.location.longitude == Decimal("103.77")
    assert result.closing_day_offset is None
    assert result.opening_time is result.closing_time is None
    assert set(result.model_dump()) == {
        "name", "area", "description", "building", "floor", "image_key",
        "location", "opening_time", "closing_time", "closing_day_offset",
    }
    assert data == before
    assert validate_supplier_seed_values(SupplierSeedInput(**data)) == result


@pytest.mark.parametrize("field", ["description", "building", "floor", "image_key"])
@pytest.mark.parametrize(("value", "expected"), [(None, None), (" \t ", None), ("  value ", "value")])
def test_optional_text(data, field, value, expected):
    data[field] = value
    assert getattr(validate_supplier_seed_values(data), field) == expected


@pytest.mark.parametrize("field", ["name", "area"])
@pytest.mark.parametrize(("value", "code"), [(" \t", "BLANK_TEXT"), (None, "INVALID_TEXT"), (7, "INVALID_TEXT")])
def test_required_text(data, field, value, code):
    data[field] = value
    assert issues(data) == [((field,), code)]


@pytest.mark.parametrize("field", ["name", "area", "location"])
def test_missing_required_fields(data, field):
    del data[field]
    assert issues(data) == [((field,), "REQUIRED_FIELD")]


@pytest.mark.parametrize("area", ["science", "Sci", "USC", "NUH"])
def test_approved_spelling(data, area):
    data["area"] = area
    assert issues(data) == [(("area",), "UNKNOWN_AREA")]


@pytest.mark.parametrize("latitude", [-90, 90])
@pytest.mark.parametrize("longitude", [-180, 180])
def test_inclusive_bounds(data, latitude, longitude):
    data["location"] = {"latitude": latitude, "longitude": longitude}
    result = validate_supplier_seed_values(data)
    assert result.location.latitude == latitude
    assert result.location.longitude == longitude


@pytest.mark.parametrize(("field", "value", "code"), [
    ("latitude", "90.00000000000000001", "COORDINATE_OUT_OF_RANGE"),
    ("longitude", "-180.000000000000001", "COORDINATE_OUT_OF_RANGE"),
    ("latitude", "NaN", "INVALID_COORDINATE"),
    ("longitude", float("inf"), "INVALID_COORDINATE"),
    ("latitude", True, "INVALID_COORDINATE"),
])
def test_invalid_coordinates(data, field, value, code):
    data["location"][field] = value
    assert issues(data) == [((f"location.{field}",), code)]


@pytest.mark.parametrize(("opening", "closing", "offset"), [
    (None, None, None), ("09:00", "18:00", 0), ("18:00", "02:00", 1),
    ("00:00", "00:00", 1), (time(9), time(9), 1),
])
def test_schedule_rules(data, opening, closing, offset):
    data.update(opening_time=opening, closing_time=closing)
    assert validate_supplier_seed_values(data).closing_day_offset == offset


@pytest.mark.parametrize("field", ["opening_time", "closing_time"])
def test_partial_schedule(data, field):
    data[field] = "09:00"
    assert issues(data) == [(("opening_time", "closing_time"), "INCOMPLETE_SCHEDULE")]


@pytest.mark.parametrize("value", [42, "not a time", time(9, tzinfo=timezone.utc)])
def test_invalid_time_is_not_absent(data, value):
    data.update(opening_time=value, closing_time="18:00")
    found = issues(data)
    assert len(found) == 1 and found[0][0] == ("opening_time",)
    assert found[0][1] != "INCOMPLETE_SCHEDULE"


@pytest.mark.parametrize("field", [
    "closing_day_offset", "category_ids", "category_names", "categories", "id",
    "supplier_id", "seed_key", "version", "created_at", "deleted_at", "unexpected",
])
def test_forbidden_fields(data, field):
    data[field] = None
    assert issues(data) == [((field,), "FORBIDDEN_FIELD")]


def test_independent_errors_and_input_preservation(data):
    data.update(name=" ", area="unknown", floor=4, category_names=["Food"], opening_time="09:00")
    data["location"] = {"latitude": "NaN", "longitude": 181, "extra": True}
    before = deepcopy(data)
    assert set(issues(data)) == {
        (("name",), "BLANK_TEXT"), (("area",), "UNKNOWN_AREA"),
        (("floor",), "INVALID_TEXT"), (("category_names",), "FORBIDDEN_FIELD"),
        (("location.latitude",), "INVALID_COORDINATE"),
        (("location.longitude",), "COORDINATE_OUT_OF_RANGE"),
        (("location.extra",), "FORBIDDEN_FIELD"),
        (("opening_time", "closing_time"), "INCOMPLETE_SCHEDULE"),
    }
    assert data == before


@pytest.mark.parametrize("value", [None, [], "text", 42])
def test_invalid_top_level(value):
    assert issues(value) == [((), "INVALID_INPUT")]
