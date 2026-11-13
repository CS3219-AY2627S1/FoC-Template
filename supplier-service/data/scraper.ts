/*
CLI: browser-fetch allowlisted NUS pages + OpenStreetMap around campus,
ask Anthropic to extract suppliers, write JSON.

  npm run scrape

Anthropic is only called after at least one source has real page/OSM text.
Bot-walled or empty pages never touch the API key.
*/

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { config as loadEnv } from 'dotenv';
import { chromium, type Page } from 'playwright';
import { z } from 'zod';
import { SUPPLIER_CATEGORY } from '../src/data/schema';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../.env') });

const PAGE_GAP_MS = Number(process.env.SCRAPE_GAP_MS ?? 5000);
const PAGE_SETTLE_MS = Number(process.env.SCRAPE_SETTLE_MS ?? 2500);
const MIN_TEXT = 400;
const HTML_CHAR_CAP = 60_000;
const OSM_BATCH = 20;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BBOX = { south: 1.286, west: 103.764, north: 1.32, east: 103.792 };
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const daySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/).nullable(),
    closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/).nullable(),
    isClosed: z.boolean(),
  })
  .refine(
    (d) =>
      (d.isClosed && d.opensAt === null && d.closesAt === null) ||
      (!d.isClosed && d.opensAt !== null && d.closesAt !== null),
    { message: 'closed days need null times; open days need both times' },
  );

const extractedSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: SUPPLIER_CATEGORY,
    buildingName: z.string().trim().min(1),
    locationDescription: z.string().trim().min(1),
    floor: z.number().int(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    imageUrl: z.string().optional(),
    openingHours: z.array(daySchema).length(7),
  })
  .refine((s) => new Set(s.openingHours.map((h) => h.dayOfWeek)).size === 7, {
    message: 'openingHours must include each dayOfWeek 0-6 once',
    path: ['openingHours'],
  });

type Source = { url: string; kind: string; buildingHint: string };
type Building = { name: string; aliases: string[]; lat: string; lng: string };
type Extracted = z.infer<typeof extractedSchema>;
type Accepted = Extracted & { latitude: string; longitude: string; sourceUrl: string; fetchedAt: string };
type NormalizedHour = { dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean };
type Doc = { sourceUrl: string; hint: string; text: string };
type Rejection = { source: string; reason: string; raw?: unknown };

const TYPE_ALIASES: Record<string, string> = {
  cafe: 'food/coffee',
  coffee: 'food/coffee',
  'food/coffee': 'food/coffee',
  restaurant: 'food',
  canteen: 'food',
  food: 'food',
  copyshop: 'printing',
  printing: 'printing',
  printer: 'printing',
  convenience: 'shopping',
  shopping: 'shopping',
  retail: 'shopping',
  other: 'other',
};

function closedWeek(): NormalizedHour[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    opensAt: null,
    closesAt: null,
    isClosed: true,
  }));
}

function hhmmss(value: unknown): string | null {
  if (value == null || value === '') return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return String(value);
  return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}`;
}

function parseFloor(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const text = String(value ?? '').trim();
  const basement = text.match(/^B(\d+)$/i);
  if (basement) return -Number(basement[1]);
  if (/^(G|ground)$/i.test(text)) return 0;
  const match = text.match(/-?\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

function parseDay(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return Number.NaN;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const index = days.findIndex((day) => day.startsWith(text));
  return index >= 0 ? index : Number(text);
}

function coerceBatch(raw: unknown): unknown {
  const root = Array.isArray(raw) ? { suppliers: raw } : raw;
  if (!root || typeof root !== 'object' || !('suppliers' in root)) return raw;
  const suppliers = (root as { suppliers: unknown }).suppliers;
  if (!Array.isArray(suppliers)) return raw;
  return {
    suppliers: suppliers.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const record = row as Record<string, unknown>;
      const incoming = Array.isArray(record.openingHours) ? record.openingHours : [];
      const byDay = new Map<number, NormalizedHour>();
      for (const item of incoming) {
        if (!item || typeof item !== 'object') continue;
        const hour = item as Record<string, unknown>;
        const day = parseDay(hour.dayOfWeek ?? hour.day);
        if (!Number.isInteger(day) || day < 0 || day > 6) continue;
        const opensAt = hhmmss(hour.opensAt);
        const closesAt = hhmmss(hour.closesAt);
        const isClosed = hour.isClosed === true || opensAt === null || closesAt === null;
        byDay.set(day, {
          dayOfWeek: day,
          isClosed,
          opensAt: isClosed ? null : opensAt,
          closesAt: isClosed ? null : closesAt,
        });
      }
      const typeKey = String(record.type ?? '').trim().toLowerCase().replace(/\s+/g, '');
      return {
        name: String(record.name ?? '').trim(),
        type: TYPE_ALIASES[typeKey] ?? record.type,
        buildingName: String(record.buildingName ?? '').trim(),
        locationDescription: String(record.locationDescription ?? '').trim(),
        floor: parseFloor(record.floor),
        latitude: record.latitude == null || record.latitude === '' ? undefined : String(record.latitude),
        longitude: record.longitude == null || record.longitude === '' ? undefined : String(record.longitude),
        imageUrl: record.imageUrl == null || record.imageUrl === '' ? undefined : String(record.imageUrl),
        openingHours: Array.from({ length: 7 }, (_, day) => byDay.get(day) ?? closedWeek()[day]),
      };
    }),
  };
}

function noteReject(rejected: Rejection[], item: Rejection) {
  rejected.push(item);
  console.error(`reject ${item.source}: ${item.reason.replace(/\s+/g, ' ').slice(0, 280)}`);
}

const TOOL: Anthropic.Tool = {
  name: 'submit_suppliers',
  description: 'Return every coffee / food / print / small-retail outlet found in the text.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['suppliers'],
    properties: {
      suppliers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'type',
            'buildingName',
            'locationDescription',
            'floor',
            'openingHours',
          ],
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['food/coffee', 'printing', 'food', 'shopping', 'other'] },
            buildingName: { type: 'string' },
            locationDescription: { type: 'string' },
            floor: { type: 'integer' },
            latitude: { type: 'string' },
            longitude: { type: 'string' },
            imageUrl: { type: 'string' },
            openingHours: {
              type: 'array',
              minItems: 7,
              maxItems: 7,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['dayOfWeek', 'opensAt', 'closesAt', 'isClosed'],
                properties: {
                  dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
                  opensAt: { type: ['string', 'null'] },
                  closesAt: { type: ['string', 'null'] },
                  isClosed: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You extract NUS (and immediately-around-campus) suppliers for Friend on Campus.
Only include coffee, food, canteens, printers/copyshops, convenience stores, and small campus retail.
Skip ATMs, banks, carparks, bus stops, vending-only, and unnamed nodes.

Rules:
- type: food/coffee for cafes and drink stalls; food for canteens/restaurants; printing for copyshops; shopping for convenience/co-op; other otherwise.
- Do not infer a floor; use the floor stated in the source, with 0 for explicitly stated ground floor and negative numbers for basements.
- dayOfWeek 0=Sunday … 6=Saturday. Always return exactly seven days, each once.
- Missing hours → all seven days isClosed=true, opensAt/closesAt=null.
- "Mon–Fri 09:00–17:00" → days 1-5 open (HH:MM:SS), 0 and 6 closed.
- 24 hours → 00:00:00 to 23:59:59, isClosed=false every day.
- Never invent latitude/longitude. Copy them only if the source text already has numbers.
- Prefer term-time hours when both term and vacation are listed.
- Return suppliers=[] if the text is not an outlet list.`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBotWall(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (text.length < MIN_TEXT) return `page text too short (${text.length} chars)`;
  if (lower.includes('noindex') && lower.includes('nofollow')) return 'bot-wall / WAF interstitial';
  if (lower.includes('pardon our interruption') || lower.includes('access denied')) {
    return 'bot-wall / access denied';
  }
  return undefined;
}

function validCoord(lat?: string, lng?: string): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
}

function geocode(row: Extracted, buildings: Building[], hint: string): { lat: string; lng: string } | undefined {
  if (validCoord(row.latitude, row.longitude)) {
    return { lat: Number(row.latitude).toFixed(6), lng: Number(row.longitude).toFixed(6) };
  }
  const hay = `${row.buildingName} ${row.locationDescription} ${hint}`.toLowerCase();
  const hit = buildings.find(
    (b) => hay.includes(b.name.toLowerCase()) || b.aliases.some((a) => hay.includes(a)),
  );
  if (!hit) return undefined;
  return { lat: hit.lat, lng: hit.lng };
}

async function openPage(page: Page, url: string): Promise<{ status: number; text: string }> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(PAGE_SETTLE_MS);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, HTML_CHAR_CAP);
  return { status: response?.status() ?? 0, text };
}

async function fetchOverpass(): Promise<string> {
  const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const query = `[out:json][timeout:30];
(
  nwr["amenity"~"^(cafe|restaurant|fast_food|food_court|canteen|ice_cream)$"](${bbox});
  nwr["amenity"~"^(copyshop|printer)$"](${bbox});
  nwr["office"="copyshop"](${bbox});
  nwr["shop"~"^(convenience|stationery|copyshop|laundry|hairdresser|books)$"](${bbox});
);
out center tags;`;
  let lastError = 'Overpass failed';
  for (const url of OVERPASS_MIRRORS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) {
          lastError = `Overpass HTTP ${res.status} from ${url}`;
          await sleep(8_000 * attempt);
          continue;
        }
        const json = (await res.json()) as {
          elements?: Array<{
            tags?: Record<string, string>;
            lat?: number;
            lon?: number;
            center?: { lat: number; lon: number };
          }>;
        };
        const rows = (json.elements ?? [])
          .map((el) => {
            const tags = el.tags ?? {};
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            if (!tags.name || lat === undefined || lon === undefined) return null;
            return {
              name: tags.name,
              amenity: tags.amenity ?? tags.shop ?? '',
              cuisine: tags.cuisine ?? '',
              opening_hours: tags.opening_hours ?? '',
              lat,
              lon,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        return JSON.stringify(rows, null, 2);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await sleep(8_000 * attempt);
      }
    }
  }
  throw new Error(lastError);
}

async function collectDocuments(sources: Source[], rejected: Rejection[]): Promise<Doc[]> {
  const docs: Doc[] = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'en-SG' });
  const page = await context.newPage();

  try {
    for (const [index, source] of sources.entries()) {
      if (index > 0) {
        console.log(`waiting ${PAGE_GAP_MS}ms before next page`);
        await sleep(PAGE_GAP_MS);
      }
      console.log(`browser ${source.url}`);
      try {
        const { status, text } = await openPage(page, source.url);
        if (status >= 400) {
          noteReject(rejected, { source: source.url, reason: `HTTP ${status}` });
          continue;
        }
        const wall = isBotWall(text);
        if (wall) {
          noteReject(rejected, { source: source.url, reason: wall });
          continue;
        }
        console.log(`queued ${source.url} (${text.length} chars)`);
        docs.push({ sourceUrl: source.url, hint: source.buildingHint, text });
      } catch (err) {
        noteReject(rejected, { source: source.url, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`waiting ${PAGE_GAP_MS}ms before Overpass`);
  await sleep(PAGE_GAP_MS);
  try {
    console.log('fetch OpenStreetMap around NUS');
    const osm = await fetchOverpass();
    const features = JSON.parse(osm) as unknown[];
    console.log(`Overpass named features: ${features.length}`);
    if (features.length === 0) {
      noteReject(rejected, { source: 'overpass', reason: 'no named features' });
    } else {
      for (let i = 0; i < features.length; i += OSM_BATCH) {
        docs.push({
          sourceUrl: 'https://www.openstreetmap.org/#map=16/1.2966/103.7764',
          hint: 'NUS Kent Ridge / UTown / PGP fringe',
          text: JSON.stringify(features.slice(i, i + OSM_BATCH)),
        });
      }
    }
  } catch (err) {
    noteReject(rejected, { source: 'overpass', reason: err instanceof Error ? err.message : String(err) });
  }

  return docs;
}

async function extract(client: Anthropic, model: string, sourceLabel: string, text: string): Promise<unknown> {
  const msg = await client.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'submit_suppliers' },
    messages: [
      {
        role: 'user',
        content: `Source: ${sourceLabel}\n\nExtract suppliers from:\n${text}`,
      },
    ],
  });
  const tool = msg.content.find((block) => block.type === 'tool_use');
  if (!tool || tool.type !== 'tool_use') throw new Error(`Anthropic returned no tool_use for ${sourceLabel}`);
  return tool.input;
}

async function maybeUploadS3(date: string, files: Record<string, { body: string; type: string }>) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    console.log('S3_BUCKET unset; skipping upload');
    return;
  }
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const prefix = (process.env.S3_PREFIX ?? 'foc-supplier-scrape').replace(/\/$/, '');
  const client = new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
  for (const [key, file] of Object.entries(files)) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/curated/${date}/${key}`,
        Body: file.body,
        ContentType: file.type,
      }),
    );
    console.log(`uploaded s3://${bucket}/${prefix}/curated/${date}/${key}`);
  }
}

async function writeDump(outDir: string, accepted: Accepted[], rejected: Rejection[], fetchedAt: string) {
  await mkdir(outDir, { recursive: true });
  const payload = {
    fetchedAt,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    suppliers: accepted,
    rejected,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(path.join(outDir, 'suppliers.json'), json);
  await writeFile(path.join(outDir, 'rejected.json'), `${JSON.stringify(rejected, null, 2)}\n`);
  return json;
}

async function main() {
  const sources = JSON.parse(await readFile(path.join(here, 'sources.json'), 'utf8')) as Source[];
  const buildings = JSON.parse(await readFile(path.join(here, 'buildings.json'), 'utf8')) as Building[];
  const fetchedAt = new Date().toISOString();
  const date = fetchedAt.slice(0, 10);
  const outDir = path.join(here, 'out', date);
  const rejected: Rejection[] = [];

  const docs = await collectDocuments(sources, rejected);
  if (docs.length === 0) {
    await writeDump(outDir, [], rejected, fetchedAt);
    console.error('No usable pages or OSM data. Anthropic was not called.');
    console.error(`wrote ${path.join(outDir, 'rejected.json')}`);
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await writeDump(outDir, [], rejected, fetchedAt);
    throw new Error('Set ANTHROPIC_API_KEY in supplier-service/.env (fetches succeeded; key needed only for extract)');
  }

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  const client = new Anthropic({ apiKey });
  const accepted: Accepted[] = [];
  const seen = new Set<string>();
  await mkdir(outDir, { recursive: true });

  const ingest = (sourceUrl: string, hint: string, raw: unknown) => {
    const normalized = coerceBatch(raw);
    if (!normalized || typeof normalized !== 'object' || !('suppliers' in normalized)) {
      noteReject(rejected, { source: sourceUrl, reason: 'extractor response must contain a suppliers array', raw });
      return;
    }
    const candidates = (normalized as { suppliers: unknown }).suppliers;
    if (!Array.isArray(candidates)) {
      noteReject(rejected, { source: sourceUrl, reason: 'extractor suppliers field is not an array', raw });
      return;
    }
    if (candidates.length === 0) {
      noteReject(rejected, { source: sourceUrl, reason: 'extractor returned suppliers=[]' });
      return;
    }
    for (const [rowIndex, candidate] of candidates.entries()) {
      const parsed = extractedSchema.safeParse(candidate);
      if (!parsed.success) {
        noteReject(rejected, {
          source: sourceUrl,
          reason: `supplier ${rowIndex + 1}: ${parsed.error.message}`,
          raw: candidate,
        });
        continue;
      }
      const row = parsed.data;
      const key = row.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      const coords = geocode(row, buildings, hint);
      if (!coords) {
        noteReject(rejected, { source: sourceUrl, reason: `no lat/lng for ${row.name}`, raw: row });
        continue;
      }
      seen.add(key);
      accepted.push({
        ...row,
        latitude: coords.lat,
        longitude: coords.lng,
        sourceUrl,
        fetchedAt,
      });
    }
  };

  for (const [index, doc] of docs.entries()) {
    if (index > 0) await sleep(PAGE_GAP_MS);
    console.log(`extract ${doc.sourceUrl} (${doc.text.length} chars)`);
    try {
      const raw = await extract(client, model, doc.sourceUrl, doc.text);
      await writeFile(path.join(outDir, `extract-${index}.json`), `${JSON.stringify(raw, null, 2)}\n`);
      ingest(doc.sourceUrl, doc.hint, raw);
    } catch (err) {
      noteReject(rejected, { source: doc.sourceUrl, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const json = await writeDump(outDir, accepted, rejected, fetchedAt);
  const snapshotHash = createHash('sha256').update(json).digest('hex').slice(0, 12);
  await maybeUploadS3(date, {
    'suppliers.json': { body: json, type: 'application/json' },
    'rejected.json': { body: `${JSON.stringify(rejected, null, 2)}\n`, type: 'application/json' },
  });

  console.log(`accepted ${accepted.length}, rejected ${rejected.length}, hash ${snapshotHash}`);
  console.log(`wrote ${path.join(outDir, 'suppliers.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
