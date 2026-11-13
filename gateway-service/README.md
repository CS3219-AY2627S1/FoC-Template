# Friend on Campus API Gateway

The Gateway Service is the public API entry point for Friend on Campus. It routes requests to the
service that owns the published API contract; it does not contain domain logic, access databases,
issue tokens, or replace downstream authorization.

## Routes

| Gateway path | Downstream service | Downstream path |
| --- | --- | --- |
| `GET /admin`, `GET /admin/**`, `GET /admin-assets/**` | Admin Service | unchanged; Supplier admin paths take precedence |
| `/api/admin/**` | Admin Service | unchanged; `/api/admin/suppliers/**` remains Supplier-owned |
| `GET /docs/admin/openapi.json` | Admin Service | `/v3/api-docs` |
| `GET /` | User Service | unchanged |
| `GET /user-assets/**` | User Service | unchanged |
| `GET /suppliers` and `GET /suppliers/**` | Supplier Service | unchanged |
| `GET /admin/suppliers` and `GET /admin/suppliers/**` | Supplier Service | unchanged |
| `GET /supplier-assets/**` | Supplier Service | unchanged |
| `GET /credits` and `GET /credits/**` | Credit Service | unchanged |
| `GET /credit-assets/**` | Credit Service | unchanged |
| `GET /notifications`, `GET /notifications/**` and `GET /notification-assets/**` | Notification Service | unchanged |
| `/api/users` and `/api/users/**` | User Service | unchanged |
| `/api/suppliers` and `/api/suppliers/**` | Supplier Service | unchanged |
| `/api/admin/suppliers` and `/api/admin/suppliers/**` | Supplier Service | unchanged |
| `/api/credits` and `/api/credits/**` | Credit Service | unchanged |
| `/api/orders` and `/api/orders/**` | Order Service | unchanged |
| `/api/notifications` and `/api/notifications/**` | Notification Service | unchanged |
| `GET /.well-known/jwks.json` | User Service | unchanged |
| `GET /docs/user/openapi.json` | User Service | `/v3/api-docs` |
| `GET /docs/user/openapi.yaml` | User Service | Converted from `/v3/api-docs` |
| `GET /docs/supplier/openapi.json` | Supplier Service | `/v3/api-docs` |
| `GET /docs/supplier/openapi.yaml` | Supplier Service | `/v3/api-docs.yaml` |
| `GET /docs/credit/openapi.json` | Credit Service | `/v3/api-docs` |
| `GET /docs/credit/openapi.yaml` | Credit Service | `/v3/api-docs.yaml` |
| `GET /docs/order/openapi.json` | Order Service | `/v3/api-docs` |
| `GET /docs/notification/openapi.json` | Notification Service | `/v3/api-docs` |

The UI routes are explicit; the gateway has no catch-all route. Unrecognised paths return `404`.
Order routes follow its published port `8082` and `/api/orders` contract. Subpaths are forwarded
without implementing future lifecycle operations in the gateway; unavailable operations remain
the Order Service's responsibility. The gateway does not retry mutations or deduplicate them;
caller retry behavior and operation identities follow the producer's contract. Correlate failures
using gateway/downstream request logs and check the downstream health independently.

## Run locally

For Minikube deployment, follow [`../deploy/k8s/README.md`](../deploy/k8s/README.md).

Java 17 is required. Start the downstream services needed for your routes (including Admin
for `/admin`), then run:

```sh
./mvnw spring-boot:run
```

Local defaults are:

```text
USER_SERVICE_URL=http://localhost:8081
SUPPLIER_SERVICE_URL=http://localhost:8080
CREDIT_SERVICE_URL=http://localhost:8083
ORDER_SERVICE_URL=http://localhost:8082
ADMIN_SERVICE_URL=http://localhost:8084
NOTIFICATION_SERVICE_URL=http://localhost:8086
```

Override the corresponding environment variable when a downstream service uses another address.
Order is included in Compose and Kubernetes. Notification is in Compose only; its Kubernetes
Deployment and network policies come in a later change. Admin Compose wiring is prepared, with
shared activation pending the affected-owner reviews in
[the runtime handoff](../admin-service/RUNTIME_INTEGRATION.md).

To run the complete Docker stack from the repository root, first configure the root `.env`,
including User/Admin keys, trust and broker credentials. After affected-owner review, run:

```sh
docker compose up -d --build admin-service gateway
```

Compose routes internally through each service name. Open `http://localhost:8088` to sign in, then
open `http://localhost:8088/credits` for the packaged Credit dashboard.
The SPAs share the validated `sessionStorage["foc.user-session"]` value while production assets
remain collision-free under `/user-assets/**`, `/supplier-assets/**`, `/credit-assets/**`,
`/order-assets/**` and `/admin-assets/**`.

Use the shared `8088` origin by default for frontend clients, Postman, and cross-service testing.
Direct ports `8080`, `8081` and `8083` remain available only for service-specific development and
troubleshooting during this phase.

## Documentation and health

- Aggregated Swagger UI: `http://localhost:8088/swagger-ui/index.html`
- User OpenAPI JSON: `http://localhost:8088/docs/user/openapi.json`
- User OpenAPI YAML: `http://localhost:8088/docs/user/openapi.yaml`
- Supplier OpenAPI JSON: `http://localhost:8088/docs/supplier/openapi.json`
- Supplier OpenAPI YAML: `http://localhost:8088/docs/supplier/openapi.yaml`
- Credit OpenAPI JSON: `http://localhost:8088/docs/credit/openapi.json`
- Credit OpenAPI YAML: `http://localhost:8088/docs/credit/openapi.yaml`
- Order OpenAPI JSON: `http://localhost:8088/docs/order/openapi.json`
- Notification OpenAPI JSON: `http://localhost:8088/docs/notification/openapi.json`
- Gateway health: `http://localhost:8088/actuator/health`

The Swagger UI selector switches between the Admin, User, Supplier, Credit, Order and Notification
contracts. Because the current specifications do not declare a separate server URL, **Try it
out** sends requests through the gateway origin. Direct service Swagger remains available for
debugging until UI/gateway integration is completed.

## Authentication boundary

The User frontend saves the login response in session storage for the current `8088` browser tab.
The Supplier frontend validates that session and forwards its access token. Client-side role checks
improve navigation only and are not a security boundary.

The gateway forwards bearer tokens but does not validate them. User Service remains the token
issuer, and each backend remains responsible for validating JWTs and enforcing its own roles.
Supplier and Credit services therefore validate the User Service signature, issuer and audience
before applying their own endpoint authorization.

## Tests

```sh
./mvnw --batch-mode --no-transfer-progress verify
```

On Windows use `.\mvnw.cmd --batch-mode --no-transfer-progress verify`. Focused tests may
be run during iteration; use `verify` for the gateway completion check, matching CI.

The tests use isolated local stub servers and do not require Docker, PostgreSQL, or running domain
services.

## Changing routes

Gateway ownership is shared. For each route change, nominate one implementer and request review
from every affected service owner. The producing service owns its paths and payload contract; the
gateway must not invent or compensate for unpublished service behavior.

Shared UI changes must be reviewed by the User and Supplier service owners before merging.
