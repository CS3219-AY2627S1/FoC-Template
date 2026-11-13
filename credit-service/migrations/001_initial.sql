-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
-- Scope: Implemented the human-specified four-table schema, defaults, relationships, and value constraints.
-- Author review: Gaps missed out in this migration have been addressed in subsequent migrations.
-- Prompts and key responses: ../ai/usage-log.md, entries 004–006.

CREATE TABLE credit_accounts (
    user_id text PRIMARY KEY,
    total_credits integer NOT NULL,
    reserved_credits integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (total_credits >= 0),
    CHECK (reserved_credits >= 0),
    CHECK (reserved_credits <= total_credits)
);

CREATE TABLE reservations (
    reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    requestor_id text NOT NULL REFERENCES credit_accounts (user_id),
    courier_id text DEFAULT NULL REFERENCES credit_accounts (user_id),
    credit_amount integer NOT NULL,
    status text NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'released', 'transferred')),
    version integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES credit_accounts (user_id),
    order_id uuid,
    reservation_id uuid REFERENCES reservations (reservation_id),
    type text NOT NULL
        CHECK (type IN ('init_credits', 'reserve', 'update', 'release', 'transfer')),
    total_amount_change integer NOT NULL,
    total_reserved_change integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
    operation_type text NOT NULL
        CHECK (operation_type IN ('init_credits', 'reserve', 'update', 'release', 'transfer')),
    idempotency_key text NOT NULL,
    user_id text NOT NULL,
    request_hash text NOT NULL,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (operation_type, idempotency_key)
);
