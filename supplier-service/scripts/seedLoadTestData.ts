/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
 * Scope: Phase 5 Task 3 step 1. Creates the existing schema (src/db/init.sql) in a separate MySQL test
 *        database and fills it with the team-specified 4,000 synthetic suppliers (with hours, categories
 *        and photo rows). Names include the word "errand" for a share of rows so the k6 search variant
 *        returns results. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen 
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

const SUPPLIERS = 4000;
const { DB_HOST = 'localhost', DB_PORT = '3399', DB_NAME = 'supplier_load_test', DB_USER = 'root', DB_PASSWORD } = process.env;
if (!DB_PASSWORD) throw new Error('DB_PASSWORD is required');

const admin = await mysql.createConnection({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD });
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
await admin.end();

const db = await mysql.createConnection({
  host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, database: DB_NAME, multipleStatements: true,
});
await db.query(readFileSync(resolve(import.meta.dirname, '../src/db/init.sql'), 'utf8'));

const [[existing]] = await db.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM supplier');
if (Number(existing?.n) > 0) throw new Error(`${DB_NAME} already has suppliers; use a fresh database`);

await db.query('INSERT INTO faculties (faculty) VALUES (?), (?)', ['Faculty A', 'Faculty B']);
const locationRows = Array.from({ length: 10 }, (_, i) => ['Location ' + (i + 1), (i % 2) + 1, i + 1]);
await db.query('INSERT INTO supplier_locations (location, faculty_id, level) VALUES ?', [locationRows]);
const categories = ['cleaning', 'food', 'printing', 'repair', 'stationery'];
await db.query('INSERT INTO supplier_categories (category_type) VALUES ?', [categories.map((c) => [c])]);

const words = ['errand', 'canteen', 'copy', 'laundry', 'courier'];
const suppliers: unknown[][] = [];
for (let i = 0; i < SUPPLIERS; i++) {
  // name + type + location is unique, so the index is part of every name
  suppliers.push([`${words[i % words.length]} supplier ${i + 1}`, i % 4 === 0 ? 'Facility' : 'Store', `Synthetic supplier ${i + 1}`, (i % 10) + 1, 'load-test']);
}
await db.query('INSERT INTO supplier (supplier_name, supplier_type, supplier_desc, location_id, created_by) VALUES ?', [suppliers]);

const [ids] = await db.query<mysql.RowDataPacket[]>('SELECT supplier_id, supplier_type FROM supplier ORDER BY supplier_id');
const maps: unknown[][] = [];
const hours: unknown[][] = [];
const photos: unknown[][] = [];
for (const [i, row] of ids.entries()) {
  const id = row.supplier_id as number;
  maps.push([id, (i % categories.length) + 1]);
  if (i % 3 === 0) maps.push([id, ((i + 1) % categories.length) + 1]);
  if (row.supplier_type === 'Store') {
    if (i % 5 === 0) hours.push([id, 8, '00:00:00', '23:59:00', 1]);
    else for (let day = 1; day <= 7; day++) hours.push([id, day, '08:00:00', '20:00:00', 0]);
  }
  for (let p = 0; p < 2; p++) photos.push([id, `http://photos.invalid/${id}/${p}.jpg`, p]);
}
const chunk = async (sql: string, rows: unknown[][]) => {
  for (let i = 0; i < rows.length; i += 2000) await db.query(sql, [rows.slice(i, i + 2000)]);
};
await chunk('INSERT INTO supplier_category_map (supplier_id, category_id) VALUES ?', maps);
await chunk('INSERT INTO supplier_hours (supplier_id, day_of_week, open_time, close_time, is_24h) VALUES ?', hours);
await chunk('INSERT INTO supplier_photos (supplier_id, photo_location, display_order) VALUES ?', photos);

console.log(`Seeded ${SUPPLIERS} suppliers, ${maps.length} category links, ${hours.length} hours rows, ${photos.length} photos into ${DB_NAME}`);
await db.end();
