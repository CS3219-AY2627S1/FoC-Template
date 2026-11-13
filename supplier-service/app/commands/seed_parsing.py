# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code; Refactoring and documentation improvements — implement and document the specified CSV/JSON loader, structured issues, permanent-identity matching, malformed-row association counting, and physical line diagnostics.
# Scope: Writing implementation code; Refactoring and documentation improvements — normalize matched seed records through shared scalar rules, controlled category names, strict source times, reviewed corrections, exact image URLs, and complete-batch rejection.
# Scope: Writing implementation code; Refactoring and documentation improvements — retain loaded source context and source count in typed results, documenting that only valid batch records are accepted import input. (ai-20260930-011, Prompt 2)
# Author review: Keith confirmed review of earlier work (ai-20260930-005; ai-20260930-007). Keith also confirmed review of all affected changes under ai-20260930-011 (Prompts 1–3).
# Details: ../../ai/usage-log.md; ai-20260930-005; ai-20260930-007; ai-20260930-011

"""Load, match, and normalize reviewed seed sources without creating identities.

Use ``load_seed_source(csv_path, manifest, area_mapping)`` with JSON paths or
already loaded JSON values. Matches preserve raw CSV fields for later validation.
Matches in an invalid result are diagnostic only: callers must check ``valid``
before accepting the batch. CSV row numbers are physical starting lines (header
is line 1), including for quoted multiline records; they never identify suppliers.
Use ``parse_seed_source`` for typed normalized records; it returns no records if
loading, matching, mapping, or normalization produces any issue.
"""

import csv
import json
import re
from collections import Counter, defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import time
from os import PathLike
from pathlib import Path
from uuid import UUID

from app.schemas import SupplierSeedResult
from app.validation.errors import DomainValidationError
from app.validation.suppliers import validate_supplier_seed_values
from app.validation.vocabulary import APPROVED_AREAS


SOURCE_HEADERS = (
    "Name", "Type", "Building", "Floor", "Location Description", "Latitude",
    "Longitude", "StartingTime", "ClosingTime", "ImageURL",
)
SEED_HEADERS = (*SOURCE_HEADERS, "ImageKey")
DEFAULT_SEED_ROOT = Path(__file__).resolve().parents[2] / "seed"


def normalize_building(value: str) -> str:
    """Apply only the reviewed aliases, preserving all other spelling/case."""
    value = value.strip()
    return {
        "Com 2": "COM2", "Com2": "COM2",
        "Prince George’s Park": "Prince George's Park",
    }.get(value, value)


def source_association(name: str, building: str) -> tuple[str, str]:
    return name.strip(), normalize_building(building)


@dataclass(frozen=True)
class SeedIssue:
    file: str
    fields: tuple[str, ...]
    code: str
    reason: str
    row_number: int | None = None
    source_name: str | None = None
    source_building: str | None = None
    seed_key: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "file": self.file, "row_number": self.row_number,
            "source_name": self.source_name, "source_building": self.source_building,
            "seed_key": self.seed_key, "fields": list(self.fields),
            "code": self.code, "reason": self.reason,
        }


@dataclass(frozen=True)
class SourceRecord:
    file: str
    row_number: int
    values: Mapping[str, str | None]
    valid_width: bool = True


@dataclass(frozen=True)
class CsvSource:
    records: tuple[SourceRecord, ...]
    issues: tuple[SeedIssue, ...]


@dataclass(frozen=True)
class MatchedSource:
    source: SourceRecord
    seed_key: str
    supplier_id: UUID
    correct_24_hours: bool
    area: str | None


@dataclass(frozen=True)
class SeedSourceResult:
    matches: tuple[MatchedSource, ...]
    issues: tuple[SeedIssue, ...]
    source_count: int = 0

    @property
    def valid(self) -> bool:
        return not self.issues


def load_csv(path: str | PathLike[str]) -> CsvSource:
    """Read CP1252 CSV, retaining wrong-width rows for association diagnostics."""
    context = str(path)
    records, issues = [], []
    try:
        with Path(path).open(encoding="cp1252", newline="") as stream:
            consumed_lines = []

            def tracked_lines():
                for number, line in enumerate(stream, start=1):
                    consumed_lines.append((number, line))
                    yield line

            def record_start(fallback):
                return next(
                    (number for number, line in consumed_lines if line.rstrip("\r\n")),
                    fallback,
                )

            reader = csv.DictReader(tracked_lines(), strict=True)
            headers = reader.fieldnames or []
            missing = tuple(field for field in SOURCE_HEADERS if field != "ImageURL" and field not in headers)
            duplicates = tuple(field for field, count in Counter(headers).items() if count > 1)
            if missing:
                issues.append(SeedIssue(context, missing, "MISSING_HEADERS", "Required CSV headers are missing."))
            if duplicates:
                issues.append(SeedIssue(context, duplicates, "DUPLICATE_HEADERS", "CSV headers must be unique."))
            while True:
                start_line = reader.line_num + 1
                consumed_lines.clear()
                try:
                    row = next(reader)
                except StopIteration:
                    break
                except csv.Error:
                    start_line = record_start(start_line)
                    issues.append(SeedIssue(context, (), "MALFORMED_CSV", "CSV quoting or syntax is malformed.", start_line))
                    # Parser recovery after broken quoting cannot be trusted.
                    break
                start_line = record_start(start_line)
                extra = row.pop(None, None)
                absent = tuple(key for key, value in row.items() if value is None)
                if extra is not None or absent:
                    issues.append(SeedIssue(
                        context, absent or tuple(headers), "MALFORMED_ROW_WIDTH",
                        "CSV row width does not match the header width.", start_line,
                        row.get("Name"), row.get("Building"),
                    ))
                # Duplicate headers have already discarded values inside DictReader;
                # do not expose such records as usable source data.
                # Wrong-width rows still count toward source associations, but
                # cannot become usable matches, even when their identity is clear.
                if not duplicates:
                    records.append(SourceRecord(context, start_line, row, extra is None and not absent))
    except (OSError, UnicodeError) as error:
        issues.append(SeedIssue(context, (), "SOURCE_READ_ERROR", f"Cannot read CP1252 CSV ({type(error).__name__})."))
    except csv.Error:
        issues.append(SeedIssue(context, (), "MALFORMED_CSV", "CSV header syntax is malformed."))
    return CsvSource(tuple(records), tuple(issues))


def _load_json(value, label, issues):
    if not isinstance(value, (str, PathLike)):
        return value, f"<loaded {label}>"
    context = str(value)

    def object_pairs(pairs):
        result = {}
        for key, item in pairs:
            if key in result:
                issues.append(SeedIssue(context, (key,), "DUPLICATE_JSON_KEY", "JSON object keys must be unique."))
            result[key] = item
        return result

    try:
        with Path(value).open(encoding="utf-8") as stream:
            return json.load(stream, object_pairs_hook=object_pairs), context
    except (OSError, UnicodeError) as error:
        issues.append(SeedIssue(context, (), "JSON_READ_ERROR", f"Cannot read JSON ({type(error).__name__})."))
    except ValueError:
        issues.append(SeedIssue(context, (), "INVALID_JSON", "File must contain valid JSON."))
    return None, context


def _nonblank(value):
    return isinstance(value, str) and bool(value.strip())


def _manifest_entries(value, context, issues):
    if not isinstance(value, list):
        issues.append(SeedIssue(context, (), "INVALID_MANIFEST", "Manifest must be a JSON array."))
        return []
    entries = []
    keys, identities, associations = defaultdict(list), defaultdict(list), defaultdict(list)
    for index, entry in enumerate(value):
        prefix = f"[{index}]"
        if not isinstance(entry, Mapping):
            issues.append(SeedIssue(context, (prefix,), "INVALID_MANIFEST_ENTRY", "Manifest entry must be an object."))
            continue
        key = entry.get("seed_key")
        match = entry.get("source_match")
        match = match if isinstance(match, Mapping) else {}
        name, building = match.get("Name"), match.get("Building")
        name = name if isinstance(name, str) else None
        building = building if isinstance(building, str) else None
        seed_key = key if _nonblank(key) else None

        def issue(fields, code, reason):
            issues.append(SeedIssue(context, tuple(f"{prefix}.{field}" for field in fields), code, reason,
                                    source_name=name, source_building=building, seed_key=seed_key))

        valid = True
        if set(entry) != {"seed_key", "supplier_id", "source_match", "correct_24_hours"}:
            issue((), "INVALID_MANIFEST_ENTRY", "Entry must contain exactly seed_key, supplier_id, source_match, and correct_24_hours.")
            valid = False
        if not _nonblank(key) or key != key.strip():
            issue(("seed_key",), "INVALID_SEED_KEY", "Seed key must be nonblank text without surrounding whitespace.")
            valid = False
        else:
            keys[key].append(index)
        identity = None
        try:
            raw_id = entry.get("supplier_id")
            if not isinstance(raw_id, str):
                raise ValueError
            identity = UUID(raw_id)
        except ValueError:
            issue(("supplier_id",), "INVALID_UUID", "Supplier ID must be valid UUID text.")
            valid = False
        if identity is not None:
            identities[identity].append(index)
        association = None
        if set(match) != {"Name", "Building"} or not _nonblank(name) or not _nonblank(building):
            issue(("source_match",), "INVALID_SOURCE_MATCH", "Source match requires nonblank Name and Building strings.")
            valid = False
        else:
            association = source_association(name, building)
            associations[association].append(index)
        if type(entry.get("correct_24_hours")) is not bool:
            issue(("correct_24_hours",), "INVALID_CORRECTION_FLAG", "Correction flag must be a boolean.")
            valid = False
        entries.append((index, entry, association, identity, valid))
    for groups, field, code in (
        (keys, "seed_key", "DUPLICATE_SEED_KEY"),
        (identities, "supplier_id", "DUPLICATE_UUID"),
        (associations, "source_match", "DUPLICATE_SOURCE_ASSOCIATION"),
    ):
        for indices in groups.values():
            if len(indices) > 1:
                for index in indices:
                    entry = value[index]
                    match = entry.get("source_match", {})
                    match = match if isinstance(match, Mapping) else {}
                    issues.append(SeedIssue(
                        context, (f"[{index}].{field}",), code,
                        f"Manifest {field} must be unique.",
                        source_name=match.get("Name"), source_building=match.get("Building"),
                        seed_key=entry.get("seed_key") if _nonblank(entry.get("seed_key")) else None,
                    ))
    return entries


def _area_mapping(value, context, entries, issues):
    if not isinstance(value, Mapping) or set(value) != {"buildings", "seed_overrides"}:
        issues.append(SeedIssue(context, (), "INVALID_AREA_MAPPING", "Area mapping requires buildings and seed_overrides dictionaries."))
        return {}, {}
    result = {}
    known_keys = {entry[1].get("seed_key") for entry in entries if _nonblank(entry[1].get("seed_key"))}
    for field in ("buildings", "seed_overrides"):
        mapping = value[field]
        normalized = {}
        result[field] = normalized
        if not isinstance(mapping, Mapping):
            issues.append(SeedIssue(context, (field,), "INVALID_AREA_MAPPING", "Area mapping values must be dictionaries."))
            continue
        for key, area in mapping.items():
            if not _nonblank(key):
                issues.append(SeedIssue(context, (field,), "INVALID_AREA_KEY", "Area mapping keys must be nonblank strings."))
                continue
            normalized_key = normalize_building(key) if field == "buildings" else key
            if normalized_key in normalized:
                issues.append(SeedIssue(context, (field, key), "DUPLICATE_AREA_BUILDING", "Building aliases must not produce duplicate area keys."))
            if not isinstance(area, str) or area not in APPROVED_AREAS:
                issues.append(SeedIssue(context, (field, key), "UNKNOWN_AREA", "Area must belong to the approved vocabulary."))
            if field == "seed_overrides" and key not in known_keys:
                issues.append(SeedIssue(context, (field, key), "UNKNOWN_SEED_OVERRIDE", "Override must reference a manifest seed key."))
            normalized[normalized_key] = area
    return result["buildings"], result["seed_overrides"]


def load_seed_source(
    csv_path: str | PathLike[str],
    manifest=DEFAULT_SEED_ROOT / "manifest.json",
    area_mapping=DEFAULT_SEED_ROOT / "area_mapping.json",
) -> SeedSourceResult:
    """Validate all inputs and match only unique name/building associations.

    JSON arguments may be paths or loaded values. The function never modifies
    them, generates IDs, or interprets coordinates, categories, or opening times.
    """
    source = load_csv(csv_path)
    issues = list(source.issues)
    manifest_value, manifest_context = _load_json(manifest, "manifest", issues)
    area_value, area_context = _load_json(area_mapping, "area mapping", issues)
    entries = _manifest_entries(manifest_value, manifest_context, issues)
    buildings, overrides = _area_mapping(area_value, area_context, entries, issues)
    by_association, rows_by_association = defaultdict(list), defaultdict(list)
    for entry in entries:
        if entry[2] is not None:
            by_association[entry[2]].append(entry)
    for row in source.records:
        name, building = row.values.get("Name"), row.values.get("Building")
        if not _nonblank(name) or not _nonblank(building):
            issues.append(SeedIssue(row.file, ("Name", "Building"), "INVALID_SOURCE_MATCH",
                                    "Source row requires nonblank Name and Building.", row.row_number, name, building))
            continue
        rows_by_association[source_association(name, building)].append(row)
    matches = []
    for association, rows in rows_by_association.items():
        candidates = by_association.get(association, [])
        seed_key = candidates[0][1].get("seed_key") if len(candidates) == 1 else None
        seed_key = seed_key if _nonblank(seed_key) else None
        for row in rows:
            def row_issue(code, reason, fields=("Name", "Building")):
                issues.append(SeedIssue(row.file, fields, code, reason, row.row_number,
                                        row.values.get("Name"), row.values.get("Building"), seed_key))

            if len(rows) > 1:
                row_issue("REPEATED_SOURCE_ROW", "Multiple source rows have the same normalized name and building.")
            if not candidates:
                row_issue("UNMATCHED_SOURCE_ROW", "No manifest entry matches this source row.")
            elif len(candidates) > 1 or len(rows) > 1:
                row_issue("AMBIGUOUS_SOURCE_MATCH", "Association must contain exactly one source row and one manifest entry.")
            elif candidates[0][4] and row.valid_width:
                _, entry, _, identity, _ = candidates[0]
                area = overrides.get(seed_key, buildings.get(normalize_building(row.values["Building"])))
                if area is None:
                    row_issue("MISSING_AREA", "No reviewed area mapping applies to this source row.", ("Building", "area"))
                matches.append(MatchedSource(row, seed_key, identity, entry["correct_24_hours"], area))
    for _, entry, association, _, _ in entries:
        if association is not None and association not in rows_by_association:
            issues.append(SeedIssue(
                manifest_context, ("source_match",), "UNMATCHED_MANIFEST_ENTRY",
                "No source row matches this manifest entry.",
                source_name=entry["source_match"]["Name"], source_building=entry["source_match"]["Building"],
                seed_key=entry.get("seed_key") if _nonblank(entry.get("seed_key")) else None,
            ))
    # Attach a seed key to CSV width issues whenever the source association alone
    # identifies one manifest entry, even though that malformed row cannot match.
    for index, issue in enumerate(issues):
        if issue.file == str(csv_path) and issue.source_name is not None and issue.source_building is not None:
            candidates = by_association.get(source_association(issue.source_name, issue.source_building), [])
            if len(candidates) == 1 and _nonblank(candidates[0][1].get("seed_key")):
                issues[index] = replace(issue, seed_key=candidates[0][1]["seed_key"])
    return SeedSourceResult(tuple(matches), tuple(issues), len(source.records))


# Exact reviewed references, not filename-based URL matching.
IMAGE_KEYS = {
    "https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/ANNA.jpeg": "ANNA.jpeg",
    "https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/NUS_COOP.jpeg": "NUS_COOP.jpeg",
    "https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/PRINTER_COM2.jpeg": "PRINTER_COM2.jpeg",
    "https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/COOL_SPOT.jpeg": "COOL_SPOT.jpeg",
    "https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/INSTACHEF.jpeg": "INSTACHEF.jpeg",
    "https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/ROBOT_CAFE.jpeg": "ROBOT_CAFE.jpeg",
}


def resolve_image_reference(image_key, image_url, report):
    """Resolve portable filenames and exact legacy provenance, reporting all errors."""
    raw_key = image_key or ""
    key = raw_key.strip() or None
    url = (image_url or "").strip()
    # Restrict to portable ASCII filenames: no paths, URL syntax, percent escapes,
    # traversal sequences, spaces, or control characters (even at the edges).
    if key and (
        any(ord(char) < 32 or ord(char) == 127 for char in raw_key)
        or ".." in key
        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*\.(?i:jpe?g|png|webp|gif|avif|svg|bmp|ico|tiff?)", key)
    ):
        report(("ImageKey",), "INVALID_IMAGE_KEY",
               "ImageKey must be a filename with a common image extension (for example anna.webp), without paths, URLs, traversal, or control characters.")
    legacy_key = IMAGE_KEYS.get(url) if url else None
    if url and legacy_key is None:
        report(("ImageURL",), "UNKNOWN_IMAGE",
               "ImageURL must be one of the six reviewed GitHub URLs. For a new asset, put its filename in ImageKey and leave ImageURL blank; retain other provenance in review notes.")
    if key and legacy_key and key != legacy_key:
        report(("ImageKey", "ImageURL"), "CONFLICTING_IMAGE_REFERENCE",
               f"ImageURL maps to {legacy_key!r}, which does not match ImageKey {key!r}.")
    return key or legacy_key


CATEGORY_NAMES = frozenset({"Food", "Coffee", "Shopping", "Printing"})
_INVALID_SOURCE_TIME = object()
_SCALAR_SOURCE_FIELDS = {
    "name": "Name", "building": "Building", "floor": "Floor",
    "description": "Location Description", "image_key": "ImageKey",
    "location.latitude": "Latitude", "location.longitude": "Longitude",
    "opening_time": "StartingTime", "closing_time": "ClosingTime",
}


@dataclass(frozen=True)
class ParsedSeedRecord:
    source: SourceRecord
    seed_key: str
    supplier_id: UUID
    values: SupplierSeedResult
    category_names: tuple[str, ...]


@dataclass(frozen=True)
class ParsedSeedBatch:
    """An invalid batch exposes issues but never partially accepted records.

    Retain the loaded source snapshot for diagnostic reports without rereading
    CSV or mappings. Only records, when valid, are accepted import input.
    """

    records: tuple[ParsedSeedRecord, ...]
    issues: tuple[SeedIssue, ...]
    source: SeedSourceResult | None = None

    @property
    def valid(self) -> bool:
        return not self.issues


def _source_time(value: str | None):
    if value is None or not value.strip():
        return None
    text = value.strip()
    if re.fullmatch(r"[0-9]{4}hrs", text) is None:
        return _INVALID_SOURCE_TIME
    try:
        return time(int(text[:2]), int(text[2:4]))
    except ValueError:
        return _INVALID_SOURCE_TIME


def normalize_seed_source(source: SeedSourceResult) -> ParsedSeedBatch:
    """Normalize matches and collect issues before accepting the complete batch.

    Schedules are daily local wall-clock times in Asia/Singapore. Categories stay
    as controlled names; identity is copied from the manifest, never generated.
    Even if loading found issues, inspect all available unambiguous matches for
    independent normalization issues. No partial parsed records escape on failure.
    """
    issues = list(source.issues)
    records = []
    for match in source.matches:
        row = match.source.values
        row_issues = []

        def report(fields, code, reason):
            row_issues.append(SeedIssue(
                match.source.file, tuple(fields), code, reason, match.source.row_number,
                row.get("Name"), row.get("Building"), match.seed_key,
            ))

        categories = []
        for index, label in enumerate((row.get("Type") or "").split("/")):
            label = label.strip()
            if not label:
                report((f"Type.{index}",), "BLANK_CATEGORY", "Category labels must not be blank.")
            elif label not in CATEGORY_NAMES:
                report((f"Type.{index}",), "UNKNOWN_CATEGORY", "Use Food, Coffee, Shopping, or Printing.")
            elif label not in categories:
                categories.append(label)

        image_key = resolve_image_reference(row.get("ImageKey"), row.get("ImageURL"), report)

        opening = _source_time(row.get("StartingTime"))
        closing = _source_time(row.get("ClosingTime"))
        bad_time_fields = set()
        for field, value in (("StartingTime", opening), ("ClosingTime", closing)):
            if value is _INVALID_SOURCE_TIME:
                bad_time_fields.add(field)
                report((field,), "INVALID_SOURCE_TIME", "Use four digits HHMM followed by lowercase hrs, with hour 00–23 and minute 00–59.")
        if match.correct_24_hours and not bad_time_fields:
            if (opening, closing) != (time(0), time(23, 59)):
                report(("StartingTime", "ClosingTime"), "CHANGED_24_HOUR_PAIR", "Flagged source schedule must remain 0000hrs–2359hrs; review the changed pair.")
            else:
                closing = time(0)

        values = None
        try:
            values = validate_supplier_seed_values({
                "name": row.get("Name"), "area": match.area,
                "building": normalize_building(row.get("Building") or ""),
                "floor": row.get("Floor"), "description": row.get("Location Description"),
                "image_key": image_key,
                "location": {"latitude": row.get("Latitude"), "longitude": row.get("Longitude")},
                # The invalid sentinel deliberately fails shared time validation;
                # it is never converted to null or used to derive a schedule.
                "opening_time": opening, "closing_time": closing,
            })
        except DomainValidationError as error:
            for issue in error.errors:
                fields = tuple(_SCALAR_SOURCE_FIELDS.get(field, field) for field in issue.fields)
                if len(fields) == 1 and fields[0] in bad_time_fields:
                    continue  # Already reported the stricter source-format error.
                report(fields, issue.code, issue.message)
        issues.extend(row_issues)
        if not row_issues and values is not None:
            records.append(ParsedSeedRecord(match.source, match.seed_key, match.supplier_id, values, tuple(categories)))
    return ParsedSeedBatch(() if issues else tuple(records), tuple(issues), source)


def parse_seed_source(
    csv_path: str | PathLike[str],
    manifest=DEFAULT_SEED_ROOT / "manifest.json",
    area_mapping=DEFAULT_SEED_ROOT / "area_mapping.json",
) -> ParsedSeedBatch:
    """Load, match, and normalize reviewed seed input without side effects."""
    return normalize_seed_source(load_seed_source(csv_path, manifest, area_mapping))
