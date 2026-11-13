# CHANGE-104: Live Credit command recovery

2026-10-11 · Vincent · ADR-035 · architecture refinement ARCH-EVO-040.

User explicitly authorizes replacing the mock-only gateway with the actual Credit
protocol integrated at 497a8f9. Scope: Order HTTP adapter/gate/capability/tests,
existing frontend recovery verification, documentation and isolated provider
runtime verification. Peer source and cloud/application databases remain unchanged.

Traceability: F1/F2 create reservation; F3/F4.1.1/F13 acceptance/locking;
F11.2 accepted abort; NFR3.1.1 line/branch >=80%, NFR3.1.3 positive/negative tests,
NFR4 logs; ADR-025/033/034/035. Exact contracts/class/sequence in
concurrency/concurrency-order-credit.md. Credit controls financial effects;
Order controls lifecycle and final command results.

Provider comparison: reservation 201/200 with saved JSON; assignment/reset exactly
200 empty; paired key/generation headers; owner-scoped GET 200 terminal/202 pending;
POST compensation 200 saved result or 409 reconciliation. Financial changes/result
commit atomically; independent PENDING registration resumes on same-key replay.
Classified MATCHES_APPROVED_CONTRACT, subject to executed integration evidence.
No claim that source inspection verifies runtime. Existing FEEDBACK-010 to be
updated with real test evidence, preserving prior history.

## Tests-first and executed evidence

- RED: newly written gateway tests could not compile before the gateway existed.
  First implemented unit run exposed two test-fixture issues (JSON ordering and
  late mock expectations); corrected without weakening the exact field contract.
- HTTP protocol suite: 25 tests pass; gate test: two pass. Actual Credit image
  builds from its unchanged Dockerfile through standard BuildKit, not the legacy
  Testcontainers image builder that rejects Dockerfile cache mounts.
- Actual financial suite: eight initial scenarios pass. An additional real
  HTTP proxy withholds Credit's committed reservation reply; an actual socket
  read timeout leaves PENDING and same-key resume confirms exactly one ledger
  effect. That focused ninth scenario passes too. No fabricated financial result.
- Credit container restart initially changed its random published port; the
  isolated fixture now binds an allocated stable port before creation. This was
  test infrastructure, not a financial-provider protocol failure.
- Full fresh-source Java21/Maven3.9.16 verify: 334 tests pass, then 335 tests pass
  with the socket-timeout scenario, no failures/errors/skips. First full coverage:
  95.53% lines (1815/1900), 80.61% branches (711/882); >=80% gates pass. Final
  externally isolated rerun and tested-source parity are recorded below at handoff.
- Frontend: 83 tests pass, including eight hook cases; lint passes with three
  pre-existing login unused-variable warnings; typecheck passes.
- Actual Credit, changed Order and shared frontend Docker image builds pass.
  Three-file local-live Compose config --quiet passes without printing secrets.

## Scope and operational caveat

Credit HTTP handlers, transactions, ledger, command rows and PostgreSQL are real.
User/Supplier validation is fixture-backed in the isolated suite. Pub/Sub/browser/
production IAM are not verified by it. No application database reset, peer source
edit, cloud provisioning or IAM edit was performed. Early financial runs did not
isolate Order's after-commit dispatcher; personal ADC was available, so synthetic
test events may have been published to default dev topics. Delivery/effects were
not audited; this is not evidence of live integration or no cloud activity.
The final fixture replaces only external dispatch with a mock, keeping real
durable event intents and financial HTTP. It cannot publish to cloud topics.
Any review/cleanup of earlier synthetic messages needs a separate scoped action.

HTTP background recovery intentionally requires fresh user Continue, not stored
credentials or anonymous retry. Reposts retain their existing separate behavior.
Live authenticated User/Supplier/browser/PubSub gates remain open; Sprint [~].

## Final isolated verification

target/change104-isolated-final.log: Java21/Maven3.9.16 full verify passes with
335 tests, zero failures/errors/skips, including nine actual provider cases.
JaCoCo lines 95.53% (1815/1900), branches 80.73% (712/882); both >=80% gates pass.
All 183 current POM/source/resource/test files equal the fresh tested snapshot.
Reports: target/change104-isolated-final-check/target/. OpenAPI CI structural
predicates and generated docs pass; AsyncAPI source/schema/cadence parity and TOML
parse pass. External dispatch is explicitly fixture-isolated in this final run.
No provider source change; root Compose/.env.example add only Order settings.

Atomic implementation commit fbbce54; shared configuration commit 4e7cc77.
No push. The unrelated D3-preparation-answers.md stays untracked/unchanged;
learning remains excluded. The enabled browser uses durable /commands routes.
Legacy direct endpoints and repost paths retain legacy guarantees: never switch
an unresolved K between protocols or submit it through a legacy route. Broader
legacy-route hardening is not represented as complete by this integration.
No migrations: Order V5 and Credit V7 are existing committed schema sources.
Rollback: disable command submissions/worker, preserve unresolved rows and browser
keys, reconcile using historical provider outcomes before re-enabling.
