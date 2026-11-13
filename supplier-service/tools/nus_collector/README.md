# NUS supplier collector

Collect official NUS listings, correct them in a CSV, inspect source evidence in
an HTML report, and export a separate seed bundle. Collection, review, validation,
and export do not access the database. Run one collector process per dataset at
a time. No Supplier API or schedule schema changes are required.

## Setup and collection

From `supplier-service`:

```sh
.venv/bin/python -m pip install -r requirements-collector.txt
.venv/bin/python -m tools.nus_collector collect --dataset ../data/seeds/nus
```

Sources are explicitly configured in `sources.py`:

- [Kent Ridge dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/)
- [UTown dining](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/university-town/)
- [NUS retail](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/retail-outlets-in-kent-ridge-bukit-timah-and-university-town/)

Requests are sequential with 25-second timeouts and at most three attempts per
source. Each run saves HTML snapshots and URL/time/hash metadata. The parser
extracts outlet headings, locations, hours and source text; missing/unrecognized
location blocks and empty sources fail validation. Banks, salons, Kent Vale and
Bukit Timah locations are proposed exclusions. Food courts remain named listings;
individual stalls are not invented. Category suggestions always need review.

**Direct requests may return NUS bot-protection HTML with HTTP 200.** The tool
rejects this rather than reporting a successful empty collection. In that case,
open each source normally in your browser, wait for the listings, and save the
rendered page as UTF-8 HTML (not PDF or MHTML). Put the three files in a directory
named `kent-ridge.html`, `utown.html`, and `retail.html`, then run:

```sh
.venv/bin/python -m tools.nus_collector collect --dataset ../data/seeds/nus --snapshots /path/to/saved-pages
```

Saved collection snapshots under `raw/<run-id>/` can also be passed back through
`--snapshots` for reproducible offline reprocessing. Snapshot timestamps record
when the tool read the saved files, not when the browser originally downloaded
them. Every source must parse successfully before export. A failed refresh keeps
previous candidates and review edits, marks the latest collection incomplete,
and blocks export. Source changes reset approval; they never overwrite edits.

The tests use explicitly synthetic HTML fixtures modeled on directory headings
and labels. These are not collected supplier data. A successful test run is not
proof that NUS has retained the same live markup; inspect each real report.

## Review and correct

Open `report.html` in a browser, and open `review.csv` in a spreadsheet or editor.
The report is static, self-contained, and escapes source text. Each record shows
proposed fields, source text, the official source link, potential existing matches,
and validation issues. Edit the CSV and regenerate the report to see corrections.
Keep the UTF-8 CSV headers and candidate IDs unchanged. Do not delete review rows;
exclude unwanted records with a reason instead. Preserve latitude/longitude as
text if your spreadsheet application would round them.

For every record you want to import:

1. Correct `Name`, `Building`, `Floor`, and optional `Location Description`.
2. Confirm `Type`: `Food`, `Coffee`, `Shopping`, or `Printing`, separated by `/`
   for multiple categories. Tea/drinks listings are not automatically Coffee.
3. Set `area` to one of Engineering, FASS, SoC, BIZ, PGP, Science, USC/UHC,
   UTown, YIH, YST, or KR/NUH. Area is a reviewed browsing group, not inferred from
   coordinates. Use the report/source to confirm the building association.
4. Verify the outlet on the [NUS map](https://map.nus.edu.sg/) or another map.
   Enter `Latitude`, `Longitude`, `coordinate_verified=yes`,
   `coordinate_precision=outlet` or `building`, and an HTTPS `coordinate_source`.
   A building point requires notes acknowledging that approximation. Do not
   automatically copy a neighbouring supplier's coordinates.
5. Choose `hours_policy`: `unknown` leaves both seed time fields blank; `daily`
   records a true daily schedule; `approximation` requires notes explaining your
   explicit simplification. Preserve `HHMMhrs` format. Use `0000hrs` in both fields
   for 24 hours; an overnight interval such as `1100hrs`–`0200hrs` is supported.
   Weekday, holiday, vacation, split-session, and last-order text remains in source
   evidence. Complex source schedules require notes before claiming daily hours.
6. Enter an optional `ImageKey` filename for a known asset in `data/images/`.
   Leave image fields blank when no image is known. `ImageURL` may retain one of
   the six exact legacy GitHub references as provenance; if both fields are
   supplied they must resolve to the same filename. Put other image evidence in
   notes. See [image setup](../../../data/images/README.md). Image keys survive
   collection refreshes and are included in reports, validation, seed CSVs, and
   review provenance. Older review files without `ImageKey` remain readable and
   gain a blank column on the next collection refresh.
7. Resolve suggested existing matches. Confirmed original suppliers must be
   excluded from this additional dataset. A distinct branch requires
   `duplicate_resolution=distinct` and supporting notes. Similar names are
   suggestions, not automatic identity matches. Also inspect potential renames
   yourself: fuzzy matching cannot prove that two listings are different.
8. Set `decision=approved`, `reviewer`, ISO `reviewed_at` (e.g. `2026-11-10`),
   and an `evidence_url`. Otherwise keep `pending`, or set `excluded` with
   `exclusion_reason`. Review the complete source even when fields were proposed.

The validator checks structure and evidence acknowledgements; it cannot prove a
map point, business status or published schedule is correct. Use operator websites
or an on-site check when sources conflict, and put the supporting URL in the
review CSV. The HTML report retains the originally collected text for comparison.

```sh
.venv/bin/python -m tools.nus_collector report --dataset ../data/seeds/nus
.venv/bin/python -m tools.nus_collector validate --dataset ../data/seeds/nus
.venv/bin/python -m tools.nus_collector export --dataset ../data/seeds/nus
```

`report` writes HTML and `validation.json`; `validate` prints JSON without writing.
Both return nonzero for blocking issues. `collect` returns success when all three
sources parsed, even if review is still pending; its report includes curation
issues. Pending/excluded records are omitted from export. An invalid approved
record, incomplete collection, or zero approved records blocks export.

Offline validation uses the existing pure seed parser: categories, areas,
coordinates, daily time relationships, CSV encoding, manifest associations, and
all other scalar rules are checked before publication. Unrepresentable CP1252
characters require explicit correction rather than automatic replacement.
`--baseline PATH` can select another original CP1252 seed CSV on every command;
use the same baseline consistently. Previous exported records are also checked.

## Stable identities, refreshes and source changes

Permanent UUIDs are allocated once at first export and saved in `identities.json`
before publication. Keep this file, including entries no longer exported. Review
row order has no effect. Validation uses temporary deterministic identities and
never allocates permanent UUIDs. Exports write a fresh version directory and
atomically switch the relative `bundle` symlink, so failed validation leaves the
previous bundle selected. Keep `exports/` and `bundle` together.

A changed source resets approval while preserving corrections. A disappeared
listing stays pending; disappearance does not delete anything from the database.
A rename/location-text change creates a new candidate pending manual identity
review. If it is the same outlet, create `associations.json` in the dataset:

```json
{
  "new-extracted-candidate-id": "previous-candidate-id"
}
```

Use IDs shown in `review.csv`/`collection.json`, then rerun collection against the
same snapshots. The association must remain within the same source; ambiguous
matches are rejected. The old candidate ID and permanent UUID are retained.
Update the display fields in review.csv explicitly, add notes, and approve again.
The superseded extracted row remains visible if it previously entered review;
mark it excluded with a reason. Do not edit candidate IDs directly.

Changed coordinates for an exported identity block export. Reconcile the stored
immutable location and identity with an administrator before changing registry
metadata; never work around this by assigning another UUID. Reimport does not
update previously imported names/hours/categories: use Supplier administration
for those changes. There is no automatic synchronization, deletion or restoration.

## Database preview and import

The generated `bundle/` contains the exact ten-column CP1252 `suppliers.csv`,
permanent `manifest.json`, approved `area_mapping.json`, and review provenance.
The original seed importer accepts optional `--manifest` and `--area-mapping`
paths; omitted options still select its original packaged metadata.

After normal database configuration, bootstrap, grants and migrations, run from
the repository root:

```sh
docker compose --profile tools config --quiet
docker compose build supplier-service
docker compose --profile tools run --rm supplier-seed-nus --dry-run
docker compose --profile tools run --rm supplier-seed-nus
```

The separate tools service mounts the complete dataset read-only so relative
bundle links resolve. The existing `supplier-seed` service is unchanged. A local
alternative from `supplier-service`, with existing database environment configured:

```sh
.venv/bin/python -m app.commands.seed_suppliers \
  --file ../data/seeds/nus/bundle/suppliers.csv \
  --manifest ../data/seeds/nus/bundle/manifest.json \
  --area-mapping ../data/seeds/nus/bundle/area_mapping.json --dry-run
```

Inspect the read-only preview for migration readiness, insert/skip decisions,
immutable-coordinate mismatches and database duplicate conflicts. Offline
validation cannot detect every supplier already in your running database.
Actual imports retain the existing atomic whole-batch behavior and reclassify
under the importer lock. Repeated imports preserve existing identities and edits.

## Verification

Install `requirements-dev.txt` (includes the optional collector dependency), then
run `python -m pytest tests/unit`. Collector tests cover sources, conservative
hours, exclusions, evidence checks, encoding, refresh failures, source changes,
identity reconciliation, stable exports and existing parser round-trips. Existing
seed command tests also cover explicit metadata paths. Database integration tests
retain the repository's isolated PostgreSQL setup described in the service README.
