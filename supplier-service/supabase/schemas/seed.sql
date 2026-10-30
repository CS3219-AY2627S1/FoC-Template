insert into public."Supplier_Database" (
    id,
    "Name",
    "Type",
    "Building",
    "Floor",
    "Latitude",
    "Longitude",
    "StartingTime",
    "ClosingTime",
    "ImageURL",
    deleted_at,
    created_at,
    updated_at
) values
    (
        1,
        'The Coffee Roaster',
        'food',
        'COM3',
        1,
        1.294167,
        103.773611,
        '08:00',
        '20:00',
        'https://example.com/suppliers/coffee-roaster.jpg',
        null,
        '2026-01-01 00:00:00+00',
        '2026-01-01 00:00:00+00'
    ),
    (
        2,
        'Central Print Shop',
        'printing',
        'AS8',
        2,
        1.295833,
        103.772222,
        '09:00',
        '18:00',
        'https://example.com/suppliers/central-print.jpg',
        null,
        '2026-01-02 00:00:00+00',
        '2026-01-02 00:00:00+00'
    ),
    (
        3,
        'Campus Bookstore',
        'bookstore',
        'LT27',
        1,
        1.296944,
        103.780556,
        '10:00',
        '19:00',
        'https://example.com/suppliers/campus-bookstore.jpg',
        '2026-03-01 00:00:00+00',
        '2026-01-03 00:00:00+00',
        '2026-03-01 00:00:00+00'
    );

select setval(
    pg_get_serial_sequence('public."Supplier_Database"', 'id'),
    (select max(id) from public."Supplier_Database")
);
-- seed data for testing purposes

insert into public.supplier_opening_hours
  (supplier_id, day_of_week, opens_at, closes_at, is_closed)
select s.id, d, '09:00', '17:00', false
from public."Supplier_Database" s
cross join generate_series(1, 6) as d
where s.deleted_at is null
on conflict (supplier_id, day_of_week) do nothing;
