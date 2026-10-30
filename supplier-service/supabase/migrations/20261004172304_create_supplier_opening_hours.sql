-- 1. Table
create table public.supplier_opening_hours (
  id           bigint generated always as identity primary key,
  supplier_id  bigint not null
               references public."Supplier_Database"(id) on delete restrict, --foreign key referencing parent
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  opens_at     time without time zone,
  closes_at    time without time zone,
  is_closed    boolean not null default false,
  created_at   timestamptz(3) not null default now(),
  updated_at   timestamptz(3) not null default now(),

  unique (supplier_id, day_of_week),
  check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null)
  )
);

-- fast lookups and joins by supplier
create index supplier_opening_hours_supplier_id_idx
  on public.supplier_opening_hours (supplier_id);

-- 2. updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = date_trunc('milliseconds', now());
  return new;
end;
$$;

create trigger supplier_opening_hours_set_updated_at
  before update on public.supplier_opening_hours
  for each row execute function public.set_updated_at();

-- 3. RLS: read, insert, update, never delete
alter table public.supplier_opening_hours enable row level security;

create policy "Anyone can read opening hours"
  on public.supplier_opening_hours for select
  using (true);

-- Placeholder: replace with your real ownership rule
create policy "Authenticated users can insert opening hours"
  on public.supplier_opening_hours for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update opening hours"
  on public.supplier_opening_hours for update
  to authenticated
  using (true)
  with check (true);

revoke delete on public.supplier_opening_hours from anon, authenticated;

-- manually populate with an LLM
