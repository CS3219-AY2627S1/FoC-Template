# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Ownership |
| ---- | --------- |
| Maegan-Ruth Tan Hui En | Supplier service, Credit service, Cloud Deployment, CI/CD, secret and config management, Bookmarking suppliers |
| Huang Yining | User service, Credit integration with frontend, Reordering flow |
| Brenda Tan Kai Xin | Frontend (React/Vite UI, auth screens, suppliers, campus map, account/credits UX), Admin Dashboard |
| Low Chloe | MS2 frontend integration (user and supplier), Order service, Notification service |


---

## Repository Structure

This repository follows a **one-service-per-folder** structure. Shared frontend
and API gateway live alongside the microservices.

```text
.
├── frontend/           # React + TypeScript + Vite client
├── gateway/            # API gateway (proxies to services)
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── notification-service/  # N2H: email notifications
├── compose.yaml        # Root Docker Compose orchestration
├── ai/                 # AI usage log for coursework disclosure
└── README.md
```

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

---

## Running locally (dev)

**Backend / services** (from repo root):

```bash
docker compose up --build
```

Gateway is exposed at `http://localhost:8080`.

**Frontend**:

```bash
cd frontend
npm install
npm run dev
```

App is at `http://localhost:5173` (Vite). Point the frontend at the gateway
via `frontend/.env` (see `frontend/.env.example` if present).

---

## AI Use Summary

Tools used:

- Cursor (GPT-5.6 Sol Medium / Composer) — frontend implementation, debugging, and UI refinement (suppliers, campus map clustering, account/password UX, forms).
- ChatGPT (GPT-5.6 Sol) — learning support, code explanations and debugging guidance.
- Claude (Opus 5.5) — notification service implementation (RabbitMQ consumer, SNS publishing and auto-subscribe), related order event changes, tests, and local Docker troubleshooting.

Prohibited phases avoided:

- Requirements elicitation
- Architecture/design decisions
- Service boundary and API design decisions

The frontend implementation was developed with substantial Cursor assistance.
The author reviewed and tested the generated code and iteratively refined the implementation through follow-up instructions.

Project requirements, architecture, service boundaries and API decisions were determined by the team. 

See [`ai/usage-log.md`](./ai/usage-log.md) for prompts and usage details.

## References

- Task definitions for AWS ECS were referenced from: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/example_task_definitions.html#example_task_definition-webserver
