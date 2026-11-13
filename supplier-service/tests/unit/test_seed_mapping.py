# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write unit tests for the specified permanent manifest, source coverage, correction set, normalization, and reviewed areas.
# Author review: All affected work reviewed by Keith.
# Details: ../../ai/usage-log.md; ai-20260930-004

"""Validate authored seed data; identities are permanent, never regenerated here."""

import csv
import json
from collections import Counter
from pathlib import Path
from uuid import RFC_4122, UUID

import pytest

from app.validation.vocabulary import APPROVED_AREAS


SERVICE_ROOT = Path(__file__).resolve().parents[2]
SEED_ROOT = SERVICE_ROOT / "seed"

# Independent expectations transcribed from docs/seed-mapping.md.
REVIEWED = [
    ("Anna's x Soup Union", "Central Library", "FASS"),
    ("NUS Co-op", "Central Library", "FASS"),
    ("Printer @ Com 2", "COM2", "SoC"),
    ("Cool Spot", "COM2", "SoC"),
    ("InstaChef", "Terrace", "SoC"),
    ("Cafe+ Robot Cafe", "Central Library", "FASS"),
    ("A Hot Hideout", "Prince George's Park", "PGP"),
    ("Arise and Shine", "Engineering Block E4", "Engineering"),
    ("Bakehaus / Aurea", "The Ridge", "SoC"),
    ("Central Square @ YIH", "Yusof Ishak House", "YIH"),
    ("Pasta Express", "Frontier", "Science"),
    ("TOMORO COFFEE", "Hon Sui Sen Memorial Library", "BIZ"),
    ("Octobox", "Prince George's Park", "PGP"),
    ("Smooy", "COM3", "SoC"),
    ("Goh Bros E-Print Pte Ltd", "Yusof Ishak House", "YIH"),
    ("Cheers Unmanned Convenience Store", "Engineering Block E3", "Engineering"),
    ("Nami", "innovation4.0", "BIZ"),
    ("Supersnacks", "Prince George's Park", "PGP"),
    ("Good Day Cafe", "Medicine+Science Library", "Science"),
    ("The Coffee Roaster", "Blk AS8", "FASS"),
    ("he by He Brews", "Engineering Block EA", "Engineering"),
]


def normalize_building(value):
    value = value.strip()
    return {
        "Com 2": "COM2",
        "Com2": "COM2",
        "Prince George’s Park": "Prince George's Park",
    }.get(value, value)


def source_pair(row):
    return row["Name"].strip(), normalize_building(row["Building"])


@pytest.fixture
def manifest():
    return json.loads((SEED_ROOT / "manifest.json").read_text(encoding="utf-8"))


@pytest.fixture
def source_rows():
    path = SERVICE_ROOT.parent / "data/csv/supplier-seed-data.csv"
    with path.open(encoding="cp1252", newline="") as source:
        return list(csv.DictReader(source))


def test_manifest_schema_and_unique_permanent_identities(manifest):
    assert isinstance(manifest, list)
    assert len(manifest) == 21
    for entry in manifest:
        assert set(entry) == {"seed_key", "supplier_id", "source_match", "correct_24_hours"}
        key = entry["seed_key"]
        assert isinstance(key, str) and key.strip() and key == key.strip()
        assert isinstance(entry["supplier_id"], str)
        identity = UUID(entry["supplier_id"])
        assert identity.version == 4 and identity.variant == RFC_4122
        assert str(identity) == entry["supplier_id"]
        assert type(entry["correct_24_hours"]) is bool
        assert set(entry["source_match"]) == {"Name", "Building"}
        for value in entry["source_match"].values():
            assert isinstance(value, str) and value.strip() and value == value.strip()
        assert entry["source_match"]["Building"] == normalize_building(entry["source_match"]["Building"])
    assert len({entry["seed_key"] for entry in manifest}) == 21
    assert len({UUID(entry["supplier_id"]) for entry in manifest}) == 21


def test_exact_one_to_one_source_coverage(manifest, source_rows):
    expected = Counter((name, building) for name, building, _ in REVIEWED)
    assert len(source_rows) == 21
    assert all(count == 1 for count in expected.values())
    assert Counter(map(source_pair, source_rows)) == expected
    assert Counter(source_pair(entry["source_match"]) for entry in manifest) == expected


def test_exact_reviewed_corrections(manifest):
    assert {entry["source_match"]["Name"] for entry in manifest if entry["correct_24_hours"]} == {
        "Printer @ Com 2", "InstaChef", "Cafe+ Robot Cafe", "Octobox",
        "Cheers Unmanned Convenience Store",
    }


def test_reviewed_areas(manifest, source_rows):
    mapping = json.loads((SEED_ROOT / "area_mapping.json").read_text(encoding="utf-8"))
    assert set(mapping) == {"buildings", "seed_overrides"}
    assert mapping["seed_overrides"] == {}
    assert mapping["buildings"] == {building: area for _, building, area in REVIEWED}
    assert set(mapping["buildings"].values()) <= set(APPROVED_AREAS)
    expected = {(name, building): area for name, building, area in REVIEWED}
    for row in source_rows + [entry["source_match"] for entry in manifest]:
        pair = source_pair(row)
        assert mapping["buildings"][pair[1]] == expected[pair]


@pytest.mark.parametrize(("raw", "expected"), [
    (" Com 2 ", "COM2"), ("Com2", "COM2"), ("COM2", "COM2"),
    (" Prince George’s Park ", "Prince George's Park"),
    ("Prince George's Park", "Prince George's Park"),
    (" innovation4.0 ", "innovation4.0"), (" com2 ", "com2"),
])
def test_reviewed_building_normalization(raw, expected):
    assert normalize_building(raw) == expected


def test_name_matching_trims_but_preserves_case_and_spelling():
    assert source_pair({"Name": " Printer @ Com 2 ", "Building": "Com2"}) == (
        "Printer @ Com 2", "COM2",
    )
    assert source_pair({"Name": " TOMORO COFFEE ", "Building": "COM2"})[0] == "TOMORO COFFEE"
