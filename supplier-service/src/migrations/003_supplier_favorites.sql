-- The suppliers each account keeps as favorites. account_id is the identifier
-- the User Service gives when it authorizes a request, so the user-service
-- stores nothing for this. The primary key also serves "the favorites of one
-- account", which is the only way they are looked up.
CREATE TABLE supplier_favorites (
  account_id  TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, supplier_id)
);
