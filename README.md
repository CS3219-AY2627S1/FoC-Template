# CS3219 Software Design and Architecture (AY2627 Sem 1), Group 26

## Friend on Campus (Relay)

**Friend on Campus (FoC)**, shown as **Relay** in the app, is a peer-to-peer campus errand platform. Students request items to be collected from stores or facilities on campus, and other students fulfil and deliver those requests. The platform runs on a closed credit economy: credits cannot be bought, withdrawn or exchanged for money, and only circulate within the platform.

Live deployment: <https://relay.54-254-126-243.sslip.io> (only while the cloud instance is running, see [Deployment](#deployment)).

---

## Team and ownership

| Name | Ownership |
| --- | --- |
| Felix Soeren Haag | user-service, web-client, deployment (Kubernetes, AWS, CI/CD) |
| William Kento Rasmussen | message-service (N2H), rag-service (N2H) |
| Nguyen Viet Quang | supplier-service, maps and walking routes (N2H) |
| Dinh Khoat Hoang Long | credit-service, recommendation-service (N2H) |
| Truong Kim Mai | order-service, Admin Dashboard (Orders) (N2H) |

---

## Architecture

| Component | Responsibility | Stack | Data store |
| --- | --- | --- | --- |
| [`user-service`](user-service/README.md) | Accounts, email verification, sessions, roles; the only authority on authorization | Node.js, TypeScript, Express | MongoDB |
| [`supplier-service`](supplier-service/README.md) | Catalogue of campus stores, facilities and landmarks; walking routes from a supplier to a drop-off point on a map of the NUS area (N2H) | Node.js, TypeScript, Fastify | PostgreSQL |
| [`order-service`](order-service/README.md) | Errand requests and their lifecycle | Node.js, TypeScript, Express | PostgreSQL |
| [`credit-service`](credit-service/README.md) | Credit balances, reservations and transfers | Node.js, TypeScript, Express | MongoDB (replica set) |
| [`recommendation-service`](recommendation-service/README.md) | Suggests a credit reward for a new errand from completed ones (N2H) | Node.js, TypeScript, Express | in-memory feature store |
| [`message-service`](message-service/README.md) | Direct messages between accounts, live over Socket.IO (N2H) | Node.js, TypeScript, Express, Socket.IO | MongoDB |
| [`rag-service`](rag-service/README.md) | Help assistant that answers from the help documents with Claude (N2H) | Python, FastAPI | in-memory FAISS index |
| [`web-client`](web-client/README.md) | Browser app (React) and the gateway in front of every service (nginx) | React, Vite, nginx | none |

- **Gateway:** the browser only talks to the web client, which forwards `/api/<service>/...` to the services. No service is reachable from outside directly ([ADR 0002](docs/decisions/0002-web-client-gateway.md)).
- **Authorization:** every service asks the user-service (`POST /internal/authorize`) on each protected request and refuses when it gets no clear yes ([ADR 0001](docs/decisions/0001-server-side-sessions.md)).
- **Events:** services announce changes asynchronously through RabbitMQ, published through an outbox and consumed idempotently. Conventions and the event catalog are in [`docs/events.md`](docs/events.md) ([ADR 0003](docs/decisions/0003-message-broker.md)).
- **Database per service:** each service owns its database; no other service reads it.

---

## Running locally

Requires only Docker. From the repository root:

```bash
docker compose up --build
```

| Component | URL |
| --- | --- |
| The app (web-client and gateway) | <http://localhost:8080> |
| user-service | <http://localhost:3001> |
| supplier-service | <http://localhost:3002> |
| order-service | <http://localhost:3003> |
| credit-service | <http://localhost:3004> |
| recommendation-service | <http://localhost:3006> |
| message-service | <http://localhost:3008> |
| rag-service | <http://localhost:3080> |
| Mailpit, catches every email locally | <http://localhost:8025> |
| RabbitMQ management UI (user `relay`, password `change-me`) | <http://localhost:15672> |

No `.env` is needed: every variable has a development default in `compose.yaml`. The first administrator is `admin` with the password `change-me`. To override a value, copy `.env.example` to `.env`. The help assistant needs a Claude API key in `CLAUDE_API_KEY`; without it the rest of the system works as usual.

`docker compose down -v` stops everything and deletes the local data. How to work on a single service, run its tests or develop the client with live reload is in that service's README.

---

## Deployment

The same Helm chart ([`deploy/helm/relay`](deploy/helm/relay)) and the same images run on a laptop and in the cloud; only the values files differ.

- **Local Kubernetes:** `deploy/scripts/local-up.sh` builds the images and installs the chart into a k3d cluster (<http://localhost:8081>).
- **Cloud:** one EC2 instance with k3s in AWS Singapore, created with Terraform ([`deploy/terraform`](deploy/terraform)). HTTPS through Traefik and cert-manager, horizontal autoscaling per service.
- **CI/CD:** GitHub Actions tests every pull request and publishes the images to GHCR on every merge into `dev` or `main`. A merge into `dev` is also rolled out to the running cloud instance. `deploy/scripts/cloud.sh start | stop | status` switches the instance on and off.

To try the live deployment, register with an `@u.nus.edu` or `@nus.edu.sg` address. No real email is sent: the verification code lands in the test inbox under `/mail/`, which the verify page links to.

Setup, secrets, network rules and autoscaling are described in [`docs/deployment.md`](docs/deployment.md), the reasons in [ADR 0004](docs/decisions/0004-cloud-deployment.md).

---

## Development workflow

Work is tracked in Linear (team `REL`); every backlog requirement is an issue there. Branches are cut from `dev` as `<type>/rel-<n>-<description>` and come back through a pull request into `dev`; `main` holds the submitted milestones. Conventions are in [`docs/workflow.md`](docs/workflow.md), the rules for coding agents in [`AGENTS.md`](AGENTS.md).

---

## Repository structure

One folder per service at the top level. A nice-to-have feature that warrants its own service gets another folder at the same level.

```text
.
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── recommendation-service/  N2H
├── message-service/      N2H
├── rag-service/          N2H
├── web-client/           browser app and gateway
├── deploy/               Helm chart, Terraform, deploy scripts
├── docs/                 decisions (ADRs), events, deployment, workflow
├── data/                 seed data for the supplier catalogue
├── postman/              API collections for manual testing
└── compose.yaml          the whole system for local development
```

`web-client/` has no `-service` suffix on purpose: it owns no bounded context, no data store and no domain API. It is a peer deployable, not a peer service.

---

## Declaration of AI-assisted work

Every member used Claude Code (Anthropic's Claude Opus and Sonnet models) to explain, generate, debug and review code and documentation. Requirements, architecture, service boundaries, data schemas, interfaces and the reasons behind each decision are the team's own work. Every AI-assisted result was reviewed, tested and, where needed, edited by the member who owns that part.

Each owner declares the details for their part in its README:

| Part | Owner | Declaration |
| --- | --- | --- |
| user-service | Felix Soeren Haag | [user-service/README.md](user-service/README.md#declaration-of-ai-assisted-work) |
| web-client (foundation, user and admin screens) | Felix Soeren Haag | [web-client/README.md](web-client/README.md#declaration-of-ai-assisted-work) |
| Deployment (Kubernetes, AWS, CI/CD) | Felix Soeren Haag | [docs/deployment.md](docs/deployment.md#declaration-of-ai-assisted-work) |
| supplier-service, maps and walking routes | Nguyen Viet Quang | [supplier-service/README.md](supplier-service/README.md#declaration-of-ai-assisted-work) |
| order-service, Admin Dashboard (Orders) | Truong Kim Mai | [order-service/README.md](order-service/README.md#declaration-of-ai-assisted-work) |
| credit-service | Dinh Khoat Hoang Long | [credit-service/README.md](credit-service/README.md#declaration-of-ai-assisted-work) |
| recommendation-service | Dinh Khoat Hoang Long | [recommendation-service/README.md](recommendation-service/README.md#declaration-of-ai-assisted-work) |
| rag-service | William Kento Rasmussen | [rag-service/README.md](rag-service/README.md#declaration-of-ai-assisted-work) |

The instructions the coding agents worked under are in the repository: [`AGENTS.md`](AGENTS.md) and the `AGENTS.md` in each service folder.
