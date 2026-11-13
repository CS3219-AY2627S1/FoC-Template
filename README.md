# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.


**Live Application:** [Open FoC](https://cs3219-p24.mooo.com)

### Core Features

- **User Management:** Register with a NUS email address, verify the account,
  sign in, and manage personal profiles. Administrators can manage user
  accounts.

- **Supplier Management:** Browse campus suppliers, including their pickup
  information, categories, and opening hours. Administrators can create
  and update supplier listings.

- **Errand Management:** Create errand requests, accept courier work,
  record pickup, and confirm completion. Open requests can be cancelled
  or expire. Administrators can inspect order records.

- **Credit Management:** View credit balances, reserve credits when
  creating an errand, and pay the courier upon completion. Reserved
  credits are released following cancellation or expiry.


### Additional Features (N2H)

- **AI-Assisted Errand Creation:** Prepare and refine errand drafts through
  multi-turn interaction using text or voice input. Users can review and
  edit the generated details before submitting an errand.

- **Cloud Deployment and DevOps:** Access the application online through
  HTTPS. Containerized services run on AWS, with Terraform-managed
  infrastructure and GitHub Actions workflows for building and deploying
  application images.

- **Real-time Errand Chat:** Requesters and their assigned couriers can
  exchange text messages, photos, and videos within an errand, with
  real-time updates and read receipts. Chat history remains available
  after the errand ends.

- **Admin Dispute Resolution:** Order participants can report disputes
  and respond to complaints while normal order progression is paused
  and credits remain reserved. Administrators can review cases, dismiss
  disputes, or initiate payment to the courier or release of reserved
  credits to the requester.


### Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Core services | Java 25, Spring Boot, Spring Data JPA |
| Realtime service | Node.js, TypeScript, Socket.IO |
| Persistence and storage | PostgreSQL, Flyway, Amazon S3 |
| Service integration | HTTP, Amazon SNS/SQS, Spring Cloud AWS |
| Deployment | Docker Compose, Terraform, AWS ECS |


---


## Team Members and Mainly Responsible Areas

| Name               | Main Service                          | N2H            |
|--------------------|---------------------------------------|----------------|
| LOH WAI KIT        | Order Service | AI-Assisted Errand Creation |
| ARIFOVAS KRISTUPAS | User Service | Cloud Deployment and DevOps |
| LI KEHAN           | Supplier Service | Real-time Chat |
| XU ZIHAO           | Credit Service | Admin-Dispute System |


---


## Repository Structure

The four core services are independent Spring Boot modules in a Gradle
multi-project repository. Each service owns its source code, configuration,
database migrations, and tests.


```text
.
├── frontend/          # Web application
├── user-service/      # Accounts, authentication, and user profiles
├── supplier-service/  # Suppliers, pickup information, and supplier images
├── order-service/     # Errand lifecycle and AI-assisted drafting
├── credit-service/    # Credit accounts, reservations, payments, and refunds
├── realtime-service/  # Socket.IO updates for supplier changes and errand chat
├── infra/             # Terraform, gateway configuration, and local infrastructure
├── e2e-tests/         # Cross-service and browser tests
├── data/csv/          # Supplier seed data
├── docs/              # Supporting documentation and shared run configurations
├── compose.yaml       # Local development infrastructure and setup tasks
├── compose.prod.yaml  # Container stack using real AWS integrations
├── compose.prod-local.yaml
│                      # Container stack using the local AWS emulator
├── SETUP.md           # Local development guide
└── README.md
```


Services communicate through HTTP and asynchronous SNS/SQS events.
Local development uses Floci to emulate the required AWS services.


---


## Getting Started

Run the following commands from the repository root unless stated otherwise.


### Run in Containers

**Prerequisites:** Docker with Docker Compose and OpenSSL.

Follow the [container setup guide](docs/containers.md#setup) to:

1. Create `.env.prod` from `.env.prod.example` and configure the required values.
2. Generate the JWT signing and verification keys.
3. Configure email delivery and the initial administrator account.

After completing those steps, build the application, initialize its data,
and start the stack:

```bash
docker compose --env-file .env.prod -f compose.prod-local.yaml build

docker compose --env-file .env.prod -f compose.prod-local.yaml --profile setup run --rm admin-init

docker compose --env-file .env.prod -f compose.prod-local.yaml --profile setup run --rm supplier-seed

docker compose --env-file .env.prod -f compose.prod-local.yaml up -d
```

Open [https://localhost](https://localhost). The default local TLS
certificate is self-signed, so the browser displays a certificate warning.

This configuration runs the application in containers with PostgreSQL and
Floci. The setup tasks create a verified administrator and populate supplier
data.

See the [container guide](docs/containers.md) for configuration details,
later deployments, logs, and shutdown instructions.


### Local Development

**Prerequisites:** JDK 25, Node.js 22.12 or newer, npm, Docker with Docker
Compose, and OpenSSL. Shared IntelliJ IDEA run configurations are provided.

Follow [Local Development Setup](SETUP.md) to configure the environment,
JWT keys, email delivery, local infrastructure, and service run configurations.

Install the realtime service dependencies as described in its
[README](realtime-service/README.md), then launch the services using the
**Start all microservices** run configuration.

Start the frontend in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For first-time setup, follow the
[administrator setup instructions](user-service/README.md#local-admin-setup)
and [supplier data instructions](supplier-service/README.md#local-supplier-data).


### AWS Deployment

See the [AWS deployment guide](infra/terraform/README.md) for infrastructure
provisioning, application deployment, and operational procedures.


---


## Documentation

| Document | Contents |
| --- | --- |
| [Local Development Setup](SETUP.md) | Prerequisites, configuration, email verification, and local startup |
| [Container Guide](docs/containers.md) | Container setup, initialization, and operation |
| [AWS Deployment](infra/terraform/README.md) | Terraform infrastructure, deployment, and operations |
| [User Service](user-service/README.md) | User-created events, administrator setup, and service tests |
| [Supplier Service](supplier-service/README.md) | Supplier data initialization and service tests |
| [Order Service](order-service/README.md) | Order lifecycle, APIs, persistence, events, and service tests |
| [Credit Service](credit-service/README.md) | Credit operations, event integration, and service tests |
| [Realtime Service](realtime-service/README.md) | Local configuration, Socket.IO integration, and verification |
| [Frontend](frontend/README.md) | Frontend startup |
| [End-to-End Tests](e2e-tests/README.md) | Cross-service and browser tests, execution instructions, and reports |


---


## AI Use Summary


### Tools and Scope of Assistance

AI tools were used across the project to assist with implementation,
debugging, refactoring, testing, and documentation after the team had
defined the requirements and architecture.

| Tool | Usage |
| --- | --- |
| OpenAI Codex (GPT models) | Implementation assistance, debugging, refactoring, test-related assistance, documentation, and pull request review |
| GitHub Copilot | Assisted review of pull requests and code changes |

### Human Review

Team members performed cross-reviews of pull requests to check alignment
with the team's requirements and architectural design.

Human reviewers assessed architectural complexity, considered opportunities
for simplification, and evaluated whether implementations could be clearer
and more direct. Architectural evaluation and decisions remained the
responsibility of the team.


### Prompts and Key Exchanges

See the [AI usage log](ai/usage-log.md) for prompts, key responses,
affected files, and review records.


---
