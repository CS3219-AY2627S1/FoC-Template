<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Documented the issue #42 pull-request CI checks, local equivalents,
failure evidence, and manual main-ruleset activation.
Author review: Pending project-author review.
Additional AI assistance: OpenAI Codex, date: 2026-11-09
Scope: Documented the author-approved issue #62 Order/Credit database-backed CI
checks, disposable PostgreSQL prerequisites, native Kafka Docker build fix, and
the later author-approved change-aware Kafka CI extension and safeguards.
Author review of this extension: Reviewed and approved by @ron on 2026-11-09.
-->

# Continuous integration

The `PR CI` workflow checks every pull request targeting `main`, every push to
`main`, and every manual run. `CI / plan` tests its selection/gate/report policy and
selects affected checks on PRs. Main pushes and manual runs select every job.
Selected jobs run on separate clean GitHub-hosted runners; `CI / gate` always runs
and validates their results against the plan. It rejects failed/cancelled/missing
jobs, any skipped selected job, and failed change detection. Only explicitly
unselected jobs may skip. The required-check name remains `CI / gate`.

## Required jobs

| Check | What it proves |
| --- | --- |
| `frontend / static-and-unit` | The React application lints, its Vitest tests pass, TypeScript checks, and Vite produces a production build. |
| `supplier / static-and-unit` | The NestJS service type-checks, its Jest tests pass, and Nest produces a build. |
| `user / build` | The User Service installs reproducibly and compiles. Its separate test suite is not invoked by this job. |
| `order / typecheck-build-and-test` | The Order Service installs reproducibly, type-checks application and test code, builds, and passes its database-backed tests against disposable PostgreSQL. Its real-Kafka suite is explicitly excluded. |
| `credit / typecheck-build-and-test` | The Credit Service installs reproducibly, type-checks, builds, and passes its existing tests against disposable PostgreSQL. Its separate Kafka E2E runner is not invoked. |
| `integration / supplier-stack` | The existing disposable Compose suite passes against the real User Service, Supplier Service, migrations, seed import, and PostgreSQL databases. |
| `e2e / supplier-ui` | The existing Chromium journeys pass against a disposable live stack. |
| `messaging / order` | Complete existing Order runner: real Kafka/PostgreSQL, simulated Credit, duplicates, DLQs, consumer recovery, concurrency, outages, rollback exclusion and stable retry identity. |
| `messaging / credit` | Complete existing Credit suite: real broker/database/Credit process, simulated upstream messages, exact balance and ledger assertions. |
| `messaging / user-credit` | Existing real HTTP/User/Kafka/Credit flow: activation, outage catch-up, initial-grant replay, suspend/restore and one initial grant. |
| `messaging / actual-services` | Real authenticated User/Supplier/Order/Kafka/Credit journeys: reserve/reject, completion/cancellation, command/reply replays, exact ledger effects and invalid-message isolation. |
| `CI / gate` | Every selected job completed successfully; intentional unaffected skips validated. |

## PR selection policy

This is the author's approved change-aware extension to the original run-all policy.
`scripts/ci/policy.mjs` is the selection source of truth. Git's complete three-dot
PR diff is read locally with rename detection disabled, so deletions and both sides
of renames count; API path-filter file limits do not truncate the plan.

| Changed area | Selected jobs |
| --- | --- |
| User | User build, Supplier integration/browser, User–Credit messaging, actual-service messaging. |
| Supplier | Supplier quality/integration/browser, actual-service messaging (Order's supplier lookup). |
| Order | Order quality/messaging, browser (current Order frontend), actual-service messaging. |
| Credit | Credit quality/messaging, User–Credit messaging, browser, actual-service messaging. |
| Frontend | Frontend quality and browser. |
| Markdown documentation/AI usage logs only | Plan and gate; application suites intentionally skip. |
| Kafka, Compose, CI scripts/workflows, root config, or unknown executable area | Full suite, conservatively. |

Multiple changed areas select the union. The workflow always starts; main pushes
and manual runs always select everything, including the requested manual CI test
run. There is no override that can turn a PR's required messaging tests off.

Order and Credit each receive their own PostgreSQL 17.11 service container, matching
their Compose image (`postgres:17.11-alpine3.24`). A `pg_isready` health check gates
startup. The hard-coded `postgres` password is only for the disposable CI instance;
no GitHub secret, local `.env`, shared development database/broker, or AWS account is used.
The test helpers create isolated databases, apply the real migrations, and drop
the test databases afterward. GitHub removes each service container with its job.

The fast Order job still excludes its Kafka suite; that suite runs with all
prerequisites in `messaging / order`. Selected messaging jobs require a complete
JUnit report containing the named messaging boundary, executed cases and zero
skipped/failed cases. Missing prerequisites, missing/empty/truncated reports, or
selecting only unrelated tests fail the job.

Messaging runners use unique Compose projects, test identities, image tags and
disposable databases/brokers. Host fixture ports bind to loopback. They wait for
readiness and exact outcomes with deadlines. Replay assertions use same-topic
progress markers or committed consumer offsets before checking unchanged effects.
Reports and redacted broker/service logs are saved before cleanup and uploaded for
seven days even on failure. Test containers and volumes are removed afterward.
Only dummy test credentials are supplied. Single-broker tests do not certify
multi-broker replication or production load.

## Kafka dependency builds in Docker

The five approved messaging boundaries are covered as follows:

| Boundary | Executed checks |
| --- | --- |
| User → Kafka → Credit | Existing User E2E plus initial-event replay, exact remaining balances and one `INITIAL_GRANT` ledger row. |
| Order → Kafka → Credit → Kafka → Order | New actual-service completion/cancellation/rejection journeys through real HTTP authentication and Supplier lookup. |
| Deduplication/recovery | Actual replayed commands/replies with offset barriers and exact ledger/history counts; existing Order crash-before-offset-commit case restarts consumption and checks one transition. |
| PostgreSQL outbox | Real-broker rollback exclusion with a later-message barrier; outage recovery retains the same event/payload/operation identity; existing batch-failure/retry tests and all-published checks. |
| Invalid messages | Existing malformed/correlation/DLQ suites plus actual-service malformed/unsupported messages, unchanged state and subsequent valid work. |

User, Order, and Credit keep their locked Confluent Kafka client and pinned Alpine
Node image. Their Docker dependency stage builds the addon's bundled librdkafka
from source, using the image's Node headers and Alpine's SSL, SASL, compression,
and HTTP library packages. This avoids the GitHub release-binary download that
returned HTTP 504 and the source installer's additional release-asset downloads.
It does not substitute Alpine's older system librdkafka for the bundled version.
The bundled make invocation is limited to two jobs so simultaneous service builds
do not run an unbounded number of native compilers. Install scripts run explicitly
after the locked install and that build-only adjustment.

The final image copies dependencies after `npm prune --omit=dev --ignore-scripts`,
plus the compiled application and migrations. It includes the shared libraries,
but no compiler, Python, or development packages, and still runs as `node`.
Credit's separate `e2e` target keeps its development dependencies and tests.
Builds still require access to the npm and Alpine package registries.

## Run the same checks locally

Use the same Node.js major version as CI and the application images: Node 22.

Frontend fast checks:

```sh
cd frontend
npm ci
npm run lint
npm test
npm run build
```

Supplier Service fast checks:

```sh
cd supplier-service
npm ci
npm run typecheck
npm test
npm run build
```

User Service build:

```sh
cd user-service
npm ci
npm run build
```

Order and Credit quality checks require a **disposable PostgreSQL server** and a
superuser test login, because their test helpers create databases and roles.
Never use a shared development database or AWS database. In a fresh shell, set
`TEST_DATABASE_URL` to that disposable server, leave `TEST_KAFKA_BROKERS` unset,
then run these commands separately in `order-service/` and `credit-service/`:

```sh
npm ci
npm run typecheck
npm run build
npm test
```

For example, a local disposable server exposed only on loopback port 55432 can
use `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres`.
The workflow provisions its own server automatically; you do not start Compose
before opening a pull request.

The live suites require Docker. Run each command from its application directory:

```sh
cd supplier-service
npm run test:integration
```

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
```

Both live runners use unique Compose project names and remove their containers
and volumes afterward.

## Investigate a failure

Run the required messaging suites from the repository root (Docker and Node 22
required; install the named services' locked dependencies first):

```sh
node scripts/ci/messaging.mjs order   # npm ci in order-service
node scripts/ci/messaging.mjs credit  # dependencies and tests run inside Docker
node scripts/ci/messaging.mjs user    # npm ci + build in user-service and credit-service
node scripts/ci/messaging.mjs journey # npm ci in order-service; real services built by Compose
```

The runner prints the evidence directory and removes its owned containers,
volumes, and uniquely tagged test images. Standard `npm run test:kafka` and
Credit `npm run test:e2e` commands remain available for local development.

1. Open the failed job from the pull request's **Checks** section.
2. Expand the first failed step and read its command output.
3. For browser failures, download the seven-day `supplier-ui-e2e-*` artifact.
   It contains the Playwright HTML report and any retained trace, screenshot, or
   video, plus captured Compose status and relevant service logs. The same
   diagnostics are printed in the job log.
4. Reproduce the failed job with the matching local commands above.

The workflow does not retry failed tests automatically. A failure that disappears
on a later run should be treated as a flaky-test defect rather than ignored.

## Protect `main` after the first successful run

GitHub must see `CI / gate` report once before it can be selected as a required
check. After the workflow first succeeds:

1. Open **Settings → Rules → Rulesets** for the repository.
2. Create or edit the branch ruleset targeting `main`.
3. Require changes through pull requests and one approval from someone other
   than the author.
4. Require approval of the most recent reviewable push and require all review
   conversations to be resolved.
5. Add `CI / gate` as a required status check, with GitHub Actions as its source.
6. Block force pushes and branch deletion, and do not grant a normal bypass.

The workflow can also be started from **Actions → PR CI → Run workflow** or with:

```sh
gh workflow run pr-ci.yml
```
