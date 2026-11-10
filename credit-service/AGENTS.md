# Credit Service instructions

- Credit owns wallets, order reservations, the immutable credit ledger and its event inbox.
  It never reads another service's database and is never read by one.
- `supabase/migrations/` is the only schema history. Do not run DDL at startup.
- Balances change only inside `app/credits/ledger.py`, one database transaction per operation,
  with no network I/O while a lock is held.
- `credit_transactions` is append-only: the runtime role has SELECT and INSERT only.
- `/v1/internal/*` is for Order only (`X-FoC-Service-Secret`) and is never routed by the edge proxy.
- Consumer: acknowledge a message only after its transaction commits or after a confirmed
  republish to the retry/dead-letter queue.
- Never log tokens, secrets, URLs, SQL or exception text. Keep `.env.example` in sync with `Settings`.
- Integration tests write data: point `CREDIT_TEST_DATABASE_URL` only at your own disposable
  Credit database, never a teammate's or a shared one.
