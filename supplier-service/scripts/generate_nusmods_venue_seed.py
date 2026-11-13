#!/usr/bin/env python3
"""Generate the audited NUSMods teaching-venue CSV and Flyway seed migration.

The Supplier database stores serviceable campus locations. This helper joins the
venue codes used in one NUSMods semester with the NUSMods coordinate catalogue.
Only venues with an exact coordinate entry are emitted; coordinates are never
inferred from another room or from a building centroid.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_ACADEMIC_YEAR = "2026-2027"
DEFAULT_SEMESTER = 1
DEFAULT_COORDINATES_SOURCE = (
    "https://raw.githubusercontent.com/nusmodifications/nusmods/"
    "master/website/api/optimiser/_constants/venues.json"
)
SEED_NAMESPACE = uuid.UUID("f00c0000-5eed-4cab-9000-000000000001")
MAX_REASONABLE_FLOOR = 20
MIN_REASONABLE_FLOOR = -10


@dataclass(frozen=True)
class TeachingVenue:
    supplier_id: uuid.UUID
    venue_code: str
    room_name: str
    building: str
    floor: str | None
    latitude: float
    longitude: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--academic-year", default=DEFAULT_ACADEMIC_YEAR)
    parser.add_argument("--semester", type=int, default=DEFAULT_SEMESTER)
    parser.add_argument(
        "--venues-source",
        help="Path or URL to the semester venues.json; defaults from academic year/semester",
    )
    parser.add_argument(
        "--coordinates-source",
        default=DEFAULT_COORDINATES_SOURCE,
        help="Path or URL to the NUSMods venue coordinate catalogue",
    )
    parser.add_argument("--output-csv", type=Path, required=True)
    parser.add_argument("--excluded-csv", type=Path, required=True)
    parser.add_argument("--output-sql", type=Path, required=True)
    return parser.parse_args()


def read_json(source: str) -> Any:
    if source.startswith(("https://", "http://")):
        request = urllib.request.Request(
            source,
            headers={"User-Agent": "Friend-on-Campus seed generator"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    with Path(source).open(encoding="utf-8") as source_file:
        return json.load(source_file)


def venue_source_url(academic_year: str, semester: int) -> str:
    return (
        f"https://api.nusmods.com/v2/{academic_year}/semesters/"
        f"{semester}/venues.json"
    )


def building_from_venue_code(venue_code: str) -> str:
    """Follow the NUSMods convention: the prefix before '-' is the building."""
    return venue_code.split("-", 1)[0]


def normalize_floor(raw_floor: Any) -> str | None:
    if raw_floor is None or isinstance(raw_floor, bool):
        return None
    if isinstance(raw_floor, float) and not raw_floor.is_integer():
        return None
    if not isinstance(raw_floor, (int, float)):
        return None
    floor = int(raw_floor)
    if floor < MIN_REASONABLE_FLOOR or floor > MAX_REASONABLE_FLOOR:
        return None
    return str(floor)


def build_venues(
    semester_venues: Any,
    coordinates: Any,
) -> tuple[list[TeachingVenue], list[tuple[str, str]]]:
    if not isinstance(semester_venues, list) or not all(
        isinstance(code, str) for code in semester_venues
    ):
        raise ValueError("semester venue source must be a JSON array of strings")
    if not isinstance(coordinates, dict):
        raise ValueError("coordinate source must be a JSON object keyed by venue code")

    emitted: list[TeachingVenue] = []
    excluded: list[tuple[str, str]] = []
    seen_codes: set[str] = set()

    for venue_code in sorted(semester_venues, key=str.casefold):
        if venue_code in seen_codes:
            excluded.append((venue_code, "Duplicate semester venue code"))
            continue
        seen_codes.add(venue_code)

        coordinate = coordinates.get(venue_code)
        if not isinstance(coordinate, dict):
            excluded.append((venue_code, "No exact coordinate entry"))
            continue
        location = coordinate.get("location")
        if not isinstance(location, dict):
            excluded.append((venue_code, "No exact coordinate entry"))
            continue

        longitude = location.get("x")
        latitude = location.get("y")
        if (
            isinstance(longitude, bool)
            or isinstance(latitude, bool)
            or not isinstance(longitude, (int, float))
            or not isinstance(latitude, (int, float))
        ):
            excluded.append((venue_code, "Invalid exact coordinates"))
            continue
        if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
            excluded.append((venue_code, "Coordinates outside valid ranges"))
            continue

        room_name = str(coordinate.get("roomName") or "NUS teaching venue").strip()
        building = building_from_venue_code(venue_code).strip()
        if not venue_code.strip() or not building:
            excluded.append((venue_code, "Blank required field"))
            continue
        if len(venue_code) > 255 or len(building) > 255:
            excluded.append((venue_code, "Value exceeds Supplier database length"))
            continue

        emitted.append(
            TeachingVenue(
                supplier_id=uuid.uuid5(SEED_NAMESPACE, f"nusmods:{venue_code}"),
                venue_code=venue_code,
                room_name=room_name,
                building=building,
                floor=normalize_floor(coordinate.get("floor")),
                latitude=float(latitude),
                longitude=float(longitude),
            )
        )

    return emitted, excluded


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql_nullable(value: str | None) -> str:
    return "NULL" if value is None else sql_string(value)


def write_csv(output: Path, venues: list[TeachingVenue]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(
            [
                "Id",
                "Name",
                "Type",
                "Building",
                "Floor",
                "Location Description",
                "Latitude",
                "Longitude",
                "Opening Time",
                "Closing Time",
                "Image URL",
                "Status",
                "Version",
            ]
        )
        for venue in venues:
            writer.writerow(
                [
                    venue.supplier_id,
                    venue.venue_code,
                    "Teaching Venue",
                    venue.building,
                    venue.floor or "",
                    venue.room_name,
                    format(venue.latitude, ".15g"),
                    format(venue.longitude, ".15g"),
                    "",
                    "",
                    "",
                    "ACTIVE",
                    0,
                ]
            )


def write_excluded_csv(output: Path, excluded: list[tuple[str, str]]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["Venue Code", "Exclusion Reason"])
        writer.writerows(excluded)


def write_sql(
    output: Path,
    venues: list[TeachingVenue],
    academic_year: str,
    semester: int,
    venues_source: str,
    coordinates_source: str,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"-- NUSMods teaching venues for AY {academic_year}, semester {semester}.",
        f"-- Semester source: {venues_source}",
        f"-- Coordinate source: {coordinates_source}",
        "-- Only semester venues with exact coordinate entries are included.",
        "-- Generated by supplier-service/scripts/generate_nusmods_venue_seed.py.",
        "INSERT INTO suppliers (",
        "    id, name, type, building, floor, location_description,",
        "    latitude, longitude, opening_time, closing_time, image_url, status, version",
        ")",
        "VALUES",
    ]
    values = []
    for venue in venues:
        values.append(
            "    ("
            + ", ".join(
                [
                    sql_string(str(venue.supplier_id)),
                    sql_string(venue.venue_code),
                    sql_string("Teaching Venue"),
                    sql_string(venue.building),
                    sql_nullable(venue.floor),
                    sql_string(venue.room_name),
                    format(venue.latitude, ".15g"),
                    format(venue.longitude, ".15g"),
                    "NULL",
                    "NULL",
                    "NULL",
                    sql_string("ACTIVE"),
                    "0",
                ]
            )
            + ")"
        )
    lines.append(",\n".join(values) + ";")
    output.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    venues_source = args.venues_source or venue_source_url(
        args.academic_year, args.semester
    )
    semester_venues = read_json(venues_source)
    coordinates = read_json(args.coordinates_source)
    venues, excluded = build_venues(semester_venues, coordinates)
    if not venues:
        raise ValueError("no exact-coordinate teaching venues were produced")

    write_csv(args.output_csv, venues)
    write_excluded_csv(args.excluded_csv, excluded)
    write_sql(
        args.output_sql,
        venues,
        args.academic_year,
        args.semester,
        venues_source,
        args.coordinates_source,
    )
    print(f"Generated {len(venues)} teaching venues; excluded {len(excluded)}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
