#!/bin/sh
# Parse campus_suppliers.json into Supplier_Database + supplier_opening_hours.
# Runs on first start of an empty volume. Testcontainers does not copy this file.
#
# Cloud / existing volume:
#   CAMPUS_SUPPLIERS_JSON=data/campus_suppliers.json \
#     DATABASE_URL=postgresql://... sh db/init/04_import_campus.sh
#
# Idempotent: skips names that already exist (including The Coffee Roaster in 03_seed.sql).

set -eu

json_file=""
for candidate in \
  "${CAMPUS_SUPPLIERS_JSON:-}" \
  /seed/campus_suppliers.json \
  /docker-entrypoint-initdb.d/campus_suppliers.json
do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    json_file=$candidate
    break
  fi
done

if [ -z "$json_file" ]; then
  echo "04_import_campus: campus_suppliers.json not found; skipping" >&2
  exit 0
fi

echo "04_import_campus: loading $json_file"

# One row; CSV delimiter/quote are ASCII controls that cannot appear in JSON.
one_line=$(mktemp)
tr -d '\n\t\r' < "$json_file" > "$one_line"

if [ -n "${DATABASE_URL:-}" ]; then
  set -- psql "$DATABASE_URL" -v ON_ERROR_STOP=1
else
  set -- psql -v ON_ERROR_STOP=1 --username "${PGUSER:-postgres}" --dbname "${POSTGRES_DB:-postgres}"
fi

"$@" <<SQL
CREATE TEMP TABLE campus_raw (doc text);
\\copy campus_raw FROM '$one_line' WITH (FORMAT csv, DELIMITER E'\\x1e', QUOTE E'\\x1f')

WITH payload AS (
  SELECT doc::jsonb AS doc FROM campus_raw
),
incoming AS (
  SELECT
    btrim(s->>'name') AS name,
    s->>'type' AS type,
    s->>'buildingName' AS building,
    COALESCE((s->>'floor')::integer, 1) AS floor,
    COALESCE(s->>'locationDescription', '') AS location_description,
    (s->>'latitude')::numeric(9,6) AS latitude,
    (s->>'longitude')::numeric(9,6) AS longitude,
    COALESCE(s->'openingHours', '[]'::jsonb) AS opening_hours
  FROM payload,
       jsonb_array_elements(payload.doc->'suppliers') AS s
  WHERE btrim(COALESCE(s->>'name', '')) <> ''
    AND btrim(s->>'name') <> 'The Coffee Roaster'
),
ins AS (
  INSERT INTO public."Supplier_Database" (
    "Name", "Type", "Building", "Floor", "Location Description",
    "Latitude", "Longitude"
  )
  SELECT
    name, type, building, floor, location_description, latitude, longitude
  FROM incoming
  ON CONFLICT ("Name") WHERE deleted_at IS NULL DO NOTHING
  RETURNING id, "Name"
),
ids AS (
  SELECT id, "Name" FROM ins
  UNION ALL
  SELECT s.id, s."Name"
  FROM public."Supplier_Database" s
  JOIN incoming i ON i.name = s."Name"
  WHERE s.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM ins WHERE ins."Name" = s."Name")
)
INSERT INTO public.supplier_opening_hours
  (supplier_id, day_of_week, opens_at, closes_at, is_closed)
SELECT
  ids.id,
  (h->>'dayOfWeek')::smallint,
  CASE WHEN COALESCE((h->>'isClosed')::boolean, false) THEN NULL ELSE NULLIF(h->>'opensAt', '')::time END,
  CASE WHEN COALESCE((h->>'isClosed')::boolean, false) THEN NULL ELSE NULLIF(h->>'closesAt', '')::time END,
  COALESCE((h->>'isClosed')::boolean, false)
FROM ids
JOIN incoming i ON i.name = ids."Name"
CROSS JOIN LATERAL jsonb_array_elements(i.opening_hours) AS h
ON CONFLICT (supplier_id, day_of_week) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public."Supplier_Database"', 'id'),
  (SELECT max(id) FROM public."Supplier_Database")
);
SQL

rm -f "$one_line"
