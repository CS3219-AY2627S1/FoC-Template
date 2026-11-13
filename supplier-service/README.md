# Supplier Service

Campus supplier catalogue and administration, with a React Module Federation
frontend and an Express/PostgreSQL backend.

## Run locally

From the repository root with Node.js 24 and Docker running:

```bash
npm ci
npm run dev
```

Open http://localhost:8080. Source development runs Supplier's frontend on
5001 and API on 3000. The host proxies `/api/supplier` to that API.
For the complete container deployment, use:

```bash
npm run up:compose
npm run down:compose
```

The teardown deletes local database data. Floci manages PostgreSQL; there is
no `supplier-db` Compose service. The launcher discovers its generated database
host, port, and credentials. See the [local guide](../floci/README.md).

### Frontend data source

The frontend uses the backend by default. For seeded browser-only data, copy
`frontend/.env.example` to `frontend/.env.local`, set
`VITE_SUPPLIER_API_MODE=mock`, and restart Vite. Remove that override or set it
to `backend` to use `/api/supplier` again.

## HTTP API

| Method | Route | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/supplier` | Signed-in user | List suppliers with filters |
| GET | `/api/supplier/:id` | Signed-in user | Get one supplier |
| POST | `/api/supplier` | Admin or SuperAdmin | Create supplier |
| PUT | `/api/supplier/:id` | Admin or SuperAdmin | Update supplier |
| DELETE | `/api/supplier/:id` | Admin or SuperAdmin | Delete supplier |

All public API routes verify the Cognito access and ID cookies locally using
`@relay/user-auth-backend-middleware`. Reads are authenticated, too.
Internal supplier lookup routes use `x-supplier-service-token`, matching
`INTERNAL_SUPPLIER_SERVICE_TOKEN`.

List filters:

| Parameter | Values |
| --- | --- |
| `status` | `all`, `operational`, `not-operational` |
| `serviceTypes` | JSON array of numeric service types; matches any selected type |

For example: `/api/supplier?status=operational&serviceTypes=[0,2,3]`.
Operating hours are evaluated using `SUPPLIER_TIMEZONE` (Asia/Singapore by
default in the deployment configuration).

## Database and health

`backend/src/schema.sql` contains the schema, indexes, timestamp trigger, and
21 active seed inserts, including Octobox. Inserts use `ON CONFLICT DO NOTHING`.
The `supplier-schema` Compose service and Kubernetes migration Job run
`backend/migrate.js`. Reapplying the schema does not overwrite existing suppliers.

AWS sets `DB_SSL_CA_PATH` to the RDS CA bundle included in the image, enabling
TLS and certificate verification. Floci uses local PostgreSQL without that
RDS certificate setting. `/health` checks process liveness; `/healthz` checks
the database connection.

## Checks

```bash
npm run test --workspace=@relay/supplier-backend
npm run build --workspace=@relay/supplier-backend
npm run build --workspace=@relay/supplier-frontend
```

The current backend tests exercise supplier service/filter behavior with test
repositories. Database connectivity and seeded catalogue behavior need a running
local or AWS deployment.
