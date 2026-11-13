# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Role |
| ----- | ----- |
| Darren | **Internal Gateway & Authentication:** Implemented service-local JWT validation, the internal Nginx gateway, and a failure-simulation dashboard.<br><br>**Supplier Service:** Developed FastAPI endpoints, migrated persistence to SQLAlchemy, and implemented asynchronous request handling, soft deletion, authentication integration, and automated API tests.<br><br>**Order Service & Dispute Resolution:** Implemented order lifecycle and state-transition logic, idempotent creation, deadlines, and retries. Extended administrative dispute review and financial recovery workflows.<br><br>**Frontend:** Developed the order management interface, administrative dispute-review screens, and settlement status displays, and improved error handling.<br><br>**Infrastructure & Deployment:** Implemented Terraform provisioning for AWS ECS Fargate, networking, ECR, and RabbitMQ. Integrated services through Docker Compose and authored deployment documentation.<br><br>**Presentation:** Created slides explaining key design choices, supported by visual elements. |
| Yi Hong | **Supplier & Order Services:** Designed the initial backend PostgreSQL schemas for both services. Bootstrapped the FastAPI applications with core routing, repository structures and primary endpoints. Implemented a startup script to automatically seed supplier locations and hours from a CSV file. Prototyped initial RabbitMQ integration for the supplier service. <br><br>**System Reliability & Messaging:** Refactored the User Service to use a Transactional Outbox pattern. Replaced synchronous message queuing with a background worker that reliably relays user registration events to RabbitMQ, ensuring database records and system events stay perfectly synced.<br><br>**Audit Logging & Frontend:** Built the backend schema and repository hooks to automatically record an immutable history of every order status change. Developed the React frontend for the order timeline, using parameterised routing so users can click any order on their dashboard to view its specific, chronological audit log.<br><br>**Infrastructure & AWS Deployment:** Managed cloud infrastructure deployment using Terraform to provision AWS ECS, VPCs, ECR, and RabbitMQ clusters. Automated secrets management across Neon PostgreSQL and the microservices using Python scripts. <br><br>**Documentation & Project Delivery:** Authored documentation covering the Nice-to-Have (N2H) features, database schemas and architecture. Contributed to the final demo preparation, ensuring the deployment workflows, API integrations and UI were accurately showcased. |
| Kimberly | **User Service & Database Integration:** Implemented the initial SQL database operations and transaction handling for user accounts and authentication sessions, then migrated them to asynchronous SQLAlchemy. Developed ORM models, integrated database sessions into FastAPI dependencies, service and repository functions, and implemented initial Admin Manager bootstrapping. Worked on registration endpoints and troubleshot authentication and database connectivity issues.<br><br>**Order Service:** Developed the initial Order Service backend using PostgreSQL, including SQLAlchemy ORM models, Pydantic schemas, repository functions, and FastAPI endpoints for order creation, listing, acceptance, pickup, delivery, receipt confirmation, and cancellation. Implemented authorization checks, concurrency-safe order acceptance, lifecycle transitions, and deadline-based expiry handling. Integrated Credit Service through asynchronous reserve, release, and transfer commands, including transactional outbox publishing, credit result processing, duplicate handling, retries.<br><br>**Centralized Logging (N2H):** Implemented centralized logging using Grafana Alloy, Loki, and Grafana. Added structured JSON logging across Python microservices, Docker log collection, HTTP request-ID handling, and structured order/message identifiers to support troubleshooting across synchronous HTTP requests and asynchronous RabbitMQ communication.<br><br>**Documentation & Presentation:** Contributed to User Service documentation and presentation materials. Documented the centralized logging N2H implementation, including its architecture and technologies, and refined the transactional outbox diagram for the final presentation. |
| Wei Hung | **User Service & Authentication:** Set up a reusable React/Vite frontend template with shared API utilities, components, and layouts, alongside the User Service. Implemented sign-up/sign-in, profile management, JWT-based revocable sessions, protected routes, role-based access control, and the Admin Manager Portal with user search and grant/revoke administrator privileges.<br><br>**Credit Service:** Designed PostgreSQL wallet, reservation, and audit-log schemas; implemented automatic 100-credit allocation via `UserCreated` events, wallet reconciliation, atomic reserve/release/transfer operations with row locking and idempotency, transaction audit logging, and authenticated credit balance/history endpoints.<br><br>**Asynchronous Messaging:** Implemented RabbitMQ user-registration events and credit commands, transactional outbox, publisher confirmations, message acknowledgements/retries, duplicate-request handling, and persistent operation outcomes. Introduced six distinct credit success/rejection events and updated Order Service consumers for compatibility.<br><br>**Frontend & Deployment:** Developed responsive credit audit-log UI with automatic refresh, offset pagination, and error handling; integrated service APIs, configured frontend Docker/Nginx serving and Docker Compose (done as a group), connected services to PostgreSQL/Neon.<br><br>**Prototyping & Documentation:** Developed an initial draft UI prototype, proposed Figma Make for collaborative prototyping, and contributed to the D3 Order Lifecycle Diagram and demo preparation. |
| Kenneth Law | supplier-page/API integration, the end-to-end Keycloak authentication rollout (cancelled), delivery-location refactor across order creation, idempotency, and UI display, and saved-errand template as a nice to save feature: the user can save an order’s reusable details, then later prefill a new editable request that still validates the supplier and reserves credits normally. |

---

## Repository Structure

Each service has its own top-level folder: `user-service/`, `supplier-service/`,
`order-service/` and `credit-service/`. The frontend lives in `ui/` and HTTP routing
in `internal-gateway/`. See each folder's README for development instructions.

## Internal HTTP routing

Run `docker compose up --build` and open <http://127.0.0.1:4173>.

The UI and services route HTTP through `INTERNAL_GATEWAY_URL` (Compose:
`http://internal-gateway`). The [internal gateway](internal-gateway/README.md)
strips `/user-api/`, `/supplier-api/`, `/order-api/` or `/credit-api/` and forwards
to the matching service. Services enforce authentication and authorization.
The gateway is container-network-only; RabbitMQ and databases use separate connections.

## Deployment

For the ECS Fargate coursework demo, see [AWS deployment instructions](deploy/AWS.md)
and the implementation status in [report.md](report.md). Infrastructure is under
`deploy/terraform/`; AWS resources are created only when you explicitly apply a plan.

Deployment is a full cutover: reset the application databases and RabbitMQ queues
before starting the new stack. Confirm the exact targets before deleting data,
including on hosted/shared infrastructure. Services create tables from current
ORM metadata; no in-place schema migration or legacy-message compatibility is
supported. Startup does not automatically delete databases or queues.

---

## AI Use Summary

**Tools:** ChatGPT, Gemini (model details and usage dates documented in the AI usage log and source-file headers).

**Usage:**
- Generated initial React/Vite and FastAPI boilerplate and configuration.
- Assisted with frontend components, API integration, authentication, and administrative interfaces.
- Assisted with converting User Service database operations to asynchronous SQLAlchemy sessions.
- Assisted with Credit Service implementation, SQLAlchemy models, RabbitMQ messaging, and credit operations based on provided specifications.
- Assisted with initial Supplier and Order service implementations, SQLAlchemy models, RabbitMQ messaging based on provided specifications.
- Assisted with selected Order Service changes, including lifecycle handling, credit messaging, and outbox refactoring.
- Assisted with centralized logging using Grafana Alloy, Loki, and Grafana, including structured logs and correlation identifiers.
- Supported refactoring, debugging, testing, and documentation.
- Assisted with nginx configuration for internal gateway.
- Assisted with initial terraform write up for terraform.

**Verification:** AI-assisted code was reviewed and modified by team members, with verification details recorded where applicable.

**Disclosure:** AI-influenced files contain attribution comments. Exact prompts, key responses, and usage scenarios are recorded in the [AI Usage Log](ai/usage-log.md).

---
