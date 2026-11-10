# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
# Tool: ChatGPT (Codex, model: GPT-6), date: 2026-11-10
# Scope: Generated and refined the Supplier CSV-to-SQL seed importer and repeatable seed SQL.
# Author review: I validated correctness, and added boundary checks.

"""Generate the Supplier Service's local Supabase seed from the source CSV."""

from __future__ import annotations

import argparse
import csv
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
CSV_PATH = SERVICE_DIR.parent / "data/csv/supplier-seed-data.csv"
SEED_PATH = SERVICE_DIR / "supabase/seed.sql"
# ImageURL stays in the expected headers so the shared CSV is still checked,
# but the seed leaves image_url NULL because the app does not handle images.
HEADERS = (
    "Name",
    "Type",
    "Building",
    "Floor",
    "Location Description",
    "Latitude",
    "Longitude",
    "StartingTime",
    "ClosingTime",
    "ImageURL",
)
SUPPORTED_CATEGORIES = {
    "FOOD",
    "COFFEE",
    "SHOPPING",
    "PRINTING",
    "LANDMARK",
    "OTHERS",
}
TIME_PATTERN = re.compile(r"([01][0-9]|2[0-3])([0-5][0-9])hrs\Z")


def sql_text(value: str | None) -> str:
    if value is None:
        return "NULL"
    if "\x00" in value:
        raise ValueError("SQL text cannot contain a NUL byte")
    return "'" + value.replace("'", "''") + "'"


def required(row: dict[str, str], field: str, line: int) -> str:
    value = row[field].strip()
    if not value:
        raise ValueError(f"CSV line {line}: {field} is required")
    return value


def coordinate(row: dict[str, str], field: str, limit: int, line: int) -> str | None:
    value = row[field].strip()
    if not value:
        return None
    try:
        number = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f"CSV line {line}: invalid {field}") from exc
    if not number.is_finite() or abs(number) > limit or number.as_tuple().exponent < -9:
        raise ValueError(f"CSV line {line}: invalid {field}")
    return value


def operating_time(row: dict[str, str], field: str, line: int) -> str | None:
    value = row[field].strip()
    if not value:
        return None
    match = TIME_PATTERN.fullmatch(value)
    if match is None:
        raise ValueError(f"CSV line {line}: expected HHMMhrs in {field}")
    return f"{match[1]}:{match[2]}"


def normalized(value: str | None) -> str:
    return " ".join((value or "").lower().split())


def load_suppliers() -> list[dict[str, object]]:
    suppliers: list[dict[str, object]] = []
    identities: set[tuple[str, str, str]] = set()
    # The provided CSV uses Windows-1252, including curly apostrophes.
    with CSV_PATH.open(encoding="cp1252", newline="") as source:
        reader = csv.DictReader(source)
        if tuple(reader.fieldnames or ()) != HEADERS:
            raise ValueError(f"Unexpected CSV headers in {CSV_PATH}")
        for line, row in enumerate(reader, start=2):
            name = required(row, "Name", line)
            building_area = required(row, "Building", line)
            pickup_description = required(row, "Location Description", line)
            floor = row["Floor"].strip() or None
            categories = [part.strip().upper() for part in row["Type"].split("/")]
            if (
                not categories
                or len(categories) != len(set(categories))
                or any(category not in SUPPORTED_CATEGORIES for category in categories)
            ):
                raise ValueError(f"CSV line {line}: invalid supplier categories")

            latitude = coordinate(row, "Latitude", 90, line)
            longitude = coordinate(row, "Longitude", 180, line)
            if (latitude is None) != (longitude is None):
                raise ValueError(f"CSV line {line}: coordinates must be a pair")

            opening_time = operating_time(row, "StartingTime", line)
            closing_time = operating_time(row, "ClosingTime", line)
            if (opening_time is None) != (closing_time is None):
                raise ValueError(f"CSV line {line}: operating times must be a pair")

            identity = (normalized(name), normalized(building_area), normalized(floor))
            if identity in identities:
                raise ValueError(f"CSV line {line}: duplicate supplier identity")
            identities.add(identity)
            suppliers.append(
                {
                    "name": name,
                    "categories": categories,
                    "building_area": building_area,
                    "pickup_description": pickup_description,
                    "floor": floor,
                    "latitude": latitude,
                    "longitude": longitude,
                    "opening_time": opening_time,
                    "closing_time": closing_time,
                }
            )
    if not suppliers:
        raise ValueError("Supplier CSV is empty")
    return suppliers


def render_seed(suppliers: list[dict[str, object]]) -> str:
    lines = [
        "-- Supplier development data generated by scripts/generate_seed.py.",
        "-- Source: ../data/csv/supplier-seed-data.csv (Windows-1252).",
        "-- Location sources and data conventions: ../data/csv/README.md.",
        "-- Run the generator again after changing the CSV; do not edit this file by hand.",
        "-- Supabase also applies it on first local start and on local db reset.",
        "-- Existing normalized identities are skipped, preserving their IDs and admin edits.",
        "-- The CSV's ImageURL column is ignored; seeded suppliers have no image_url.",
        "BEGIN;",
        "",
        "DO $supplier_seed$",
        "DECLARE",
        "    inserted_supplier_id uuid;",
        "BEGIN",
    ]
    columns = (
        "name, building_area, pickup_location_description, floor, latitude, longitude, "
        "opening_time, closing_time"
    )
    for supplier in suppliers:
        values = [
            sql_text(supplier["name"]),
            sql_text(supplier["building_area"]),
            sql_text(supplier["pickup_description"]),
            sql_text(supplier["floor"]),
            supplier["latitude"] or "NULL",
            supplier["longitude"] or "NULL",
            sql_text(supplier["opening_time"]),
            sql_text(supplier["closing_time"]),
        ]
        lines.extend(
            [
                f"    -- {supplier['name']}",
                f"    INSERT INTO supplier_service.suppliers ({columns})",
                f"    VALUES ({', '.join(values)})",
                "    ON CONFLICT DO NOTHING",
                "    RETURNING id INTO inserted_supplier_id;",
                "    IF inserted_supplier_id IS NOT NULL THEN",
                "        INSERT INTO supplier_service.supplier_categories "
                "(supplier_id, category_code)",
                "        VALUES "
                + ", ".join(
                    f"(inserted_supplier_id, {sql_text(category)})"
                    for category in supplier["categories"]
                )
                + ";",
                "    END IF;",
                "",
            ]
        )
    lines.extend(["END;", "$supplier_seed$;", "", "COMMIT;", ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if seed.sql is stale")
    args = parser.parse_args()
    suppliers = load_suppliers()
    output = render_seed(suppliers)
    if args.check:
        if not SEED_PATH.exists() or SEED_PATH.read_text(encoding="utf-8") != output:
            raise SystemExit(f"{SEED_PATH} is missing or stale; regenerate it")
        print(f"Seed is current: {len(suppliers)} suppliers")
    else:
        SEED_PATH.write_text(output, encoding="utf-8")
        print(f"Wrote {SEED_PATH}: {len(suppliers)} suppliers")


if __name__ == "__main__":
    main()
