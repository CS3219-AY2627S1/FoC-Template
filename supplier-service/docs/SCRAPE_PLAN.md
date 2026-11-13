# Plan: scrape campus suppliers → JSON (Anthropic)

Goal: produce a validated, reviewable snapshot of NUS suppliers under
`data/out/YYYY-MM-DD/`. Anthropic is the **extractor**, not the crawler.
S3 upload is optional; the scraper does not import data into Postgres.

## Why not scrape inside Claude

- Anthropic has no live-browser tool you should use as a production crawler.
- Pages change, pagination exists, and you need retries, robots, and hashes.
- Put Claude on **already-fetched HTML/text** so you can replay without
  re-paying for tokens.

## Pipeline

```text
allowlisted URLs
    → fetch official pages + OpenStreetMap
    → Claude extract (JSON matching Zod)
    → validate + geocode
    → suppliers.json + rejected.json + extract-N.json
    → optional S3 upload
    → (later) admin import into Postgres
```

### 1. Sources (allowlist only)

Start with official NUS pages you are allowed to reuse, for example:

- Faculty / UTown / PGP canteen stall lists
- NUS Maps / OSMnx-style POIs only if the licence allows redistribution
- Print shops, convenience stores on campus

Do **not** scrape Google Maps or Instagram at scale. Check each site’s
robots.txt and terms. Prefer pages that already list stall name + building.
For “around campus”, use OpenStreetMap Overpass (ODbL) or the official
Google Places API if you have a billed key — never Maps HTML.

Keep a `sources.json`:

```json
{ "url": "https://…", "kind": "canteen-list", "buildingHint": "COM1" }
```

### 2. Fetch

- The CLI uses Playwright for allowlisted pages and Overpass for nearby
  OpenStreetMap features; it does not scrape Google Maps or Instagram.
- Bot-walled or empty pages are rejected. Anthropic is not called if no usable
  source text was fetched.
- Raw Anthropic tool inputs are saved as `extract-N.json` for review/replay.

### 3. Anthropic extraction

Model: `claude-sonnet-4-6` by default, configurable with `ANTHROPIC_MODEL`,
using a **strict JSON schema**.

Prompt contract (one page or one stall block per call):

```ts
{
  name: string,                 // 1–100 chars
  type: "food" | "food/coffee" | "printing" | "shopping" | "other",
  buildingName: string,
  locationDescription: string,
  floor: number,
  latitude?: string,            // numeric 9,6 if the page has it
  longitude?: string,
  imageUrl?: string,
  openingHours: Array<{
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6,  // 0 = Sunday
    opensAt: string | null,     // HH:MM:SS
    closesAt: string | null,
    isClosed: boolean
  }>  // length 7, each day once
}
```

Rules in the system prompt:

- If hours are missing, set all seven days `isClosed: true`.
- If only “Mon–Fri 09:00–17:00”, fill 1–5 and close 0 and 6.
- Never invent lat/lng. Leave them empty; geocode later.
- Return `[]` if the page is not a stall list.

Use tool-use so the response is JSON, then validate each supplier with the
scraper schema (including seven distinct opening-hour days). Invalid rows are
rejected individually so one malformed result does not discard the whole page.

Batch: one canteen page → many stalls. Cap input tokens (strip nav/js).

### 4. Geocode gaps

For rows without coordinates: NUS building centroid table (COM1, COM3, AS8, …)
you maintain by hand, **not** a paid Maps API unless you have a key. Reject
rows still missing lat/lng.

### 5. Output

`suppliers.json` contains `fetchedAt`, `acceptedCount`, `rejectedCount`,
`suppliers`, and `rejected`. Each accepted supplier includes the source URL
and fetch time. `rejected.json` contains the rejection details, and each
`extract-N.json` preserves the raw extractor response.

The snapshot is for human review; it does not overwrite the seed SQL or write
to the live supplier database. CSV export can be added if a downstream import
workflow requires it.

### 6. S3 layout

Bucket (example): `foc-supplier-scrape` (ap-southeast-1).

```text
curated/2026-11-01/suppliers.json
curated/2026-11-01/rejected.json
```

IAM: scraper role can `s3:PutObject` on those prefixes only. No public ACL.
Versioning on. SSE-S3 is enough for class data.

Upload with `@aws-sdk/client-s3` (`PutObject`, `ContentType: application/json`).

### 7. Import later (out of this scrape)

Admin-only script: read the reviewed JSON → `createSupplierService` (or `COPY` into staging
then upsert on `"Name"` where `deleted_at IS NULL`). Do not write S3 from
the live API process.

## Cost / ops

- Cache raw HTML so you re-extract without re-fetching.
- Expect ~1–2k tokens per canteen page; a full campus pass is cheap on Sonnet.
- Store `ANTHROPIC_API_KEY` and AWS keys in env / secrets, never in the repo.
- Run as a one-off CLI (`npm run scrape` later), not in the CI image.

## Acceptance

- Every accepted supplier has valid coordinates, category, building, floor,
  source URL, and exactly seven distinct opening-hour days.
- Radius and FTS tests still pass after a sample import of 3–5 real stalls.
- Re-run is idempotent on `name` (no duplicate active names).
- Every row has `sourceUrl` so you can drop a source if ToS changes.

## Not in v1

- Live Anthropic calls from `supplier-service` request handlers.
- Google Maps scraping.
- Auto-publish to production without a human look at `rejected.jsonl`.
