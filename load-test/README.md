# Load test

9600 virtual users call Order. The gateway identity headers are sent directly, so this does not go through the frontend or the gateway. Order makes the downstream calls.

| Share | VUs | What they do |
| --- | --- | --- |
| 30% requesters | 2880 | Keep up to 3 open orders. Create at 1 credit, then acknowledge a delivered order. Every 20th close escalates instead. |
| 70% couriers | 6720 | Read the open pool, accept one order, upload a 1×1 PNG for collect, then the same for deliver. |

Reads are mixed in. Requesters also call `/requests/active`, `/requests/past`, `/mine`, and `/alerts`. Couriers also call `/deliveries/active`, `/deliveries/past`, and `/search`.

Downstream calls, as a share of that traffic:

| Service | When |
| --- | --- |
| User | Order looks up the Telegram handle on create and on accept. |
| Supplier | Order validates **pickup only** (`fromLocation`) on create. Search re-checks that pickup id. |
| Order DB | Dropoff is Order-owned: create sends `deliveryPointId` (seeded campus catalogue from Flyway `V6`). |
| Credit | Order reserves 1 credit on create. Acknowledge publishes `credit.reservation.release`. The credit consumer has to be running for that second call to land. |
| Admin | Escalate calls `POST /api/v1/admin/internal/conflicts`. About 1 in 20 closes. |
| Rating | Order reads `GET /api/v1/rating/{userId}` on create and accept. Deliver and acknowledge publish `rating.permission.granted` on `foc.rating.commands` for Rating Service to grant the modal. |
| MinIO / S3 | Collect and deliver store the PNG. |

Default duration is 10 minutes. A requester holds at most 3 orders so create rate follows how fast couriers finish. Accept collisions return 409 and count as normal contention. Defaults: Supplier pickup id `2` (approved), Order delivery-point id `1` (seeded `kent-ridge-mrt`).

## Setup, then load

Signup stays out of k6. Accounts are seeded into the User and Credit databases before the run.

1. Build the roster and SQL (writes `data/users.json`, `data/users.sql`, `data/credits.sql`).
2. Apply that SQL to User DB and Credit DB.
3. Point k6 at Order and run with the same `VUS` / `REQUESTER_SHARE`.

`roster.mjs` only builds the shared list of emails and Telegram handles. `seed-users.mjs` adds stable user ids, writes the files, and can apply them locally. k6 reads `data/users.json` for the `X-User-Id` values.

### Local Compose

Services already up. Seed into the local Postgres containers, then run k6:

```powershell
node load-test/setup/seed-users.mjs --apply
k6 run load-test/k6/load.js
```

Short smoke:

```powershell
$env:VUS='30'; $env:DURATION='30s'
node load-test/setup/seed-users.mjs --apply
k6 run -e VUS=30 -e DURATION=30s load-test/k6/load.js
```

`--apply` uses Docker exec against `user-service-db-1` and `credit-postgres`. Override with `USER_DB_CONTAINER` / `CREDIT_DB_CONTAINER` if the names differ.

### In the cluster (dev)

This folder is also a Helm chart. Argo CD app `load-test-dev` deploys it into
namespace `foc-load`: three suspended CronJobs that only run when you start
them. Each Job regenerates the seed files itself (user ids are deterministic),
so nothing is copied between Jobs.

| CronJob | What it does |
| --- | --- |
| `load-setup` | Seeds 9600 users into the User and Credit databases. Re-run to reset balances. |
| `load-run-smoke` | k6, 30 VUs for 1 minute, on the normal nodes. |
| `load-run-full` | k6, 9600 VUs for 10 minutes, on the `loadgen` node (one 8 vCPU / 32 GiB Spot node, added by Cluster Autoscaler, removed ~10 min after). |

k6 calls `http://order.foc-dev.svc.cluster.local:8083` as mesh identity
`foc-load/k6`, which dev's Order admits. Results stream to Prometheus, tagged
`testid=<Job name>`. Nothing is cleaned up: load users and orders stay in the
dev databases.

Before a full run, raise RDS to `db.m7g.xlarge` (and back afterwards).

```bash
export AWS_PROFILE=cs3219-dev
kubectl -n foc-load create job load-setup-$(date +%H%M) --from=cronjob/load-setup
kubectl -n foc-load logs -f job/load-setup-<HHMM>        # "Seeded 9600 users"

kubectl -n foc-load create job smoke-$(date +%H%M) --from=cronjob/load-run-smoke
kubectl -n foc-load create job full-$(date +%H%M) --from=cronjob/load-run-full
```

Or in the Argo CD UI: app `load-test-dev` → the CronJob → ⋮ → **Create Job**.

Results:

- `kubectl -n foc-load logs -f job/<name> -c k6` prints k6's end-of-run summary.
  A failed threshold makes the Job **Failed**.
- Grafana (`kubectl -n monitoring port-forward svc/kps-grafana 3000:80`):
  dashboard **k6 Prometheus (Native Histograms)**, pick the run under `testid`.
  The Linkerd `response_total` metrics and the Kubernetes dashboards show the
  services' side.
- `kubectl -n foc-dev get hpa -w` while it runs.

Change VUs, duration or resources in `values.yaml` (`runs:`).

### EC2 or laptop against EKS

Generate the seed with `node load-test/setup/seed-users.mjs`, apply
`data/users.sql` / `data/credits.sql` with `psql`, then run k6 with
`-e ORDER_URL=...` against a port-forward (`kubectl -n foc-dev port-forward
svc/order 8083:8083`). Order's mesh policy refuses unmeshed callers, so a
plain port-forward from outside the mesh gets 403; prefer the in-cluster Jobs.

## Env

| Variable | Default | Used by |
| --- | --- | --- |
| `VUS` | `9600` | seed + k6 |
| `REQUESTER_SHARE` | `0.3` | seed + k6 |
| `CREDIT_BALANCE` | `5000` | seed (requesters) |
| `COURIER_BALANCE` | `100` | seed (couriers) |
| `ORDER_URL` | `http://localhost:8083` | k6 |
| `DURATION` | `10m` | k6 |
| `THINK_SECONDS` | `1` | k6 |
| `ESCALATE_EVERY` | `20` | k6 |
| `PICKUP_ID` | `2` | k6 — Supplier approved place id (`fromLocation`) |
| `DROPOFF_ID` | `1` | k6 — Order `delivery_point.id` (`deliveryPointId`) |

## Metrics tags (Prometheus / Grafana)

Order ids appear in real request paths (`/orders/{id}/accept`, …). For streamed
metrics, `load.js` sets a stable `tags.name` per endpoint (`accept`, `collect`,
`get_order`, …), which k6 also copies into `url`, so those UUIDs do not create
one time series per order. `url` is left out of `systemTags` as well. Thresholds still filter on custom `op`
(`create` / `read` / `fulfill` / `close`).
