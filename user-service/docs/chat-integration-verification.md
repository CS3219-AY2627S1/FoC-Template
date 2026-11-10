# Chat identity interface verification and handoff

The finalized [HTTP contract](chat-integration-contract.md) defines the two internal
interfaces, DTO field allow-lists, authentication split, cursor semantics, errors,
and internal connection configuration. No schema migration or cross-service database
access was introduced. Existing seven Supabase migrations reconstruct the database.

## Reproduce verification safely

From `user-service/` in the assigned checkout, install the existing development
dependencies into a Python 3.13 virtual environment and install the project-pinned
Supabase CLI (`npm ci`). Docker must be running. On Windows:

```powershell
.\.venv\Scripts\python.exe scripts\run_chat_tests.py --reset -q --tb=short
.\.venv\Scripts\python.exe -m ruff check app tests scripts
.\.venv\Scripts\python.exe scripts\run_chat_contract_demo.py --port 0
```

The test runner creates ignored `.test-resources/chat-interface/`, copies the canonical
migrations, and uses **only** local Supabase project `foc-user-chat-test` on database
port **18422** (other generated ports use `1842x`). It explicitly passes `db reset
--local --no-seed`; it never accepts an external database URL or uses `--linked`.
It rejects an unexpected project/port, cloud-link state, non-loopback database URL,
or a database other than the dedicated local `postgres` database. The normal local
User Service database on `15422` is untouched. CLI status/credentials stay in memory.
Pytest temporary files use a unique ignored directory inside the worktree.

Use `--reset` only while this dedicated project has no concurrent test/demo consumers.
The full existing regression suite assumes a clean database, including the
last-Super-Admin tests. To rerun just interface tests without resetting:

```powershell
.\.venv\Scripts\python.exe scripts\run_chat_tests.py tests/integration/test_chat_search.py tests/integration/test_chat_participants.py tests/integration/test_chat_privacy.py -q
```

The demo starts an actual loopback Uvicorn server, registers and OTP-verifies disposable
accounts through the existing HTTP API, signs/logs in with in-memory RSA keys,
deletes one account, searches, edits the active counterpart's profile, and resolves
the active/tombstone/unknown batch. It asserts DTOs and prints only safe test identity
responses and timings. Its server uses explicitly supplied in-memory test settings
and does not overwrite `.env` or development secrets.

For a concurrent Chat Service production-client check, run:

```powershell
.\.venv\Scripts\python.exe scripts\run_chat_contract_demo.py --serve --port 18080
```

This writes a uniquely named, ignored `demo-<id>.json` with disposable test-only
service identity and bearer tokens; read it in memory, never print/copy/commit its
credential values. No private RSA key is written or shared. The file identifies the
caller, active counterpart, tombstone, unknown ID, query, and loopback base URL.
Ctrl+C stops the server and removes its fixture. Tokens expire in one hour and remain
subject to the existing 30-minute idle timeout. This fixture is not a deployment secret.

## Automated and HTTP evidence

Verified on 10–11 October 2026 with Python 3.13.7, FastAPI 0.143.0, Pydantic 2.14.0,
SQLAlchemy 2.1.4, asyncpg 0.32.0, Supabase CLI 2.120.0, and local PostgreSQL 17:

- A clean `npx supabase db reset --local --no-seed` applied all seven canonical migrations.
- The final clean regression run passed **116 tests** (the initial run passed 108),
  including real PostgreSQL
  authentication/session rotation, profiles/deletion, Supplier authorization, admin
  lifecycle/audit immutability, registration, and outbox idempotency.
- Interface coverage traverses 105 matches without a result cap; validates literal
  middle/case/wildcard matching, caller/deleted filtering, every role, cursor shape
  and query binding, deletion between pages, session failure modes, batch sizes
  0/1/100/101, ordered deduplication, one-query lookup, all-unknown batches, current
  profile edits, real deletion/registration with released username, and exact projections.
- Database failure returns safe 503 responses, and participant lookup leaves users,
  credentials, session activity, and outbox rows unchanged.
- Additional final checks verify safe structured logs and isolated test-resource guards.
- Two additional driver-level connection-refusal cases passed through actual asyncpg,
  verifying safe 503 responses after session setup for both interfaces. The complete
  five-case outage test module passed after adding them.
- The User Service Docker image built successfully; a disposable container with
  `--network none`, no mounted credentials, and no published ports passed liveness
  and both fail-closed internal chat routes with `Cache-Control: no-store`.

The concurrent Chat Service worker verified its production HTTP identity client
against the running native User Service demo and the real User Service test database:
public JWKS verification, current-session validation, username search, current names,
tombstones, and missing IDs. Its final pass also exercised durable WebSocket send/retry
through two Chat API processes and RabbitMQ. This is actual service-to-service HTTP
evidence, with the Chat Service checks owned and reported by that worker. The disposable
User Service demo and its credential fixture were removed after those checks finished.

## Local timing baseline

Ten sequential requests per row against native loopback HTTP and the isolated
PostgreSQL container, with **299 user rows** present. The search matched one active
counterpart; participant batches contained one active ID, then an additional tombstone
and unknown ID; the 100-ID batch contained 98 unknown IDs. Query timing covers bounded
query materialization and page/batch preparation; HTTP timing also includes
authentication and serialization.

| Operation | Median HTTP ms | Min–max HTTP ms | Median query/projection ms |
|---|---:|---:|---:|
| Search, limit 20 | 15.814 | 14.837–37.890 | 3.941 |
| Participant batch 1 | 9.557 | 8.276–10.580 | 4.911 |
| Participant batch 3 | 10.049 | 8.091–12.022 | 4.851 |
| Participant batch 100 | 9.448 | 8.277–13.010 | 4.929 |

These are development observations, not a load test or p95/Sprint 4 certification.
The existing equality index does not establish arbitrary-substring search acceleration.
No new index is justified by this small baseline.

## Integration ownership and remaining work

User Service supplies immutable IDs, fresh names/status, and current session checks.
Chat Service must preserve search cursors, batch up to 100 IDs, distinguish missing
IDs from tombstones, validate responses, apply bounded timeouts, and fail closed on
dependency failure. It must independently enforce conversation membership, blocks,
and fresh recipient eligibility at message acceptance and live forwarding.

Production deployment still needs independently provisioned Chat Service identity,
the internal base URL/network, and deployment service-identity replacement as already
planned. Shared Compose/CI/proxy/web-client work belongs to the separately authorized
integration work. This service-only change does not claim chat UI, messaging, RabbitMQ,
or Sprint 4 scale acceptance. No changes were pushed or merged.
