# Task: make `npm run scrape` accept real NUS suppliers

Paste everything below this line into a new Cursor Agent chat. Attach / @ the files listed.

---

You are finishing the supplier-service campus scraper. It already fetches pages and calls Anthropic. The last run still ended `accepted 0, rejected 5`. Do not start over. Fix extract/validate/geocode/sources until a local run writes real outlets.

## Goal

`cd supplier-service && npm run scrape` must write `data/out/YYYY-MM-DD/suppliers.json` with **accepted > 0** real coffee / food / print / small-retail outlets on or immediately around NUS Kent Ridge / UTown / PGP.

## Evidence from the last run (terminal)

```
browser …/kent-ridge/                         # no "queued" → bot-wall or HTTP fail
queued …/university-town/ (4732 chars)        # Playwright got text; Anthropic ran
queued …/retail-outlets-… (3268 chars)        # Playwright got text; Anthropic ran
browser …/pgpr.nus.edu.sg/…                   # no "queued" → bot-wall or HTTP fail
fetch OpenStreetMap around NUS                # no "Overpass named features" line → Overpass threw
extract university-town + retail-outlets      # claude-sonnet-4-5 deprecation warning
accepted 0, rejected 5
```

Rejected count 5 = Kent Ridge + PGP + Overpass + 2 extract batches. The two UCI pages that *did* queue still produced zero accepted rows. That is a Zod / tool-schema / hours / type / lat-lng problem, not “no page text”.

`data/out/` is gitignored. Dump files often vanish from the editor. **Log every reject reason to stderr** (`reject <source>: <reason>`). Also write `extract-N.json` (raw Anthropic tool input) next to `suppliers.json` / `rejected.json`.

## Files to read first

- `supplier-service/data/scraper.ts` — fetch (Playwright) → Overpass → Anthropic tool `submit_suppliers` → Zod `extractedSchema` → geocode via `buildings.json`
- `supplier-service/data/sources.json` — 4 UCI/PGP URLs
- `supplier-service/data/buildings.json` — building centroids (COM3/AS8/LT27 match seed coords)
- `supplier-service/docs/SCRAPE_PLAN.md` — contract
- `supplier-service/src/data/schema.ts` — `SUPPLIER_CATEGORY` = `food/coffee | printing | food | shopping | other`
- `supplier-service/.env` — `ANTHROPIC_API_KEY` already set; do not commit it
- `supplier-service/db/init/03_seed.sql` — existing seed shape (do **not** overwrite seed with scrape output)

## Hard constraints

- Do **not** invent shop names, hours, or coordinates.
- Do **not** scrape Google Maps / Instagram.
- Anthropic is the extractor only. Never call the API key if every fetch failed.
- Prefer official NUS pages + OpenStreetMap Overpass (ODbL). Around-campus = Overpass bbox, not made-up streets.
- Output is JSON under `data/out/YYYY-MM-DD/` (and CSV if you keep it). Not `db/init/03_seed.sql`.
- S3 is optional; `S3_BUCKET` unset is fine.

## Likely bugs (check these first)

1. Anthropic `tool_use.input` fails Zod: `latitude`/`longitude` as numbers, `floor` as string, `type` aliases (`cafe`), hours `09:00` vs `09:00:00`, `isClosed: true` with non-null times, missing dayOfWeek 0–6. There is a `coerceBatch` helper — extend it, don’t delete it.
2. Kent Ridge + PGP still hit a WAF (`page text too short` / NOINDEX). Need a real browser wait, different allowlisted NUS URLs, or accept those two as skipped if UTown + OSM produce rows.
3. Overpass 502 / timeout — retry other mirrors; log the HTTP status. OSM is the best around-campus source.
4. Default model `claude-sonnet-4-5` is deprecated. Switch default to a current Sonnet (`ANTHROPIC_MODEL` override must still work).
5. Geocode: hint is already concatenated into the haystack, so UTown/Kent Ridge pages should resolve. Rows still missing coords after that get rejected — don’t invent lat/lng.

## Definition of done

- `npm run scrape` exits 0.
- `accepted` ≥ 5 real named outlets (UTown food/retail and/or OSM cafes/copyshops).
- Every accepted row has name, valid `type`, building, floor, lat/lng, 7 opening-hour days, `sourceUrl`.
- Stderr lists each reject. `rejected.json` exists on disk after the run.
- No Google Maps. No fake suppliers. Seed SQL untouched.
- Re-run does not duplicate names (seen-set stays).

## How to run

```bash
cd supplier-service
npx playwright install chromium   # already done once
npm run scrape
```

If you change extract logic, you may replay `data/out/YYYY-MM-DD/extract-*.json` instead of spending the API key again. If those files are missing, one live run is OK.

## Out of scope

CI, S3, importing into Postgres, lint, messaging.
