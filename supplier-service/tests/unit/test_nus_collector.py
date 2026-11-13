"""Offline behavioral tests for collection, review, and seed export."""

import csv
import json
from pathlib import Path
import shutil

import httpx
import pytest

pytest.importorskip("bs4", reason="Install requirements-collector.txt to test optional collector")

from app.commands.seed_parsing import parse_seed_source
from tools.nus_collector.sources import parse_html, suggested_hours
from tools.nus_collector.workflow import (
    BASELINE, collect, export, read_json, read_review, report, validate, write_review,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/nus_collector"


@pytest.fixture
def dataset(tmp_path):
    root = tmp_path / "dataset"
    assert collect(root, FIXTURES)["complete"]
    return root


def approve(root, name="CHAGEE"):
    rows = read_review(root)
    row = next(row for row in rows if row["Name"] == name)
    row.update(decision="approved", area="YIH", Latitude="1.2985", Longitude="103.7743",
               coordinate_verified="yes", coordinate_precision="outlet",
               coordinate_source="https://map.nus.edu.sg/", reviewer="Test reviewer",
               reviewed_at="2026-11-10", notes="Verified against campus map")
    write_review(root, rows)
    return row


def test_parse_locations_branches_hours_and_exclusions(dataset):
    rows = read_review(dataset)
    assert len(rows) == 9
    assert len([row for row in rows if row["Name"] == "Burnt Cones"]) == 2
    chagee = next(row for row in rows if row["Name"] == "CHAGEE")
    assert chagee["Building"] == "Yusof Ishak House" and chagee["Floor"] == "1"
    assert (chagee["StartingTime"], chagee["ClosingTime"]) == ("1030hrs", "2030hrs")
    cheers = next(row for row in rows if "Cheers" in row["Name"])
    assert cheers["StartingTime"] == cheers["ClosingTime"] == "0000hrs"
    starbucks = next(row for row in rows if row["Name"] == "Starbucks")
    assert starbucks["StartingTime"] == starbucks["ClosingTime"] == ""
    assert next(row for row in rows if "Kent Vale" == row["Building"])["decision"] == "excluded"
    assert next(row for row in rows if row["Name"].startswith("OCBC"))["decision"] == "excluded"


@pytest.mark.parametrize("text,expected", [
    ("Daily 11am–2am", ("1100hrs", "0200hrs")),
    ("Mon-Sun: 24 hours", ("0000hrs", "0000hrs")),
    ("Daily 12am-12pm", ("0000hrs", "1200hrs")),
    ("Daily 13pm-9pm", ("", "")),
    ("Mon-Fri 9am-5pm", ("", "")),
    ("Daily 9am-5pm; PH closed", ("", "")),
    ("Daily 9am-5pm (last order 4pm)", ("", "")),
    ("Daily 9am-12pm, 2pm-5pm", ("", "")),
])
def test_conservative_hours(text, expected):
    assert suggested_hours(text) == expected


def test_export_roundtrip_and_stable_identities(dataset):
    approve(dataset)
    assert validate(dataset)["valid"]
    first = export(dataset)
    bundle = Path(first["bundle"])
    manifest = read_json(bundle / "manifest.json")
    batch = parse_seed_source(bundle / "suppliers.csv", bundle / "manifest.json", bundle / "area_mapping.json")
    assert batch.valid and len(batch.records) == 1
    assert batch.records[0].values.opening_time.hour == 10
    rows = read_review(dataset)
    write_review(dataset, list(reversed(rows)))
    export(dataset)
    assert read_json(bundle / "manifest.json") == manifest
    assert len(list((dataset / "exports").iterdir())) == 2
    assert read_json(bundle / "provenance.json")["review"][0]["reviewer"] == "Test reviewer"


def test_unknown_hours_and_24hour_roundtrip(dataset):
    row = approve(dataset, "Starbucks")
    rows = read_review(dataset)
    rows = [dict(item, area="UTown") if item["candidate_id"] == row["candidate_id"] else item for item in rows]
    write_review(dataset, rows)
    export(dataset)
    bundle = dataset / "bundle"
    batch = parse_seed_source(bundle / "suppliers.csv", bundle / "manifest.json", bundle / "area_mapping.json")
    assert batch.records[0].values.opening_time is None
    rows = read_review(dataset)
    row = next(item for item in rows if item["Name"] == "Starbucks")
    row.update(StartingTime="0000hrs", ClosingTime="0000hrs", hours_policy="approximation")
    write_review(dataset, rows)
    export(dataset)
    batch = parse_seed_source(bundle / "suppliers.csv", bundle / "manifest.json", bundle / "area_mapping.json")
    assert batch.records[0].values.closing_day_offset == 1


def test_coordinate_change_blocks_export_and_keeps_previous_bundle(dataset):
    approve(dataset)
    export(dataset)
    before = (dataset / "bundle").resolve()
    rows = read_review(dataset)
    next(row for row in rows if row["Name"] == "CHAGEE")["Latitude"] = "1.299"
    write_review(dataset, rows)
    with pytest.raises(ValueError, match="Export blocked"):
        export(dataset)
    assert (dataset / "bundle").resolve() == before
    assert any("coordinates changed" in error["message"] for error in validate(dataset)["errors"])


def test_changed_source_resets_approval_preserves_corrections(dataset, tmp_path):
    approve(dataset)
    snapshots = tmp_path / "snapshots"
    shutil.copytree(FIXTURES, snapshots)
    collect(dataset, snapshots)
    assert next(row for row in read_review(dataset) if row["Name"] == "CHAGEE")["decision"] == "approved"
    path = snapshots / "kent-ridge.html"
    path.write_text(path.read_text().replace("10.30am", "11.30am"))
    collect(dataset, snapshots)
    row = next(row for row in read_review(dataset) if row["Name"] == "CHAGEE")
    assert row["decision"] == "pending" and row["Latitude"] == "1.2985" and not row["reviewer"]


def test_incomplete_collection_preserves_candidates_and_blocks_export(dataset, tmp_path):
    approve(dataset)
    state = collect(dataset, tmp_path)
    assert not state["complete"] and len(state["candidates"]) == 9
    with pytest.raises(ValueError, match="Export blocked"):
        export(dataset)
    assert len(read_review(dataset)) == 9


def test_disappeared_listing_remains_for_review(dataset, tmp_path):
    approve(dataset)
    snapshots = tmp_path / "snapshots"
    shutil.copytree(FIXTURES, snapshots)
    path = snapshots / "kent-ridge.html"
    text = path.read_text()
    start = text.index('<div><h5>CHAGEE')
    end = text.index('</div>', start) + len('</div>')
    path.write_text(text[:start] + text[end:])
    state = collect(dataset, snapshots)
    assert state["complete"]
    item = next(item for item in state["candidates"] if item["source_name"] == "CHAGEE")
    assert item["missing"]
    row = next(row for row in read_review(dataset) if row["Name"] == "CHAGEE")
    assert row["decision"] == "pending"


def test_curation_and_baseline_duplicates(dataset):
    approve(dataset, "Goh Bros E-Print Pte Ltd")
    result = validate(dataset)
    assert not result["valid"]
    assert any("Existing baseline" in error["message"] for error in result["errors"])
    approve(dataset)
    rows = read_review(dataset)
    row = next(row for row in rows if row["Name"] == "CHAGEE")
    row.update(coordinate_verified="", Type="Bubble Tea", area="Elsewhere", StartingTime="9am")
    write_review(dataset, rows)
    errors = validate(dataset)["errors"]
    assert any("Verify coordinates" in error["message"] for error in errors)
    assert any("Use Food" in error["message"] for error in errors)
    assert any("four digits" in error["message"] for error in errors)


def test_encoding_and_html_escaping(dataset):
    approve(dataset)
    rows = read_review(dataset)
    row = next(row for row in rows if row["Name"] == "CHAGEE")
    row["Name"] = '<script>alert("x")</script>😀'
    write_review(dataset, rows)
    result = report(dataset)
    assert not result["valid"]
    assert any("CP1252" in error["message"] for error in result["errors"])
    text = (dataset / "report.html").read_text()
    assert '<script>alert' not in text and '&lt;script&gt;' in text


def test_invalid_html_and_orphan_location_blocks():
    with pytest.raises(ValueError, match="Bot-protection"):
        parse_html("kent-ridge", '<script src="/_Incapsula_Resource"></script>')
    assert parse_html("kent-ridge", '<h5>Outlet</h5><p>Operating Hours: Daily 9am-5pm</p>')[1]
    assert parse_html("kent-ridge", '<h5>A</h5><p>Location: A</p><h3>Other</h3><p>Location: B</p>')[1]


def test_fetch_retries_bounded(monkeypatch):
    from tools.nus_collector import workflow
    calls = []
    def fail(request):
        calls.append(request)
        return httpx.Response(503)
    monkeypatch.setattr(workflow.time, "sleep", lambda _: None)
    with httpx.Client(transport=httpx.MockTransport(fail)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            workflow.fetch(client, "https://example.com")
    assert len(calls) == 3


def test_renamed_listing_can_be_explicitly_reassociated(dataset, tmp_path):
    from tools.nus_collector.sources import digest, key
    approve(dataset)
    export(dataset)
    original = next(row for row in read_review(dataset) if row["Name"] == "CHAGEE")
    identity = read_json(dataset / "identities.json")[original["candidate_id"]]
    snapshots = tmp_path / "renamed"
    shutil.copytree(FIXTURES, snapshots)
    path = snapshots / "kent-ridge.html"
    path.write_text(path.read_text().replace("CHAGEE", "CHAGEE Tea"))
    extracted_id = "kent-ridge-" + digest(key("CHAGEE Tea") + "|" + key("Yusof Ishak House, Level 1"))[:16]
    (dataset / "associations.json").write_text(json.dumps({extracted_id: original["candidate_id"]}))
    assert collect(dataset, snapshots)["complete"]
    row = next(row for row in read_review(dataset) if row["candidate_id"] == original["candidate_id"])
    assert row["decision"] == "pending"
    rows = read_review(dataset)
    row = next(row for row in rows if row["candidate_id"] == original["candidate_id"])
    row.update(Name="CHAGEE Tea", decision="approved", reviewer="Reviewer", reviewed_at="2026-11-10")
    write_review(dataset, rows)
    export(dataset)
    assert read_json(dataset / "identities.json")[original["candidate_id"]] == identity


def test_building_approximation_and_missing_review_rows(dataset):
    approve(dataset)
    rows = read_review(dataset)
    row = next(row for row in rows if row["Name"] == "CHAGEE")
    row.update(coordinate_precision="building", notes="")
    write_review(dataset, rows[:-1])
    messages = [error["message"] for error in validate(dataset)["errors"]]
    assert any("acknowledgement" in message for message in messages)
    assert any("Missing review row" in message for message in messages)


def test_duplicate_review_ids_rejected(dataset):
    rows = read_review(dataset)
    write_review(dataset, rows + [rows[0]])
    with pytest.raises(ValueError, match="repeated candidate IDs"):
        read_review(dataset)


@pytest.mark.parametrize("legacy", [False, True])
def test_image_roundtrip_refresh_and_report(dataset, legacy):
    from app.commands.seed_parsing import IMAGE_KEYS
    approve(dataset)
    rows = read_review(dataset)
    row = next(row for row in rows if row["Name"] == "CHAGEE")
    row["ImageKey"] = "ANNA.jpeg" if legacy else "curated.webp"
    row["ImageURL"] = next(iter(IMAGE_KEYS)) if legacy else ""
    cid = row["candidate_id"]
    write_review(dataset, rows)
    collect(dataset, FIXTURES)
    retained = next(row for row in read_review(dataset) if row["candidate_id"] == cid)
    assert retained == row
    assert report(dataset)["valid"]
    assert row["ImageKey"] in (dataset / "report.html").read_text()
    export(dataset)
    bundle = dataset / "bundle"
    batch = parse_seed_source(bundle / "suppliers.csv", bundle / "manifest.json", bundle / "area_mapping.json")
    assert batch.valid
    assert batch.records[0].values.image_key == row["ImageKey"]
    assert read_json(bundle / "provenance.json")["review"][0]["ImageURL"] == row["ImageURL"]


def test_old_review_without_image_key(dataset):
    import csv
    from tools.nus_collector.workflow import REVIEW_FIELDS
    rows = read_review(dataset)
    fields = [field for field in REVIEW_FIELDS if field != "ImageKey"]
    with (dataset / "review.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    assert all(row["ImageKey"] == "" for row in read_review(dataset))
    collect(dataset, FIXTURES)
    assert all(row["ImageKey"] == "" for row in read_review(dataset))


@pytest.mark.parametrize("key,url,reason", [
    ("../a.png", "", "ImageKey must be a filename"),
    ("a.png\n", "", "ImageKey must be a filename"),
    ("different.webp", "https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/ANNA.jpeg", "does not match"),
    ("a.webp", "https://example.com/a.webp", "six reviewed"),
])
def test_collector_rejects_bad_images(dataset, key, url, reason):
    approve(dataset)
    rows = read_review(dataset)
    next(row for row in rows if row["Name"] == "CHAGEE").update(ImageKey=key, ImageURL=url)
    write_review(dataset, rows)
    result = validate(dataset)
    assert not result["valid"]
    assert any(reason in error["message"] for error in result["errors"])
    with pytest.raises(ValueError, match="Export blocked"):
        export(dataset)
