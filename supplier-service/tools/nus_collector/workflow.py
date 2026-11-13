"""File-based collection, human review, validation, and atomic seed exports."""

import csv
from datetime import datetime, timezone
from difflib import SequenceMatcher
from html import escape
import io
import json
from pathlib import Path
import tempfile
import time
from uuid import uuid4, uuid5, NAMESPACE_URL

import httpx

from app.commands.seed_parsing import SEED_HEADERS, normalize_building, parse_seed_source
from app.validation.vocabulary import APPROVED_AREAS
from .sources import SOURCES, digest, key, parse_html

SERVICE = Path(__file__).resolve().parents[2]
BASELINE = SERVICE.parent / "data/csv/supplier-seed-data.csv"
REVIEW_FIELDS = (*SEED_HEADERS, "candidate_id", "area", "decision", "coordinate_precision",
                 "coordinate_verified", "coordinate_source", "hours_policy", "evidence_url",
                 "reviewer", "reviewed_at", "notes", "duplicate_resolution", "exclusion_reason")


def now():
    return datetime.now(timezone.utc).isoformat()


def read_json(path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path, value):
    atomic_text(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def atomic_text(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        stream.write(value)
        temporary = Path(stream.name)
    temporary.replace(path)


def read_review(root):
    path = root / "review.csv"
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        if reader.fieldnames not in (list(REVIEW_FIELDS), [field for field in REVIEW_FIELDS if field != "ImageKey"]):
            raise ValueError("review.csv headers must match the generated review template.")
        rows = list(reader)
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError("review.csv contains a row with the wrong number of columns.")
    for row in rows:
        row.setdefault("ImageKey", "")
    ids = [row["candidate_id"] for row in rows]
    if len(set(ids)) != len(ids):
        raise ValueError("review.csv contains repeated candidate IDs.")
    return rows


def write_review(root, rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=REVIEW_FIELDS)
    writer.writeheader()
    writer.writerows(rows)
    atomic_text(root / "review.csv", stream.getvalue())


def fetch(client, url):
    for attempt in range(3):
        try:
            response = client.get(url)
            response.raise_for_status()
            return response.text
        except httpx.HTTPError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def collect(root, snapshots=None):
    root.mkdir(parents=True, exist_ok=True)
    old = read_json(root / "collection.json", {"candidates": []})
    old_candidates = {item["candidate_id"]: item for item in old["candidates"]}
    associations = read_json(root / "associations.json", {})
    if not isinstance(associations, dict) or any(
        not isinstance(alias, str) or target not in old_candidates
        for alias, target in associations.items()
    ):
        raise ValueError("associations.json must map newly extracted candidate IDs to known previous candidate IDs.")
    reviews = {row["candidate_id"]: row for row in read_review(root)}
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    raw = root / "raw" / run_id
    raw.mkdir(parents=True)
    candidates, results, issues = [], [], []
    with httpx.Client(timeout=25, follow_redirects=True, headers={"User-Agent": "NUS-Supplier-Collector/1.0"}) as client:
        for source, url in SOURCES.items():
            result = {"source": source, "url": url, "retrieved_at": now(), "mode": "snapshot" if snapshots else "http"}
            try:
                html = (snapshots / f"{source}.html").read_text(encoding="utf-8") if snapshots else fetch(client, url)
                path = raw / f"{source}.html"
                path.write_text(html, encoding="utf-8")
                result.update(snapshot=str(path.relative_to(root)), sha256=digest(html))
                parsed, errors = parse_html(source, html)
                if errors:
                    raise ValueError("; ".join(errors))
                for item in parsed:
                    target = associations.get(item["candidate_id"])
                    if target:
                        if old_candidates[target]["source"] != source:
                            raise ValueError("Source association cannot move a candidate between directories.")
                        item["extracted_id"] = item["candidate_id"]
                        item["candidate_id"] = target
                ids = [item["candidate_id"] for item in parsed]
                if len(set(ids)) != len(ids):
                    raise ValueError("Ambiguous repeated name/location associations; inspect source snapshot.")
                candidates.extend(parsed)
                result.update(valid=True, listing_count=len(parsed))
            except (OSError, ValueError, httpx.HTTPError) as error:
                message = str(error) if not isinstance(error, httpx.HTTPError) else "HTTP request failed after bounded retries."
                result.update(valid=False, error=message)
                issues.append(f"{source}: {message}")
                # Preserve candidates for inspection, but do not treat this run as complete.
                candidates.extend(item for item in old_candidates.values() if item["source"] == source)
            results.append(result)
    current_ids = {item["candidate_id"] for item in candidates}
    for cid, item in old_candidates.items():
        if cid not in current_ids:
            candidates.append({**item, "missing": True})
    rows = []
    for item in candidates:
        cid = item["candidate_id"]
        previous = old_candidates.get(cid)
        row = reviews.get(cid)
        if row is None:
            row = dict.fromkeys(REVIEW_FIELDS, "")
            row.update(item["proposed"], candidate_id=cid, evidence_url=item["source_url"],
                       decision="excluded" if item["exclusion_reason"] else "pending",
                       exclusion_reason=item["exclusion_reason"],
                       hours_policy="daily" if item["proposed"]["StartingTime"] else "unknown")
        if previous and (previous["content_hash"] != item["content_hash"] or previous.get("missing", False) != item.get("missing", False)):
            row["decision"] = "pending"
            row["reviewer"] = row["reviewed_at"] = ""
        rows.append(row)
    # Do not discard hand-entered rows: invalid IDs remain visible to validation.
    rows.extend(row for cid, row in reviews.items() if cid not in {item["candidate_id"] for item in candidates})
    write_review(root, rows)
    state = {"run_id": run_id, "collected_at": now(), "complete": not issues,
             "sources": results, "issues": issues, "candidates": candidates}
    write_json(root / "collection.json", state)
    return state


def baseline_rows(path):
    with path.open(encoding="cp1252", newline="") as stream:
        return list(csv.DictReader(stream))


def possible_matches(row, baseline):
    matches = []
    for other in baseline:
        same_name = key(row["Name"]) == key(other["Name"])
        same_building = key(normalize_building(row["Building"])) == key(normalize_building(other["Building"]))
        similar = SequenceMatcher(None, key(row["Name"]), key(other["Name"])).ratio() >= .65
        if same_name or similar:
            matches.append({"Name": other["Name"], "Building": other["Building"],
                            "exact": same_name and same_building})
    return matches


def build_bundle(rows, identities):
    """Construct bundle values; identities are supplied, never allocated here."""
    manifest, areas = [], {"buildings": {}, "seed_overrides": {}}
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=SEED_HEADERS)
    writer.writeheader()
    for row in rows:
        identity = identities[row["candidate_id"]]
        fields = {field: row[field] if field == "ImageKey" else row[field].strip() for field in SEED_HEADERS}
        if row["hours_policy"] == "unknown":
            fields["StartingTime"] = fields["ClosingTime"] = ""
        writer.writerow(fields)
        manifest.append({"seed_key": identity["seed_key"], "supplier_id": identity["supplier_id"],
                         "source_match": {"Name": fields["Name"], "Building": fields["Building"]},
                         "correct_24_hours": False})
        areas["seed_overrides"][identity["seed_key"]] = row["area"]
    return stream.getvalue().encode("cp1252"), manifest, areas


def validate(root, baseline=BASELINE):
    state = read_json(root / "collection.json")
    if state is None:
        raise ValueError("Run collect before validating.")
    rows = read_review(root)
    candidates = {item["candidate_id"]: item for item in state["candidates"]}
    registry = read_json(root / "identities.json", {})
    baseline = baseline_rows(baseline)
    previous_bundle = root / "bundle"
    previous_rows = []
    if previous_bundle.exists():
        provenance = read_json(previous_bundle / "provenance.json")
        previous_rows = provenance["review"]
    errors, warnings, matches = [], [], {}
    def issue(cid, message):
        errors.append({"candidate_id": cid, "message": message})
    if not state["complete"]:
        issue(None, "Collection is incomplete: " + "; ".join(state["issues"]))
    for missing in candidates.keys() - {row["candidate_id"] for row in rows}:
        issue(missing, "Missing review row; use excluded instead of deleting it.")
    approved = []
    for row in rows:
        cid = row["candidate_id"]
        if cid not in candidates:
            issue(cid, "Unknown candidate ID; do not edit identity columns.")
            continue
        if row["decision"] not in {"approved", "pending", "excluded"}:
            issue(cid, "Decision must be approved, pending, or excluded.")
        if row["decision"] == "excluded" and not row["exclusion_reason"].strip():
            issue(cid, "Excluded records require a reason.")
        matches[cid] = possible_matches(row, baseline + [item for item in previous_rows if item["candidate_id"] != cid])
        if row["decision"] != "approved":
            continue
        approved.append(row)
        if candidates[cid].get("missing"):
            issue(cid, "Listing disappeared from source; exclude it or reconcile the source association first.")
        for field in ("reviewer", "reviewed_at", "evidence_url", "Name", "Building"):
            if not row[field].strip():
                issue(cid, f"Approved record requires {field}.")
        try:
            datetime.fromisoformat(row["reviewed_at"].replace("Z", "+00:00"))
        except ValueError:
            issue(cid, "reviewed_at must be an ISO date or datetime.")
        if row["area"] not in APPROVED_AREAS:
            issue(cid, "Choose an approved campus area: " + ", ".join(APPROVED_AREAS))
        if row["coordinate_verified"] != "yes" or not row["coordinate_source"].startswith("https://"):
            issue(cid, "Verify coordinates explicitly (yes) and supply an HTTPS evidence URL.")
        if row["coordinate_precision"] not in {"outlet", "building"}:
            issue(cid, "coordinate_precision must be outlet or building.")
        if row["coordinate_precision"] == "building" and not row["notes"].strip():
            issue(cid, "Building-level approximation requires acknowledgement in notes.")
        if row["hours_policy"] not in {"unknown", "daily", "approximation"}:
            issue(cid, "hours_policy must be unknown, daily, or approximation.")
        if row["hours_policy"] == "unknown" and (row["StartingTime"].strip() or row["ClosingTime"].strip()):
            issue(cid, "Unknown hours require both time fields blank.")
        if row["hours_policy"] in {"daily", "approximation"} and not (row["StartingTime"] and row["ClosingTime"]):
            issue(cid, "Known hours require both time fields.")
        if row["hours_policy"] == "approximation" and not row["notes"].strip():
            issue(cid, "Approximated daily hours require an explanation in notes.")
        if row["hours_policy"] == "daily" and candidates[cid]["raw_hours"] and not candidates[cid]["proposed"]["StartingTime"] and not row["notes"].strip():
            issue(cid, "Source hours are complex; document evidence for a true daily schedule or choose unknown/approximation.")
        if any(match["exact"] for match in matches[cid]):
            issue(cid, "Existing baseline name/building match: exclude this supplier from the additional dataset.")
        elif matches[cid] and (row["duplicate_resolution"] != "distinct" or not row["notes"].strip()):
            issue(cid, "Possible baseline match: exclude it or confirm distinct with supporting notes.")
        if cid in registry:
            old_point = registry[cid]["coordinates"]
            try:
                if tuple(map(float, old_point)) != (float(row["Latitude"]), float(row["Longitude"])):
                    issue(cid, "Exported identity coordinates changed; reconcile the existing database identity before exporting.")
            except ValueError:
                issue(cid, "Coordinates must be numeric.")
    # Resolve cross-source duplicates before database preview, including renamed buildings.
    for index, row in enumerate(approved):
        for other in approved[:index]:
            same_name = key(row["Name"]) == key(other["Name"])
            same_building = key(normalize_building(row["Building"])) == key(normalize_building(other["Building"]))
            try:
                same_point = (float(row["Latitude"]), float(row["Longitude"])) == (float(other["Latitude"]), float(other["Longitude"]))
            except ValueError:
                same_point = False
            if same_name and (same_building or same_point):
                issue(row["candidate_id"], "Repeated approved name/building or name/point; resolve duplicate source listings.")
            elif same_name:
                for candidate in (row, other):
                    if candidate["duplicate_resolution"] != "distinct" or not candidate["notes"].strip():
                        issue(candidate["candidate_id"], "Same name appears at another branch; confirm distinct with supporting notes.")
    # Temporary deterministic IDs allow parser checks without allocating permanent UUIDs.
    identities = {row["candidate_id"]: registry.get(row["candidate_id"], {
        "seed_key": "nus-" + row["candidate_id"],
        "supplier_id": str(uuid5(NAMESPACE_URL, row["candidate_id"])),
    }) for row in approved}
    if approved:
        try:
            csv_bytes, manifest, areas = build_bundle(approved, identities)
            with tempfile.TemporaryDirectory() as temporary:
                path = Path(temporary) / "suppliers.csv"
                path.write_bytes(csv_bytes)
                batch = parse_seed_source(path, manifest, areas)
            for error in batch.issues:
                errors.append({"candidate_id": error.seed_key, "message": error.reason, "fields": error.fields})
        except UnicodeEncodeError:
            issue(None, "Approved seed text contains characters CP1252 cannot represent; correct the review text explicitly.")
    else:
        warnings.append("No approved records; there is nothing to export.")
    return {"valid": not errors, "errors": errors, "warnings": warnings, "matches": matches,
            "approved_count": len(approved), "pending_count": sum(row["decision"] == "pending" for row in rows)}


def report(root, baseline=BASELINE):
    result = validate(root, baseline)
    state = read_json(root / "collection.json")
    candidates = {item["candidate_id"]: item for item in state["candidates"]}
    blocks = []
    for row in read_review(root):
        cid = row["candidate_id"]
        item = candidates.get(cid, {})
        fields = "".join(f"<tr><th>{escape(field)}</th><td>{escape(row[field])}</td></tr>" for field in REVIEW_FIELDS)
        problems = [entry["message"] for entry in result["errors"] if entry["candidate_id"] in {cid, "nus-" + cid}]
        matches = result["matches"].get(cid, [])
        source_url = item.get("source_url", "")
        link = f'<a href="{escape(source_url, quote=True)}">Official listing</a>' if source_url.startswith("https://") else ""
        blocks.append(f'<article><h2>{escape(row["Name"])}</h2><p>{escape(row["decision"])} · {link}</p>'
                      f'<p class="error">{escape("; ".join(problems))}</p><p>Possible existing matches: {escape(json.dumps(matches))}</p>'
                      f'<div class="columns"><table>{fields}</table><section><h3>Original source text</h3><pre>{escape(item.get("raw_text", ""))}</pre></section></div></article>')
    html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>NUS supplier review</title><style>body{font:16px system-ui;max-width:1300px;margin:32px auto;padding:16px;background:#f6f7f9;color:#20242c}article{background:white;padding:20px;margin:24px 0;border:1px solid #ddd;border-radius:8px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}td,th{text-align:left;padding:5px;border-bottom:1px solid #eee;overflow-wrap:anywhere}pre{white-space:pre-wrap}.error{color:#a21c28} @media(max-width:800px){.columns{display:block}}</style>'
    html += '<h1>NUS supplier review</h1><p>Edit review.csv, then rerun report and validate. Coordinates need manual map verification; original hours may differ by day or term.</p>'
    html += f'<p>{result["approved_count"]} approved · {result["pending_count"]} pending · {len(result["errors"])} validation issues</p>'
    html += '<pre class="error">' + escape(json.dumps(result["errors"], indent=2)) + '</pre>' + ''.join(blocks) + '</html>'
    atomic_text(root / "report.html", html)
    write_json(root / "validation.json", result)
    return result


def export(root, baseline=BASELINE):
    result = validate(root, baseline)
    if not result["valid"] or not result["approved_count"]:
        raise ValueError("Export blocked: resolve validation issues and approve at least one record. Run report for details.")
    rows = [row for row in read_review(root) if row["decision"] == "approved"]
    registry = read_json(root / "identities.json", {})
    for row in rows:
        cid = row["candidate_id"]
        if cid not in registry:
            registry[cid] = {"seed_key": "nus-" + cid, "supplier_id": str(uuid4()),
                             "coordinates": [row["Latitude"], row["Longitude"]]}
    csv_bytes, manifest, areas = build_bundle(rows, registry)
    # Registry is durable before publication: interruption cannot allocate a new identity on retry.
    write_json(root / "identities.json", registry)
    exports = root / "exports"
    exports.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=exports) as temporary:
        stage = Path(temporary)
        (stage / "suppliers.csv").write_bytes(csv_bytes)
        write_json(stage / "manifest.json", manifest)
        write_json(stage / "area_mapping.json", areas)
        state = read_json(root / "collection.json")
        write_json(stage / "provenance.json", {"exported_at": now(), "sources": state["sources"], "review": rows,
                                              "candidates": [item for item in state["candidates"] if item["candidate_id"] in {row["candidate_id"] for row in rows}]})
        batch = parse_seed_source(stage / "suppliers.csv", manifest, areas)
        if not batch.valid:
            raise ValueError("Generated bundle failed seed parser validation; no bundle published.")
        version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        destination = exports / version
        stage.rename(destination)
        # A relative symlink switch publishes all files together; retain historical exports.
        link = root / ".bundle-next"
        if link.is_symlink():
            link.unlink()
        link.symlink_to(Path("exports") / version, target_is_directory=True)
        link.replace(root / "bundle")
        # TemporaryDirectory tolerates its directory already having moved.
    return {"valid": True, "exported_count": len(rows), "bundle": str(root / "bundle")}
