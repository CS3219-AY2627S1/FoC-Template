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
| Marcus | User service, Local infrastructure management (docker, compose, nginx), Frontend login and token management, N2H - Observability and tracing |
| Jun Yi | Supplier Service backend, Credit Service backend, Credit Service rabbitMQ integration, Cloud Deployment, Profile Management UI |
| Sukanya | Order Service backend, Order service RabbitMQ events, N2H - Chat service backend (live chat with message history and image support) |
| Nicholas | Order Service backend, Frontend for Supplier, Order, Credit, Live Chat and Admin Dashboard, N2H - Order History, Reordering Errand, Favourites/Bookmarking, Admin UI |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`) lives in its own top-level folder.

```text
.
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── <n2h-service>/
└── README.md
```

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

---

## Running
the docker compose file is structured around splitting dev and production

you can run dev via `docker compose --profile dev up -d --build`

The original local setup is retained: `edge_dev` forwards API traffic to
`api_gateway`, which routes requests to the backends. AWS-specific packaging
lives separately under `scripts/aws/gateway/`.

Cloud deployment and pause/resume commands: [AWS runbook](scripts/aws/README.md).

## AI assistance disclosure

OpenAI Codex assisted with implementation, deployment, debugging and verification.
The 2026-11-06 deployment implements the user's choice of separate ECS services,
with Nginx in its own service. The original gateway and local Compose files are restored. See [usage log](ai/usage-log.md).
This statement is not a declaration that every earlier use complied with the course
policy; the team must review the earlier architecture discussion and complete its
full disclosure before submission. Human review of the latest changes is pending.

