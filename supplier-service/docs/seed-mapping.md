<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-30
Scope: Refactoring and documentation improvements — document the confirmed coordinate-only identity check, controlled category lookup, duplicate expressions, whole-batch rejection, and read-only session contract.
Scope: Refactoring and documentation improvements — update future-import wording to the implemented workflow, document atomic and uncertain outcomes, shared advisory locking, preserved identities, and packaged command usage. (ai-20260930-012)
Author review: Keith confirmed review of all affected changes. Keith confirmed review of the packaging changes (ai-20260930-012).
Details: ../ai/usage-log.md; ai-20260930-009; ai-20260930-012
-->

# Supplier seed mapping

The source mapping was reviewed with the user on 26 September 2026. The
implemented explicit importer follows this mapping and the confirmed database
identity policy below. The CSV is primarily an initial source; reruns preserve
existing identities and administrator changes.

## Source and field mapping

Read root `data/csv/supplier-seed-data.csv` with explicit CP1252 encoding and
`csv.DictReader`, opening with `newline=""`. The inspected source has 21 rows,
11 columns (the original 10 plus optional ImageKey), six nonblank image references,
and five Food/Coffee entries.
Expected category assignments: Food 16, Coffee 5, Shopping 3, Printing 2;
26 assignments in total across four controlled categories.

| Source column | Destination and rule |
| --- | --- |
| Name | name; trim surrounding whitespace, preserve spelling/capitalization |
| Type | Split on `/`, trim, resolve controlled category names to IDs |
| Building | building; trim and apply reviewed aliases below |
| Floor | floor; keep text, including future basement labels |
| Location Description | description; trim; blank becomes null |
| Latitude | location.latitude; parse finite number, validate latitude range |
| Longitude | location.longitude; parse finite number, validate longitude range |
| StartingTime | opening_time; parse HHMMhrs as a local daily time |
| ClosingTime | closing_time; parse HHMMhrs, then apply reviewed exceptions |
| ImageURL (optional) | Match the six known references to image keys; blank becomes null |
| ImageKey (optional) | Portable image filename; if a legacy URL is also supplied, both must agree |

Normalize absent optional text to null. Construct PostGIS points longitude
first, latitude second. Retain source coordinates without rounding or guessed
corrections. The source lacks area, UUID, timestamps, version, and day offset;
area comes from the reviewed mapping, UUID from the manifest, timestamps and
version from creation, and offset from the resulting pair of times.

## Buildings and reviewed areas

Normalize Com 2 and Com2 to COM2, and Prince George’s Park to Prince George's
Park. Preserve other building labels after trimming. These aliases do not
rewrite supplier display names: Printer @ Com 2 retains that name.

The following table accounts for every source supplier. Ordinals are for
review only and must never become importer identities. Areas are user-reviewed
browsing groupings, not claims inferred from geographic coordinates. All current
rows can use a building mapping; future ambiguous buildings require explicit
seed-key overrides rather than guessing.

| Supplier | Normalized building | Area |
| --- | --- | --- |
| Anna's x Soup Union | Central Library | FASS |
| NUS Co-op | Central Library | FASS |
| Printer @ Com 2 | COM2 | SoC |
| Cool Spot | COM2 | SoC |
| InstaChef | Terrace | SoC |
| Cafe+ Robot Cafe | Central Library | FASS |
| A Hot Hideout | Prince George's Park | PGP |
| Arise and Shine | Engineering Block E4 | Engineering |
| Bakehaus / Aurea | The Ridge | SoC |
| Central Square @ YIH | Yusof Ishak House | YIH |
| Pasta Express | Frontier | Science |
| TOMORO COFFEE | Hon Sui Sen Memorial Library | BIZ |
| Octobox | Prince George's Park | PGP |
| Smooy | COM3 | SoC |
| Goh Bros E-Print Pte Ltd | Yusof Ishak House | YIH |
| Cheers Unmanned Convenience Store | Engineering Block E3 | Engineering |
| Nami | innovation4.0 | BIZ |
| Supersnacks | Prince George's Park | PGP |
| Good Day Cafe | Medicine+Science Library | Science |
| The Coffee Roaster | Blk AS8 | FASS |
| he by He Brews | Engineering Block EA | Engineering |

## Daily hours and reviewed corrections

All schedules apply every day, Monday–Sunday, in Asia/Singapore. This is an
explicit assumption because the source has no weekday information.
Supersnacks keeps 11:00–02:00 and derives closing_day_offset 1.

The user confirmed that these five source 0000hrs–2359hrs schedules mean
24-hour opening. For these records only, convert the parsed times to
00:00–00:00 and derive offset 1:

- Printer @ Com 2
- InstaChef
- Cafe+ Robot Cafe
- Octobox
- Cheers Unmanned Convenience Store

These exceptions are recorded by permanent seed key in the packaged manifest. Do not globally convert every 23:59 closing time.
The source CSV stays unchanged. Literal 00:00–23:59 is 23 hours 59 minutes;
conversion is justified by this review, not inferred from the time format.

After applying exceptions, use the shared rule: closing equal to or before
opening derives 1, otherwise 0. Both times absent produce unknown hours and
null offset; only one absent is invalid. Existing rows all have populated hours.

## Image mapping and deployment

Keep image files in root `data/images/`. Local Compose serves them through Nginx
with a read-only mount. See [image setup](../../data/images/README.md) for seed
validation, local startup, rebuild requirements, and CloudFront configuration.

| Supplier | Source filename / image_key |
| --- | --- |
| Anna's x Soup Union | ANNA.jpeg |
| NUS Co-op | NUS_COOP.jpeg |
| Printer @ Com 2 | PRINTER_COM2.jpeg |
| Cool Spot | COOL_SPOT.jpeg |
| InstaChef | INSTACHEF.jpeg |
| Cafe+ Robot Cafe | ROBOT_CAFE.jpeg |

Map the known CSV GitHub blob references explicitly to these files; do not
fetch arbitrary URLs or use GitHub HTML pages as image delivery URLs. The other
15 suppliers have null image_key. Reject unknown nonblank references for review.

Supplier Service stores and returns the filename key only. `ImageKey` accepts
case-preserving ASCII filenames starting with a letter or digit, using letters,
digits, `_`, `-`, and `.`, with jpeg/jpg, png, webp, gif, avif, svg, bmp, ico,
tif/tiff extensions (any case). Paths, URLs, traversal sequences, control
characters, and percent escapes are rejected. Surrounding spaces are trimmed;
blank or whitespace-only image fields mean no image. Either image column may
be omitted. With both populated, the exact legacy URL must map to the same key.
Unknown URLs are errors: use ImageKey alone for new assets and put provenance
in collector notes. Do not put storage-host URLs in supplier records.

Existing UUIDs with matching coordinates are still skipped. A seed edit does
not update their image_key; changing it requires a separately reviewed manual
database update against the existing manifest UUID. Never delete or reseed
suppliers to apply an image change.

## Permanent seed identities and explicit review

The packaged seed/manifest.json contains a permanent seed_key,
a random supplier_id generated once, and source_match containing Name and
Building. Use normalized name/building pairs to locate source rows: trim names
while preserving case/spelling, and apply the reviewed building aliases. This
matching is separate from lowercase duplicate detection in the database.
Require exactly one source row per manifest entry and one manifest entry per
source row. Row order is never an identity; never generate new UUIDs each run.

Illustrative shape (the packaged manifest already contains permanent UUIDs):

```json
{
  "seed_key": "supplier-001",
  "supplier_id": "<generate-once>",
  "source_match": {
    "Name": "Anna's x Soup Union",
    "Building": "Central Library"
  }
}
```

If a name/building changes beyond normalization, reject the unmatched source
and require explicit review. Update the association while keeping the seed key
and UUID when confirmed to be the same supplier. Do not guess from coordinates:
Anna's and Cafe+ Robot Cafe share a point. A reviewed source change does not
update an existing database supplier; existing seed UUIDs are skipped, including
deleted records, preserving later edits and category assignments.

## Dry run, atomicity, and acceptance

Validate the complete input and collect independently detectable issues before
writing. Any invalid row rejects the entire batch; never import only valid rows.
Insert missing identities and their categories in one transaction. Failures
before commit roll back the batch. A lost commit acknowledgement
has an unknown outcome; reconcile UUIDs or rerun the same idempotent input rather
than assuming no rows were saved. Apply the active-only duplicate policy and report
unexpected identity conflicts rather than overwriting existing records.

The implemented JSON report includes source count, validated count, category
counts/assignment total, reviewed hour corrections, and per-record issues with
seed key when matched, source name/building, field, and reason. Row numbers may
help diagnostics but are not identifiers. Database classification reports
proposed inserts, existing-identity skips (including deleted), and
conflicts. Dry run writes nothing and generates no permanent UUIDs. Invalid
input or conflicts produce a nonzero exit status.

Report missing/unapproved areas, missing columns, malformed coordinates/times,
unknown categories/images, unmatched or ambiguous source associations, repeated
seed keys/UUIDs, and database identity/active-duplicate conflicts. Existing
seed identities are expected skips, not conflicts merely because later edits
changed their values.

Import acceptance checks:

- All 21 rows map to reviewed areas; six image references resolve to six files.
- Fresh import produces 21 suppliers, four categories, and 26 assignments.
- Exactly the five reviewed records become 24-hour schedules; Supersnacks is overnight.
- Reordering source rows preserves identities; changed unmatched names fail review.
- Reimport preserves administrator edits and deleted records and adds no duplicates.
- One invalid row or a confirmed rollback leaves the whole batch unapplied;
  an uncertain commit is reported explicitly with unknown committed counts.
- Frontend asset delivery remains a separate integration task.

## Confirmed database classification policy

`app.services.seed_import.classify_seed_records(session, records)` accepts
validated `ParsedSeedRecord` objects and a caller-owned SQLAlchemy session.
It returns input-ordered insert, skip, or conflict decisions with seed key,
manifest UUID, original source record (file and physical row), reason, resolved
category IDs, and all independently detectable issues. If `result.valid` is
false, all decisions are diagnostic: reject the entire batch.

Resolve controlled category names from migrated database definitions. Missing
names produce contextual issues even for existing identities. Never create
categories or load migration constants as runtime IDs.

Look up UUIDs across active and deleted suppliers. Skip only when both immutable
coordinates match exactly at PostGIS point storage precision (double precision),
without rounding or proximity tolerances. Coordinate mismatches require review.
Editable fields and category assignments do not participate in the identity
check: preserve later renames, schedules, categories, and deletion state.

For missing UUIDs, compare `lower(btrim(name))` and exact longitude/latitude using
the same PostgreSQL expressions as `uq_supplier_active_name_location`. Deleted
matches do not block new identities. Different names at one point and equal
names at different points remain valid. Normalize proposed names in PostgreSQL
too, preserving its case and trimming rules. Mark every duplicate candidate in
a batch as conflicting, including candidates with other issues. Existing UUIDs
are not proposed inserts; their old seed values cannot cause phantom batch
duplicates. Persisted active values still participate in duplicate queries.

Classification only selects, disables autoflush, and never modifies ORM objects,
commits, rolls back, or closes the session. Pending caller changes are neither
flushed nor included in database classification. This preflight cannot prevent
concurrent inserts: the implemented transactional importer retains the unique
index and atomic transaction handling in decisions.md. Real imports acquire
transaction-scoped advisory lock `3219001` before reclassification and hold it
through commit or rollback. Waiting imports reclassify after acquiring the lock.

## Running the packaged command

Follow the [explicit import workflow](../README.md#explicit-seed-import) for
configuration, administrator bootstrap, migrations, runtime grants, JSON outcome
semantics, and isolated verification. From the repository root:

```bash
docker compose --profile tools config --quiet
docker compose build supplier-service
docker compose run --rm supplier-migrate
docker compose --profile tools run --rm supplier-seed --dry-run
docker compose --profile tools run --rm supplier-seed
```

The tools service mounts the root CSV read-only and uses packaged module-relative
metadata as the non-root application user. It waits for healthy PostgreSQL and
successful migrations, uses the runtime role, and publishes no ports. Both modes
require exact installed/package Alembic heads. Dry run uses a read-only database
transaction, generates no UUIDs, and is only a preview; imports reclassify under
the shared lock. Neither ordinary API startup nor migrations invoke the importer.
Reruns preserve administrator edits, assignments, timestamps, versions, and soft
deletion when UUID and immutable coordinates agree. Conflicts require review.
