-- AI declaration: Initially all functions were written by me, corrected some functions with AI

-- fts already exists from the earlier migration. Rebuild it so a null
-- Building or Location Description does not wipe the vector, and so Name
-- outranks the other fields.
drop index if exists posts_fts_idx;

alter table public."Supplier_Database" drop column if exists fts;

alter table public."Supplier_Database"
add column fts tsvector
generated always as (
  setweight(to_tsvector('english', coalesce("Name", '')), 'A')
  || setweight(to_tsvector('english', coalesce("Building", '')), 'B')
  || setweight(to_tsvector('english', coalesce("Location Description", '')), 'B')
) stored;

create index supplier_fts_idx on public."Supplier_Database" using gin (fts);

create or replace function public.search_suppliers(search_query text)
returns table (
  id bigint,
  "Name" text,
  "Type" text,
  "Building" text,
  "Floor" bigint,
  "Location Description" text,
  "Latitude" numeric,
  "Longitude" numeric,
  "StartingTime" text,
  "ClosingTime" text,
  "ImageURL" text,
  created_at timestamptz,
  updated_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id,
    "Name",
    "Type",
    "Building",
    "Floor",
    "Location Description",
    "Latitude",
    "Longitude",
    "StartingTime",
    "ClosingTime",
    "ImageURL",
    created_at,
    updated_at,
    ts_rank(fts, websearch_to_tsquery('english', search_query)) as rank
  from public."Supplier_Database"
  where deleted_at is null
    and search_query <> ''
    and fts @@ websearch_to_tsquery('english', search_query)
  order by rank desc;
$$;

create or replace function public.filter_suppliers_by_category(category text)
returns table (
  id bigint,
  "Name" text,
  "Type" text,
  "Building" text,
  "Floor" bigint,
  "Location Description" text,
  "Latitude" numeric,
  "Longitude" numeric,
  "StartingTime" text,
  "ClosingTime" text,
  "ImageURL" text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    id,
    "Name",
    "Type",
    "Building",
    "Floor",
    "Location Description",
    "Latitude",
    "Longitude",
    "StartingTime",
    "ClosingTime",
    "ImageURL",
    created_at,
    updated_at
  from public."Supplier_Database"
  where deleted_at is null
    and "Type" = category
  order by id;
$$;

grant execute on function public.search_suppliers(text) to anon, authenticated, service_role; -- might be a problem here!!!!!
grant execute on function public.filter_suppliers_by_category(text) to anon, authenticated, service_role;
