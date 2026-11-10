<!--
AI Assistance Disclosure:
Tool: OpenAI Codex, date: 2026-11-10
Scope: Inspected repository logging and official Docker/Grafana documentation;
drafted this local-only plan from Ron's nine design-interview answers for issue #66.
Author review: Plan and shared understanding reviewed and approved by Ron on
2026-11-10; implementation explicitly authorised in a separate PR.
-->

# Optional local centralised logging: rough implementation plan

Status: approved for implementation on 2026-11-10. Tracking: [GitHub issue #66](https://github.com/Y2627S1-CS3219-P5/FoC/issues/66).

## Goal and agreed boundary

Make existing FoC container logs searchable in one browser interface with a small,
configuration-focused PR. Ron selected Q1–Q9 below on 2026-11-10. These are scope
decisions; Ron subsequently reviewed this written plan and authorised implementation.

| Decision | Agreed first increment |
| --- | --- |
| Q1: application changes | Reuse existing stdout/stderr; no application logging refactor or new npm dependencies. |
| Q2: sources | User, Supplier, Order and Credit backends, plus frontend nginx errors. |
| Q3: startup | A separate optional Docker Compose project; ordinary application startup remains unchanged. |
| Q4: data | Dummy accounts/data; discard nginx access logs. Backend logs may contain account identifiers. |
| Q5: lifetime | Persistent logging-owned volumes, a seven-day retention target, and a logging-only reset command. |
| Q6: Docker access | A trusted local Alloy collector uses the Docker socket directly; document its broad permissions. |
| Q7: display | Provision Loki as a Grafana data source; use Explore and documented searches, without a custom dashboard. |
| Q8: access | Grafana login at `http://localhost:3300`, bound to `127.0.0.1`; credentials in a gitignored environment file. No Loki/Alloy host ports. |
| Q9: evidence | A bounded local smoke script plus a manual Grafana demonstration. No new CI job. |

AWS changes, distributed tracing, metrics, alerts, durable audit history, browser
console collection and database/Kafka infrastructure log collection are outside this increment.

## Inspected starting point

- [Root Compose](../../compose.yaml) already defines all four backends and the nginx frontend.
  Supplier uses port 3000, User 3001, Order 3002 and frontend 8080. Credit is a Kafka worker.
  Port 3300 avoids the existing Order port; the earlier example of 3002 is unsuitable.
- [Supplier request logging](../../supplier-service/src/http/request-id.ts) emits JSON
  completion events with a server-generated request ID, method, pathname, status and
  duration. Query strings are removed. Nest wraps the event object in its `message` field.
- [Order](../../order-service/src/log.ts) and [Credit](../../credit-service/src/log.ts)
  already write JSON events. Some startup/database messages are plain text.
- [User startup](../../user-service/src/index.ts) and other User components use mixed
  console output. User has no general HTTP completion logger, so not every request will appear.
- Frontend container logs come from nginx, not the user's browser. Its default access
  output may include IPs and URL queries; the initial collector must discard that stream.
- Current ADRs cover the AWS deployment. This optional local addition does not change them.

## Implementation steps

1. **Add the optional stack.** Create a self-contained `observability/compose.yaml`
   with pinned, compatible Alloy, Loki and Grafana images. Use a distinct Compose
   project and owned network/volumes. Do not merge it into the application's normal
   Compose configuration or modify its logging driver. Document supported Docker
   Desktop/Engine socket paths and configurable host port.
2. **Collect only the intended sources.** Configure Alloy Docker discovery to require
   both the explicitly configured application Compose project and an allowlist of
   service names. Exclude unrelated containers, other developers' projects, CI stacks,
   migration jobs and the observability stack itself. Preserve mixed JSON/text output.
   Use stable project/service/stream labels; keep request and operation IDs in log
   content rather than creating an indexed label for each ID.
3. **Apply the agreed privacy boundary before storage.** Inspect the actual nginx
   image's stream behaviour, discard frontend access stdout and retain its diagnostic
   stderr. Test that URL/IP canaries in access records are absent from Loki. Use only
   dummy backend data. If inspection discovers credential-bearing records, redact or
   exclude them in the collector, or report a blocker; do not silently expand into an
   application-code refactor. This is not a claim that existing logs are anonymous.
4. **Store locally with bounded age.** Use single-instance Loki and filesystem-backed
   named storage. Explicitly enable compactor retention for seven days; default Loki
   retention is not sufficient. Persist Alloy read positions and Grafana state. Explain
   that deletion is asynchronous and seven-day retention is not a hard disk-size limit.
5. **Provision the browser view.** Configure Grafana's Loki data source automatically,
   require a local Grafana login, and expose only its loopback-bound port. Add environment
   placeholders and ignore the actual local credential file. Document first-start
   credentials and password-reset behaviour for an existing Grafana volume.
6. **Verify and document.** Add the smoke script and short instructions for startup,
   Explore searches, shutdown and logging-only reset. Add per-file AI attributions,
   the README AI summary and usage-log entry required for the implementation.

## Approximate file budget

Seven local-stack files: `compose.yaml`, `alloy.alloy`, `loki.yaml`,
`grafana/datasources.yaml`, `.env.example`, `README.md` and `smoke.sh`, all under
`observability/`. Add a narrow ignore rule if the existing rules do not cover the
credential file. Update the root README and AI usage log; retain this plan.

Expect roughly ten files including plan/disclosure documentation, mostly small
configuration files. This is an estimate, not a hard cap: flag a material scope
increase rather than growing the PR silently. No generated dashboard exports,
vendored dependencies, application source changes or AWS files are planned.

## Acceptance and demonstration

- Validate Compose and product configuration against the selected pinned versions.
- Run bounded smoke checks using owned disposable fixtures and dummy records. Verify
  included service records arrive, an unrelated project is excluded, and frontend
  access-log canaries are absent. Preserve readable plain text and Supplier nested JSON.
- Verify a unique test record remains queryable after restarting the logging stack.
  Verify retention is enabled with the intended period; do not claim a seven-day
  deletion test was completed during a short smoke run.
- Keep smoke resources isolated from the developer's application and historical logs.
  Fail with useful diagnostics on timeout and clean up only resources the test owns.
- Manually start the real application and optional logging stack. In Grafana Explore,
  select a service/time window, find a Supplier request ID and inspect existing
  Order/Credit events. Record that fields and coverage differ between services.
- Stop the logging stack and confirm the application remains usable. Test the separate
  logging-only reset against disposable logging volumes; application databases remain.
- Report changed files and actual results. Do not add a CI job or claim unexecuted checks pass.

## Limitations and operational notes

The Docker socket grants broad daemon access; a `:ro` bind mount is not an API
authorisation boundary. This choice is accepted for a trusted laptop-only collector,
not a production deployment pattern. Do not publish the Docker API on a host port.

Central collection does not create missing application events or automatic cross-service
correlation. Logs can contain dummy account IDs. Loki retention does not rotate Docker's
original log files. The initial setup is local development tooling, not a production
availability guarantee or a substitute for the existing User audit database.

## Primary references

- [Docker collection with Alloy](https://grafana.com/docs/alloy/latest/monitor/monitor-docker-containers/)
- [Alloy Docker log source](https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.docker/)
- [Loki retention](https://grafana.com/docs/loki/latest/operations/storage/retention/)
- [Loki label practices](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/)
- [Grafana data-source provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Docker daemon access](https://docs.docker.com/engine/security/)
