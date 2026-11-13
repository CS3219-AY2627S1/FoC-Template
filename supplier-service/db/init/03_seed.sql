INSERT INTO public."Supplier_Database" (
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
) VALUES
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
        NULL,
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
        NULL,
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

SELECT setval(
    pg_get_serial_sequence('public."Supplier_Database"', 'id'),
    (SELECT max(id) FROM public."Supplier_Database")
);

INSERT INTO public.supplier_opening_hours
  (supplier_id, day_of_week, opens_at, closes_at, is_closed)
SELECT s.id, d, '09:00', '17:00', false
FROM public."Supplier_Database" s
CROSS JOIN generate_series(1, 6) AS d
WHERE s.deleted_at IS NULL
ON CONFLICT (supplier_id, day_of_week) DO NOTHING;
