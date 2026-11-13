-- At most one photo per supplier, with a small copy for lists. The browser
-- shrinks both before it sends them. They sit in a table of their own, so that
-- listing suppliers never reads their bytes.
CREATE TABLE supplier_photos (
  supplier_id    UUID PRIMARY KEY REFERENCES suppliers (id) ON DELETE CASCADE,
  photo          BYTEA NOT NULL CHECK (octet_length(photo) BETWEEN 1 AND 1048576),
  photo_type     TEXT NOT NULL CHECK (photo_type IN ('image/jpeg', 'image/png', 'image/webp')),
  thumbnail      BYTEA NOT NULL CHECK (octet_length(thumbnail) BETWEEN 1 AND 262144),
  thumbnail_type TEXT NOT NULL CHECK (thumbnail_type IN ('image/jpeg', 'image/png', 'image/webp')),
  -- Changes with every new photo, so a link that carries it can be cached for good.
  version        TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An account identifier from the User Service. Null for the seed photos.
  updated_by     TEXT
);

-- Seed steps that run once per database and never again, such as adding the
-- seed photos, which an administrator may remove later.
CREATE TABLE seed_runs (
  name   TEXT PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
