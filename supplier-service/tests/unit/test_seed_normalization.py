# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — test reviewed seed normalization, area precedence, categories, exact image URLs, strict times, corrections, context, and whole-batch rejection.
# Author review: All affected work reviewed by Keith.
# Details: ../../ai/usage-log.md; ai-20260930-007

"""Reviewed normalization with fixed fixture identities and no persistence."""

import csv
from collections import Counter
from datetime import time
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest

from app.commands.seed_parsing import IMAGE_KEYS, SOURCE_HEADERS, parse_seed_source

SERVICE = Path(__file__).resolve().parents[2]


@pytest.fixture
def sample(tmp_path):
    row = dict(zip(SOURCE_HEADERS, [
        " Sample Cafe ", " Food / Coffee / Food ", " Com 2 ", " B01 ", "  near lift  ",
        "1.29612345678901234567890123456789", "103.77000000000000000001", " 0930hrs ", "1800hrs", " ",
    ]))
    manifest = [{"seed_key": "permanent-fixture", "supplier_id": "61773e85-5246-4bdd-8e8b-8bbd9801f6f3",
                 "source_match": {"Name": "Sample Cafe", "Building": "COM2"}, "correct_24_hours": False}]
    areas = {"buildings": {"COM2": "SoC"}, "seed_overrides": {}}

    def parse(rows=None):
        path = tmp_path / "source.csv"
        with path.open("w", encoding="cp1252", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=(*SOURCE_HEADERS, "ImageKey") if "ImageKey" in row else SOURCE_HEADERS)
            writer.writeheader()
            writer.writerows([row] if rows is None else rows)
        return parse_seed_source(path, manifest, areas)

    return row, manifest, areas, parse


def codes(result):
    return {issue.code for issue in result.issues}


def test_typed_values_precision_categories_and_context(sample):
    row, manifest, _, parse = sample
    result = parse()
    assert result.valid and not result.issues
    record, = result.records
    assert record.seed_key == "permanent-fixture"
    assert record.supplier_id == UUID(manifest[0]["supplier_id"])
    assert record.source.row_number == 2
    assert record.source.values == row
    assert record.category_names == ("Food", "Coffee")
    values = record.values
    assert values.name == "Sample Cafe" and values.building == "COM2"
    assert values.area == "SoC" and values.floor == "B01" and values.description == "near lift"
    assert values.location.latitude == Decimal(row["Latitude"])
    assert values.location.longitude == Decimal(row["Longitude"])
    assert values.opening_time == time(9, 30) and values.closing_day_offset == 0
    assert values.image_key is None
    assert "category_ids" not in values.model_dump()


@pytest.mark.parametrize(("building", "normalized", "area"), [
    ("Com2", "COM2", "SoC"), ("Com 2", "COM2", "SoC"),
    ("Prince George’s Park", "Prince George's Park", "PGP"),
])
def test_aliases(sample, building, normalized, area):
    row, manifest, areas, parse = sample
    row["Building"] = building
    manifest[0]["source_match"]["Building"] = normalized
    areas["buildings"] = {building: area}
    result = parse()
    assert result.valid
    assert result.records[0].values.building == normalized
    assert result.records[0].values.area == area


def test_override_precedence_and_missing_building(sample):
    _, _, areas, parse = sample
    areas["seed_overrides"] = {"permanent-fixture": "FASS"}
    assert parse().records[0].values.area == "FASS"
    areas["buildings"] = {}
    assert parse().records[0].values.area == "FASS"


@pytest.mark.parametrize("change", ["missing", "unapproved", "collision", "blank_key", "bad_key", "unknown_override"])
def test_mapping_failures(sample, change):
    _, _, areas, parse = sample
    expected = {
        "missing": "MISSING_AREA", "unapproved": "UNKNOWN_AREA", "collision": "DUPLICATE_AREA_BUILDING",
        "blank_key": "INVALID_AREA_KEY", "bad_key": "INVALID_AREA_KEY", "unknown_override": "UNKNOWN_SEED_OVERRIDE",
    }[change]
    if change == "missing":
        areas["buildings"] = {}
    elif change == "unapproved":
        areas["buildings"]["COM2"] = "soc"
    elif change == "collision":
        areas["buildings"]["Com 2"] = "SoC"
    elif change == "blank_key":
        areas["buildings"][" "] = "SoC"
    elif change == "bad_key":
        areas["buildings"][7] = "SoC"
    else:
        areas["seed_overrides"]["unknown"] = "SoC"
    result = parse()
    assert expected in codes(result)
    assert not result.valid and not result.records


def test_blank_optional_text_and_times(sample):
    row, _, _, parse = sample
    for field in ("Floor", "Location Description", "ImageURL", "StartingTime", "ClosingTime"):
        row[field] = " \t "
    result = parse()
    assert result.valid
    values = result.records[0].values
    assert values.floor is values.description is values.image_key is None
    assert values.opening_time is values.closing_time is values.closing_day_offset is None


def test_invalid_override_is_not_replaced_by_valid_building_area(sample):
    _, _, areas, parse = sample
    areas["seed_overrides"]["permanent-fixture"] = "Unknown"
    result = parse()
    assert "UNKNOWN_AREA" in codes(result) and not result.records


def test_valid_row_is_withheld_when_another_record_fails(sample):
    row, manifest, _, parse = sample
    other = {**row, "Name": "Other", "Type": "Unknown"}
    manifest.append({**manifest[0], "seed_key": "other-key",
                     "supplier_id": "2048089b-0818-4c26-985f-f0b8232c386c",
                     "source_match": {"Name": "Other", "Building": "COM2"}})
    result = parse([row, other])
    assert codes(result) == {"UNKNOWN_CATEGORY"}
    assert not result.valid and result.records == ()


@pytest.mark.parametrize("labels", ["", "Food/", "/Food", "food", "Food / Unknown / Coffee"])
def test_invalid_category_labels(sample, labels):
    row, _, _, parse = sample
    row["Type"] = labels
    result = parse()
    assert {"BLANK_CATEGORY", "UNKNOWN_CATEGORY"} & codes(result)
    assert not result.records


@pytest.mark.parametrize("url", ["https://unrelated.example/ANNA.jpeg", "ANNA.jpeg", next(iter(IMAGE_KEYS)) + "?raw=true"])
def test_unknown_image_exact_url_required(sample, url):
    row, _, _, parse = sample
    row["ImageURL"] = url
    assert "UNKNOWN_IMAGE" in codes(parse())


@pytest.mark.parametrize("value", ["900hrs", "2500hrs", "1299hrs", "24:00", "0930hrs extra", "0930HRS", "09:30"])
@pytest.mark.parametrize("flagged", [False, True])
def test_malformed_time_never_becomes_absence_or_correction(sample, value, flagged):
    row, manifest, _, parse = sample
    row.update(StartingTime=value, ClosingTime="2359hrs")
    manifest[0]["correct_24_hours"] = flagged
    result = parse()
    assert codes(result) == {"INVALID_SOURCE_TIME"}
    assert not result.records


@pytest.mark.parametrize(("opening", "closing", "offset"), [
    ("1100hrs", "0200hrs", 1), ("0930hrs", "0930hrs", 1),
    ("0000hrs", "2359hrs", 0), ("0930hrs", "1800hrs", 0),
])
def test_daily_schedule_cases(sample, opening, closing, offset):
    row, _, _, parse = sample
    row.update(StartingTime=opening, ClosingTime=closing)
    result = parse()
    assert result.valid
    values = result.records[0].values
    assert values.closing_day_offset == offset
    assert values.closing_time == time(int(closing[:2]), int(closing[2:4]))


@pytest.mark.parametrize("field", ["StartingTime", "ClosingTime"])
def test_incomplete_schedule(sample, field):
    row, _, _, parse = sample
    row[field] = " "
    result = parse()
    assert codes(result) == {"INCOMPLETE_SCHEDULE"}
    assert result.issues[0].fields == ("StartingTime", "ClosingTime")
    assert not result.records


@pytest.mark.parametrize(("opening", "closing"), [("0100hrs", "2359hrs"), ("0000hrs", "0000hrs"), ("", "")])
def test_changed_reviewed_pair(sample, opening, closing):
    row, manifest, _, parse = sample
    manifest[0]["correct_24_hours"] = True
    row.update(StartingTime=opening, ClosingTime=closing)
    result = parse()
    assert "CHANGED_24_HOUR_PAIR" in codes(result) and not result.records


def test_collects_independent_issues_across_records_and_rejects_batch(sample):
    row, manifest, areas, parse = sample
    other = row.copy()
    other.update(Name="Other", Type="Shopping", Latitude="NaN", ImageURL="bad")
    manifest.append({**manifest[0], "seed_key": "other-key", "supplier_id": "2048089b-0818-4c26-985f-f0b8232c386c",
                     "source_match": {"Name": "Other", "Building": "COM2"}})
    row.update(Type="Food//Unknown", StartingTime="900hrs", Longitude="181")
    areas["buildings"] = {}
    result = parse([row, other])
    assert {"BLANK_CATEGORY", "UNKNOWN_CATEGORY", "INVALID_SOURCE_TIME", "COORDINATE_OUT_OF_RANGE",
            "UNKNOWN_IMAGE", "INVALID_COORDINATE", "MISSING_AREA"} <= codes(result)
    assert not result.records
    assert {issue.row_number for issue in result.issues if issue.row_number} == {2, 3}
    assert all(issue.seed_key for issue in result.issues if issue.row_number)


def test_real_reviewed_dataset():
    path = SERVICE.parent / "data/csv/supplier-seed-data.csv"
    before = path.read_bytes()
    result = parse_seed_source(path)
    assert result.valid, result.issues
    assert len(result.records) == 21
    by_name = {record.values.name: record for record in result.records}
    corrections = {"Printer @ Com 2", "InstaChef", "Cafe+ Robot Cafe", "Octobox", "Cheers Unmanned Convenience Store"}
    assert {name for name, record in by_name.items() if record.values.opening_time == record.values.closing_time == time(0)} == corrections
    assert all(by_name[name].values.closing_day_offset == 1 for name in corrections)
    snacks = by_name["Supersnacks"].values
    assert (snacks.opening_time, snacks.closing_time, snacks.closing_day_offset) == (time(11), time(2), 1)
    assert Counter(category for record in result.records for category in record.category_names) == {
        "Food": 16, "Coffee": 5, "Shopping": 3, "Printing": 2,
    }
    assert {record.values.image_key for record in result.records if record.values.image_key} == {
        "ANNA.jpeg", "NUS_COOP.jpeg", "PRINTER_COM2.jpeg", "COOL_SPOT.jpeg", "INSTACHEF.jpeg", "ROBOT_CAFE.jpeg",
        "HOT_HIDEOUT.jpg",
    }
    assert sum(record.values.image_key is None for record in result.records) == 14
    assert {name: record.values.image_key for name, record in by_name.items() if record.values.image_key} == {
        "Anna's x Soup Union": "ANNA.jpeg", "NUS Co-op": "NUS_COOP.jpeg",
        "Printer @ Com 2": "PRINTER_COM2.jpeg", "Cool Spot": "COOL_SPOT.jpeg",
        "InstaChef": "INSTACHEF.jpeg", "Cafe+ Robot Cafe": "ROBOT_CAFE.jpeg",
        "A Hot Hideout": "HOT_HIDEOUT.jpg",
    }
    assert by_name["Printer @ Com 2"].values.building == "COM2"
    assert path.read_bytes() == before


@pytest.mark.parametrize("key", ["anna.webp", "ANNA.jpeg", "photo.PNG", "my-photo.avif"])
def test_explicit_image_key(sample, key):
    row, _, _, parse = sample
    row["ImageKey"] = " " + key + " "
    result = parse()
    assert result.valid, result.issues
    assert result.records[0].values.image_key == key


@pytest.mark.parametrize("key", ["https://example.com/a.png", "/a.png", "../a.png", "a/b.png",
                                 "a\\b.png", "a..b.png", "a.png\n", "a\x00.png", "a.txt", "a%2fb.png"])
def test_invalid_image_keys(sample, key):
    row, _, _, parse = sample
    row["ImageKey"] = key
    result = parse()
    assert "INVALID_IMAGE_KEY" in codes(result)
    assert not result.records


@pytest.mark.parametrize("url,key", IMAGE_KEYS.items())
def test_legacy_image_and_matching_explicit_key(sample, url, key):
    row, _, _, parse = sample
    row["ImageURL"] = url
    assert parse().records[0].values.image_key == key
    row["ImageKey"] = key
    assert parse().records[0].values.image_key == key
    row["ImageKey"] = "different.webp"
    result = parse()
    assert "CONFLICTING_IMAGE_REFERENCE" in codes(result)
    assert not result.records


def test_unknown_legacy_url_with_key_still_rejected(sample):
    row, _, _, parse = sample
    row.update(ImageKey="anna.webp", ImageURL="https://example.com/anna.webp")
    assert "UNKNOWN_IMAGE" in codes(parse())


def test_blank_image_key(sample):
    row, _, _, parse = sample
    row["ImageKey"] = " \t "
    assert parse().records[0].values.image_key is None


@pytest.mark.parametrize("image_fields", [{}, {"ImageKey": "anna.webp"}])
def test_seed_without_image_url_column(sample, tmp_path, image_fields):
    row, manifest, areas, _ = sample
    row.pop("ImageURL")
    row.update(image_fields)
    path = tmp_path / "key-only.csv"
    with path.open("w", encoding="cp1252", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)
    batch = parse_seed_source(path, manifest, areas)
    assert batch.valid, batch.issues
    assert batch.records[0].values.image_key == image_fields.get("ImageKey")
