### AI declaration 1st Nov 2026 - Grok usage for NUS supplier scraper

### Why did I use AI?
- Wiring Anthropic tool-use, Overpass, CSV, and optional S3 is boilerplate.
- I wanted the script to follow `docs/SCRAPE_PLAN.md` instead of inventing a Google Maps scrape.

### Prompt

```
write a scraper script to retrieve NUS based cofee shops, printers, food locations, and small businesses. Look at something around nus too

This should call an anthropic API to fill in the csv data according to SCAPE_PLAN.md?

Should I just use google maps?
```

### What I decided
- Do not scrape Google Maps (ToS). Fetch official NUS UCI / PGP pages and OpenStreetMap around campus.
- Anthropic only extracts from text we already fetched.
- CSVs land in `data/out/YYYY-MM-DD/`. S3 upload is optional (`S3_BUCKET`).
