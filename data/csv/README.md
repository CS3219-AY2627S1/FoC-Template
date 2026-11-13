# Supplier seed data

Supplier records represent serviceable campus pickup and drop-off locations, not only commercial
vendors. The seed data is split by source so that provenance and update cadence remain visible.

## Commercial locations

`supplier-seed-data-cleaned.csv` contains the original 21 food, coffee, printing and shopping
locations supplied with the project. `supplier-seed-data.csv` is retained unchanged as the raw
template input. The listings correspond to the services published by [NUS UCI Retail and
Dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/), but the CSV remains a
project snapshot: opening hours and outlet availability must be reviewed before a future refresh.

Flyway migration `V2__seed_suppliers.sql` embeds this dataset.

## Teaching venues

`supplier-teaching-venues-ay2026-2027-sem1.csv` is the audited AY 2026/27 Semester 1 teaching-venue
snapshot generated on 9 November 2026. It joins:

- the [NUSMods semester venue list](https://api.nusmods.com/v2/2026-2027/semesters/1/venues.json),
  which contains venue codes appearing in that semester's module timetable; and
- the NUSMods [venue coordinate catalogue](https://github.com/nusmodifications/nusmods/blob/master/website/api/optimiser/_constants/venues.json),
  which supplies room names, floors and exact coordinates.

The NUSMods repository is MIT-licensed. Its API documentation explains that semester venue lists
contain only locations used by lessons in that semester, so this is intentionally not described as
a comprehensive list of every NUS room.

The import rules are deliberately conservative:

- Only the 520 semester venues with an exact matching coordinate entry are seeded.
- The 79 unmatched venue codes are recorded in
  `supplier-teaching-venues-ay2026-2027-sem1-excluded.csv`; coordinates are never guessed from a
  nearby room or building centroid.
- Venue code is stored as the Supplier name, `Teaching Venue` as its type, the prefix before the
  first hyphen as its building, and the NUSMods room name as its location description.
- Missing floors remain null. The clearly invalid source floor `105` for `S13-M-08` is also left
  null rather than displayed as a real level.
- Hours and image URL remain null because the source does not define venue access hours or photos.
- IDs are deterministic UUIDv5 values based on venue code, and every imported row starts `ACTIVE`
  at version `0`.

Flyway migration `V3__seed_nusmods_teaching_venues.sql` embeds this snapshot. Existing databases
receive it automatically without changing the already-applied V2 migration.

Regenerate the snapshot with:

```sh
python3 supplier-service/scripts/generate_nusmods_venue_seed.py \
  --output-csv data/csv/supplier-teaching-venues-ay2026-2027-sem1.csv \
  --excluded-csv data/csv/supplier-teaching-venues-ay2026-2027-sem1-excluded.csv \
  --output-sql supplier-service/src/main/resources/db/migration/V3__seed_nusmods_teaching_venues.sql
```

Run the generator tests with:

```sh
python3 -m unittest discover supplier-service/scripts -p 'test_*.py'
```

Do not overwrite an applied Flyway migration when refreshing a later academic year or semester.
Generate a new reviewed CSV snapshot and add a new forward-only migration instead.
