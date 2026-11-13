# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — test the specified CSV matching contract, malformed inputs, identity stability, malformed duplicate rows, and syntax-error line context.
# Author review: All affected work, including final refinements, reviewed by Keith.
# Details: ../../ai/usage-log.md; ai-20260930-005

"""Contract tests for source loading; fixture identities are fixed literals."""

import copy
import csv
import io
import json
from pathlib import Path
from uuid import UUID

import pytest

from app.commands.seed_parsing import (
    SOURCE_HEADERS, load_csv, load_seed_source, normalize_building,
)


SERVICE_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = SERVICE_ROOT / "tests/fixtures/seed_source.csv"
FIRST_ID = "ea40a1b7-9407-4ec3-b85f-c5c3ac60b278"
SECOND_ID = "2048089b-0818-4c26-985f-f0b8232c386c"


@pytest.fixture
def manifest():
    return [
        {"seed_key": "fixed-orchid", "supplier_id": FIRST_ID,
         "source_match": {"Name": "Quoted, Cafe", "Building": "Prince George's Park"},
         "correct_24_hours": False},
        {"seed_key": "fixed-cedar", "supplier_id": SECOND_ID,
         "source_match": {"Name": "Printer @ Com 2", "Building": "COM2"},
         "correct_24_hours": True},
    ]


@pytest.fixture
def areas():
    return {"buildings": {"Prince George's Park": "PGP", "COM2": "SoC"}, "seed_overrides": {}}


def codes(result):
    return {issue.code for issue in result.issues}


def write_csv(tmp_path, rows, headers=SOURCE_HEADERS):
    path = tmp_path / "source.csv"
    with path.open("w", encoding="cp1252", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerows(rows)
    return path


def fixture_rows():
    with FIXTURE.open(encoding="cp1252", newline="") as stream:
        return list(csv.reader(stream))[1:]


def test_cp1252_quoted_content_raw_values_and_paths(tmp_path, manifest, areas):
    assert b"\x92" in FIXTURE.read_bytes()
    manifest_path, area_path = tmp_path / "manifest.json", tmp_path / "areas.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    area_path.write_text(json.dumps(areas), encoding="utf-8")
    result = load_seed_source(FIXTURE, manifest_path, area_path)
    assert result.valid and len(result.matches) == 2
    first, second = result.matches
    assert first.source.values["Name"] == " Quoted, Cafe "
    assert first.source.values["Building"] == " Prince George’s Park "
    assert first.source.values["Location Description"] == 'Near "A", entrance\r\nsecond line'
    assert first.source.values["Latitude"] == "not parsed yet"
    assert first.source.row_number == 2
    assert second.source.row_number == 4
    assert first.supplier_id == UUID(FIRST_ID) and first.area == "PGP"
    assert second.supplier_id == UUID(SECOND_ID) and second.area == "SoC"
    assert second.correct_24_hours is True


def test_loaded_inputs_are_not_mutated_and_area_aliases_share_normalization(manifest, areas):
    areas["buildings"] = {" Prince George’s Park ": "PGP", " Com 2 ": "SoC"}
    before = copy.deepcopy((manifest, areas))
    result = load_seed_source(FIXTURE, manifest, areas)
    assert result.valid
    assert (manifest, areas) == before
    assert [match.area for match in result.matches] == ["PGP", "SoC"]


@pytest.mark.parametrize(("raw", "expected"), [
    (" Com2 ", "COM2"), ("Com 2", "COM2"), ("COM2", "COM2"),
    (" Prince George’s Park ", "Prince George's Park"),
    (" innovation4.0 ", "innovation4.0"), (" com2 ", "com2"),
])
def test_normalization(raw, expected):
    assert normalize_building(raw) == expected


def test_missing_duplicate_headers_and_empty_file(tmp_path):
    path = write_csv(tmp_path, [], ["Name", "Name", "Building"])
    result = load_csv(path)
    assert codes(result) == {"MISSING_HEADERS", "DUPLICATE_HEADERS"}
    missing = next(issue for issue in result.issues if issue.code == "MISSING_HEADERS")
    assert "Latitude" in missing.fields and missing.file == str(path)
    assert missing.row_number is None
    path.write_bytes(b"")
    assert codes(load_csv(path)) == {"MISSING_HEADERS"}


def test_malformed_widths_collect_both_rows_with_context(tmp_path, manifest, areas):
    rows = fixture_rows()
    rows[0].append("extra value")
    rows[1].pop()
    result = load_seed_source(write_csv(tmp_path, rows), manifest, areas)
    assert not result.valid and not result.matches
    issues = [issue for issue in result.issues if issue.code == "MALFORMED_ROW_WIDTH"]
    assert len(issues) == 2
    assert [issue.row_number for issue in issues] == [2, 4]
    assert [issue.seed_key for issue in issues] == ["fixed-orchid", "fixed-cedar"]
    assert issues[0].source_name == " Quoted, Cafe "
    assert issues[1].fields == ("ImageURL",)
    detail = issues[0].to_dict()
    assert detail["file"] and detail["reason"] and detail["fields"]
    assert detail["source_building"] == " Prince George’s Park "


def test_duplicate_headers_never_yield_usable_records(tmp_path):
    path = write_csv(tmp_path, [fixture_rows()[0] + ["other name"]], list(SOURCE_HEADERS) + ["Name"])
    result = load_csv(path)
    assert "DUPLICATE_HEADERS" in codes(result) and not result.records


def test_blank_lines_preserve_physical_start_line(tmp_path):
    path = tmp_path / "blank-lines.csv"
    header, data = FIXTURE.read_bytes().split(b"\r\n", 1)
    path.write_bytes(header + b"\r\n\r\n\r\n" + data)
    result = load_csv(path)
    assert not result.issues
    assert [row.row_number for row in result.records] == [4, 6]


def test_syntax_error_after_blank_lines_reports_actual_record_start(tmp_path):
    path = tmp_path / "broken-quotes.csv"
    path.write_bytes(
        (",".join(SOURCE_HEADERS) + '\r\n\r\n\r\n"unterminated\r\nrecord').encode("cp1252")
    )
    result = load_csv(path)
    assert not result.records
    assert len(result.issues) == 1
    issue = result.issues[0]
    assert issue.code == "MALFORMED_CSV"
    assert issue.row_number == 4
    assert issue.file == str(path)


@pytest.mark.parametrize("width_error", ["extra", "missing"])
def test_identifiable_malformed_duplicate_prevents_match(tmp_path, manifest, areas, width_error):
    rows = fixture_rows()
    duplicate = rows[0].copy()
    if width_error == "extra":
        duplicate.append("unexpected")
    else:
        duplicate.pop()
    path = write_csv(tmp_path, rows + [duplicate])
    source = load_csv(path)
    assert [row.valid_width for row in source.records] == [True, True, False]
    result = load_seed_source(path, manifest, areas)
    assert not result.valid
    assert codes(result) == {
        "MALFORMED_ROW_WIDTH", "REPEATED_SOURCE_ROW", "AMBIGUOUS_SOURCE_MATCH",
    }
    for code in ("REPEATED_SOURCE_ROW", "AMBIGUOUS_SOURCE_MATCH"):
        issues = [issue for issue in result.issues if issue.code == code]
        assert [issue.row_number for issue in issues] == [2, 5]
        assert {issue.seed_key for issue in issues} == {"fixed-orchid"}
    assert [match.seed_key for match in result.matches] == ["fixed-cedar"]


def test_valid_rows_survive_for_diagnostics_in_invalid_batch(tmp_path, manifest, areas):
    rows = fixture_rows()
    rows[0].append("unexpected")
    result = load_seed_source(write_csv(tmp_path, rows), manifest, areas)
    assert not result.valid
    assert "MALFORMED_ROW_WIDTH" in codes(result)
    assert [match.seed_key for match in result.matches] == ["fixed-cedar"]


def test_broken_quotes_and_undecodable_cp1252(tmp_path):
    path = tmp_path / "source.csv"
    path.write_bytes((",".join(SOURCE_HEADERS) + '\r\n"unterminated').encode("cp1252"))
    assert "MALFORMED_CSV" in codes(load_csv(path))
    path.write_bytes(b"\x81")
    assert "SOURCE_READ_ERROR" in codes(load_csv(path))


@pytest.mark.parametrize("kind", ["absent", "directory"])
def test_unreadable_files(tmp_path, manifest, areas, kind):
    path = tmp_path / "missing" if kind == "absent" else tmp_path
    result = load_seed_source(path, path, path)
    assert {"SOURCE_READ_ERROR", "JSON_READ_ERROR"} <= codes(result)
    assert all(issue.file == str(path) for issue in result.issues)
    assert not result.valid


def test_permission_error_is_reported(monkeypatch, manifest, areas):
    def denied(*args, **kwargs):
        raise PermissionError("test")
    monkeypatch.setattr(Path, "open", denied)
    assert "SOURCE_READ_ERROR" in codes(load_seed_source(FIXTURE, manifest, areas))


@pytest.mark.parametrize("text", ['{"broken":', '{"buildings": {}, "buildings": {}, "seed_overrides": {}}'])
def test_bad_json(tmp_path, manifest, text):
    path = tmp_path / "bad.json"
    path.write_text(text)
    result = load_seed_source(FIXTURE, manifest, path)
    assert {"INVALID_JSON", "DUPLICATE_JSON_KEY"} & codes(result)
    assert any(issue.file == str(path) for issue in result.issues)
    assert not result.valid


@pytest.mark.parametrize("value", [None, {}, "not an array", 4])
def test_manifest_top_level_structure(value, areas):
    # Strings are paths by API contract; loaded invalid scalars use non-string values.
    result = load_seed_source(FIXTURE, value, areas)
    assert "INVALID_MANIFEST" in codes(result)
    assert not result.valid


def test_entry_structure_and_independent_errors(manifest, areas):
    manifest[0].update(seed_key=" ", supplier_id="bad", correct_24_hours=1, source_match=[])
    manifest[1]["surprise"] = True
    manifest.append(None)
    result = load_seed_source(FIXTURE, manifest, areas)
    assert {"INVALID_SEED_KEY", "INVALID_UUID", "INVALID_CORRECTION_FLAG",
            "INVALID_SOURCE_MATCH", "INVALID_MANIFEST_ENTRY"} <= codes(result)
    assert not result.valid


@pytest.mark.parametrize("identity", [None, 42, [], {}, "not-a-uuid"])
def test_invalid_uuid_types(manifest, areas, identity):
    manifest[0]["supplier_id"] = identity
    assert "INVALID_UUID" in codes(load_seed_source(FIXTURE, manifest, areas))


def test_duplicate_keys_and_equivalent_uuid_spellings(manifest, areas):
    manifest[1]["seed_key"] = manifest[0]["seed_key"]
    manifest[1]["supplier_id"] = FIRST_ID.upper().replace("-", "")
    result = load_seed_source(FIXTURE, manifest, areas)
    assert {"DUPLICATE_SEED_KEY", "DUPLICATE_UUID"} <= codes(result)
    assert not result.valid
    assert len([issue for issue in result.issues if issue.code == "DUPLICATE_UUID"]) == 2


def test_ambiguous_manifest_association(manifest, areas):
    manifest[1]["source_match"] = {"Name": " Quoted, Cafe ", "Building": "Prince George’s Park"}
    result = load_seed_source(FIXTURE, manifest, areas)
    assert {"DUPLICATE_SOURCE_ASSOCIATION", "AMBIGUOUS_SOURCE_MATCH", "UNMATCHED_SOURCE_ROW"} <= codes(result)
    ambiguous = next(issue for issue in result.issues if issue.code == "AMBIGUOUS_SOURCE_MATCH")
    assert ambiguous.seed_key is None and ambiguous.row_number == 2
    assert not result.matches


def test_repeated_rows_are_not_matched(tmp_path, manifest, areas):
    rows = fixture_rows()
    result = load_seed_source(write_csv(tmp_path, rows + [rows[0]]), manifest, areas)
    assert {"REPEATED_SOURCE_ROW", "AMBIGUOUS_SOURCE_MATCH"} <= codes(result)
    repeated = [issue for issue in result.issues if issue.code == "REPEATED_SOURCE_ROW"]
    assert len(repeated) == 2
    assert {issue.seed_key for issue in repeated} == {"fixed-orchid"}
    assert [match.seed_key for match in result.matches] == ["fixed-cedar"]


def test_missing_row_and_unmatched_row_are_both_reported(tmp_path, manifest, areas):
    rows = fixture_rows()
    rows[0][0] = "quoted, cafe"  # Case is significant, regardless of equal coordinates.
    result = load_seed_source(write_csv(tmp_path, rows), manifest, areas)
    assert {"UNMATCHED_SOURCE_ROW", "UNMATCHED_MANIFEST_ENTRY"} <= codes(result)
    missing = next(issue for issue in result.issues if issue.code == "UNMATCHED_MANIFEST_ENTRY")
    assert missing.seed_key == "fixed-orchid" and missing.row_number is None
    assert missing.source_name == "Quoted, Cafe"
    result = load_seed_source(write_csv(tmp_path, []), manifest, areas)
    assert len([issue for issue in result.issues if issue.code == "UNMATCHED_MANIFEST_ENTRY"]) == 2


def test_blank_source_association(tmp_path, manifest, areas):
    rows = fixture_rows()
    rows[0][0] = " "
    result = load_seed_source(write_csv(tmp_path, rows), manifest, areas)
    assert {"INVALID_SOURCE_MATCH", "UNMATCHED_MANIFEST_ENTRY"} <= codes(result)


@pytest.mark.parametrize("mapping", [None, [], {}, {"buildings": [], "seed_overrides": {}}])
def test_area_mapping_structure(manifest, mapping):
    assert "INVALID_AREA_MAPPING" in codes(load_seed_source(FIXTURE, manifest, mapping))


def test_area_errors_and_seed_override(manifest, areas):
    areas["buildings"].update({"Com2": "SoC", "unknown": "Not approved"})
    areas["seed_overrides"]["no-such-key"] = "SoC"
    result = load_seed_source(FIXTURE, manifest, areas)
    assert {"DUPLICATE_AREA_BUILDING", "UNKNOWN_AREA", "UNKNOWN_SEED_OVERRIDE"} <= codes(result)
    areas = {"buildings": {}, "seed_overrides": {"fixed-orchid": "FASS", "fixed-cedar": "SoC"}}
    result = load_seed_source(FIXTURE, manifest, areas)
    assert result.valid
    assert [match.area for match in result.matches] == ["FASS", "SoC"]
    areas["seed_overrides"].pop("fixed-orchid")
    assert "MISSING_AREA" in codes(load_seed_source(FIXTURE, manifest, areas))


def test_reordering_real_csv_preserves_permanent_associations(tmp_path):
    path = SERVICE_ROOT.parent / "data/csv/supplier-seed-data.csv"
    original_bytes = path.read_bytes()
    original = load_seed_source(path)
    with io.StringIO(original_bytes.decode("cp1252"), newline="") as stream:
        rows = list(csv.reader(stream))
    reordered = load_seed_source(write_csv(tmp_path, list(reversed(rows[1:])), rows[0]))
    assert original.valid and reordered.valid

    def identities(result):
        return {
            (match.source.values["Name"].strip(), normalize_building(match.source.values["Building"])):
            (match.seed_key, match.supplier_id)
            for match in result.matches
        }

    assert len(original.matches) == 21
    assert identities(original) == identities(reordered)
    assert path.read_bytes() == original_bytes
