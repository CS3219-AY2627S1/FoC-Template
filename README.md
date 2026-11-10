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
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |

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
