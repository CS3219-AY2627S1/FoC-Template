-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
--  2026-09-26: Recess iteration - initial schema (balances, transaction_log).
--    Implements the team's recorded schema decisions in credit-service-context.md §5
--    and the field list in F20.1.1. Conventions (TIMESTAMPTZ NOW(), gen_random_uuid(),
--    snake_case, DO $$ enum idiom, CREATE TABLE IF NOT EXISTS) follow the team's
--    existing user-service/src/db/init.sql.
--    No requirements, architecture, schema, or API decisions were made by the AI tool.
--    Author review: Wee Jean
--  2026-10-22: Credit transfer consumer - dead_letter_jobs table for the BullMQ worker.
--    Columns mirror the sibling services'; snake_case per the team decision of
--    2026-10-22. No requirements, architecture, schema, or API decisions were made by
--    the AI tool.
--    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

-- ---------------------------------------------------------------------------
-- Transaction types (F20.1.1)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE transaction_type_enum AS ENUM ('allocation', 'reservation', 'transfer', 'release');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- balances
--
-- context §5: two columns per user, total_balance and reserved_balance.
-- Unreserved is NOT stored; it is computed as total_balance - reserved_balance.
--
-- user_id carries no FOREIGN KEY: it is owned by User Service, and Credit Service
-- reads no other service's database (context §3).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS balances (
  user_id           UUID PRIMARY KEY,
  total_balance     INTEGER NOT NULL DEFAULT 0,
  reserved_balance  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT balances_total_non_negative
    CHECK (total_balance >= 0),
  CONSTRAINT balances_reserved_non_negative
    CHECK (reserved_balance >= 0),
  -- Keeps unreserved (total - reserved) from ever going negative, which is the
  -- invariant F19.2.2 and F19.2.3 depend on.
  CONSTRAINT balances_reserved_not_exceeding_total
    CHECK (reserved_balance <= total_balance)
);

-- ---------------------------------------------------------------------------
-- transaction_log
--
-- context §5: lives in the same database as balances and is written in the same
-- transaction as the balance update, so a failure rolls both back together.
--
-- Columns are the seven fields F20.1.1 lists.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_log (
  transaction_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type     transaction_type_enum NOT NULL,
  originating_user_id  UUID,
  destination_user_id  UUID,
  amount               INTEGER NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id           UUID,

  CONSTRAINT transaction_log_amount_positive
    CHECK (amount > 0),

  -- Which party columns each transaction type must fill.
  --
  -- F20.1.1 reads "Originating user (not applicable for allocation)" and
  -- "Destination user (applicable to transfer only)", which taken literally leaves an
  -- allocation row naming nobody. Team decision 2026-09-26: an allocation records the
  -- new user as the DESTINATION, so the credits can be attributed and F19.5.2 can
  -- return it. Everything else follows F20.1.1 as written.
  CONSTRAINT transaction_log_party_shape CHECK (
    CASE transaction_type
      WHEN 'allocation'  THEN originating_user_id IS NULL     AND destination_user_id IS NOT NULL
      WHEN 'reservation' THEN originating_user_id IS NOT NULL AND destination_user_id IS NULL
      WHEN 'release'     THEN originating_user_id IS NOT NULL AND destination_user_id IS NULL
      WHEN 'transfer'    THEN originating_user_id IS NOT NULL AND destination_user_id IS NOT NULL
    END
  ),

  -- An allocation happens at registration and has no request behind it; every other
  -- operation is driven by one (context §3, inbound triggers).
  CONSTRAINT transaction_log_request_id_shape CHECK (
    (transaction_type =  'allocation' AND request_id IS NULL)
    OR
    (transaction_type <> 'allocation' AND request_id IS NOT NULL)
  )
);

-- F19.3.2 - at most one credit transfer recorded per request. context §4 requires this
-- to be a database constraint rather than check-then-write application logic.
-- Placed now so the guarantee exists before transfer is built in week 7.
CREATE UNIQUE INDEX IF NOT EXISTS transaction_log_one_transfer_per_request
  ON transaction_log (request_id)
  WHERE transaction_type = 'transfer';

-- Team decision 2026-09-26: at most one reservation per request, mirroring F19.3.2.
-- Without it a repeated "request created" trigger from Order Service reserves twice.
CREATE UNIQUE INDEX IF NOT EXISTS transaction_log_one_reservation_per_request
  ON transaction_log (request_id)
  WHERE transaction_type = 'reservation';

-- F19.4.1 - release is idempotent on requestId (team decision 2026-10-16), enforced the
-- same way as transfer and reservation.
CREATE UNIQUE INDEX IF NOT EXISTS transaction_log_one_release_per_request
  ON transaction_log (request_id)
  WHERE transaction_type = 'release';

-- Supports F19.5.2 ("records in which they are the originating or destination user").
CREATE INDEX IF NOT EXISTS transaction_log_originating_user_idx
  ON transaction_log (originating_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transaction_log_destination_user_idx
  ON transaction_log (destination_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- NFR8.2.3 - append-only transaction log.
--
-- Enforced by privilege, not by application code (context §5). The tables above are
-- owned by the bootstrap superuser; the service connects as a separate least-privilege
-- role that is never granted UPDATE or DELETE on transaction_log.
--
-- The grant matrix lives in grants.sql so that the container bootstrap
-- (grant-app-role.sh) and the test harness (tests/setup/globalSetup.ts) apply exactly
-- the same privileges. Role creation differs between the two only in where the
-- password comes from.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- dead_letter_jobs
--
-- Where a credit_transfer job lands once BullMQ will not run it again: either the
-- failure is permanent (an UnrecoverableError from the classification table in
-- src/worker/classifyTransferError.ts) or the fifth attempt has failed.
--
-- Columns mirror the sibling services' dead_letter_jobs (order-service's Prisma model
-- and supplier-service's init.sql) so an administrator sees one shape across the
-- system. Names are snake_case here, matching this service's own schema rather than
-- order-service's camelCase (team decision 2026-10-22).
--
-- GENERATED ALWAYS AS IDENTITY rather than BIGSERIAL: BIGSERIAL creates a sequence
-- that needs its own GRANT USAGE, SELECT, and without it every INSERT by credit_app
-- fails. An identity column is covered by the table privilege alone.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id       TEXT NOT NULL,
  task_name    TEXT NOT NULL,
  payload      JSONB NOT NULL,
  error_trace  TEXT NOT NULL,
  failed_at    TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'UNRESOLVED'
);

-- An administrator's query is "what is still outstanding?", so status is the index.
CREATE INDEX IF NOT EXISTS dead_letter_jobs_status_idx
  ON dead_letter_jobs (status);
