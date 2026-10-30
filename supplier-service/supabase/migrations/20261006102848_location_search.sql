create extension if not exists postgis with schema "extensions";

/*
location is derived from "Latitude"/"Longitude" rather than replacing them: the API
contract, createSupplierSchema and the seed all still carry the numeric columns, and
PublicSupplier is built from getTableColumns(supplier), so dropping them would break
every other read route.

Generated always means the point stays correct on insert and update with no trigger
and no backfill, including rows the seed loads after this file runs. The expression is
schema-qualified because migrations run before "extensions" is on the search_path.
*/
alter table public."Supplier_Database"
    add column location extensions.geography(Point, 4326)
    generated always as (
        extensions.ST_SetSRID(
            extensions.ST_MakePoint("Longitude"::float8, "Latitude"::float8),
            4326
        )::extensions.geography
    ) stored;

-- ST_DWithin on a geography column measures in metres and uses this index
create index idx_supplier_location on public."Supplier_Database" using gist(location);
