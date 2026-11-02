import csv
from pathlib import Path

csv_path = Path(r"C:\Users\varun\Downloads\delivery-points.csv")
out_path = Path(__file__).resolve().parents[1] / "src/main/resources/db/migration/V6__delivery_points.sql"

rows = list(csv.DictReader(csv_path.open(encoding="utf-8-sig")))


def esc(value: str) -> str:
    return value.replace("'", "''")


lines = [
    "-- Delivery points catalogue + per-user usage; extend order dropoff snapshot.",
    "",
    "CREATE TABLE delivery_point (",
    "    id BIGSERIAL PRIMARY KEY,",
    "    code TEXT,",
    "    name TEXT NOT NULL,",
    "    building TEXT NOT NULL,",
    "    description TEXT NOT NULL,",
    "    latitude DOUBLE PRECISION NOT NULL,",
    "    longitude DOUBLE PRECISION NOT NULL,",
    "    active BOOLEAN NOT NULL DEFAULT TRUE",
    ");",
    "",
    "CREATE UNIQUE INDEX delivery_point_code_uidx ON delivery_point (code) WHERE code IS NOT NULL;",
    "",
    "CREATE TABLE user_delivery_point (",
    "    user_id VARCHAR(320) NOT NULL,",
    "    delivery_point_id BIGINT NOT NULL,",
    "    use_count INTEGER NOT NULL DEFAULT 1,",
    "    last_used_at TIMESTAMPTZ NOT NULL,",
    "    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
    "    PRIMARY KEY (user_id, delivery_point_id)",
    ");",
    "",
    "CREATE INDEX user_delivery_point_point_idx ON user_delivery_point (delivery_point_id);",
    "CREATE INDEX user_delivery_point_user_usage_idx ON user_delivery_point (user_id, use_count DESC, last_used_at DESC);",
    "",
    "ALTER TABLE orders",
    "    ADD COLUMN dropoff_building VARCHAR(200) NOT NULL DEFAULT '',",
    "    ADD COLUMN dropoff_description VARCHAR(500) NOT NULL DEFAULT '';",
    "",
    "ALTER TABLE orders",
    "    ALTER COLUMN dropoff_building DROP DEFAULT,",
    "    ALTER COLUMN dropoff_description DROP DEFAULT;",
    "",
    "INSERT INTO delivery_point (id, code, name, building, description, latitude, longitude, active) VALUES",
]

values = []
for i, row in enumerate(rows, start=1):
    values.append(
        "({id}, '{code}', '{name}', '{building}', '{description}', {lat}, {lng}, TRUE)".format(
            id=i,
            code=esc(row["Id"]),
            name=esc(row["Name"]),
            building=esc(row["Building"]),
            description=esc(row["Location Description"]),
            lat=row["Latitude"],
            lng=row["Longitude"],
        )
    )

lines.append(",\n".join(values) + ";")
lines.append("")
lines.append("SELECT setval(pg_get_serial_sequence('delivery_point', 'id'), (SELECT MAX(id) FROM delivery_point));")
lines.append("")

out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"wrote {out_path} with {len(rows)} seed rows")
