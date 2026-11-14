<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-07
Scope: Wrote the start, stop and teardown checklist asked for in docs/ecs-fargate-session-prompt.md
       ("Starting and ending a test run"), using the resources George created. No requirements,
       architecture, schema, or API decisions were made by the AI tool.
Author review: George Yeo
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
Scope: Added the chat-service resources George created on 2026-11-10 (its RDS instance, ECS service,
       target group and load balancer rule), the schema-change and new-setting steps, and matching
       troubleshooting rows. No requirements, architecture, schema, or API decisions were made by
       the AI tool.
Author review: George Yeo
-->

# ECS Fargate: starting and stopping a test run

Region: `ap-southeast-1`. Cost figures are the plan's rough, unverified estimates. They were made before chat-service and its database were added, so the real figures are higher.

| State | Rough cost |
|---|---|
| Fully running | About $10/day |
| Stopped using this checklist | Storage only, plus small usage charges |
| Tasks and RDS off, but the load balancer and Redis left running | About $2/day |

## Stop

1. **Let the queues drain.** Don't start this with orders mid-delivery. Check that the `credit-worker` and `order-worker` logs have shown no new jobs for a few minutes, and that `chat-service` has no message translations still pending. Deleting Redis destroys anything still queued. Chat messages themselves are kept in MySQL.
2. **Scale down.** In **ECS → `foc`**, for each of the 9 services: **Update service**, set **Desired tasks** to `0`, and click **Update**.
3. **Delete the load balancer.** In **EC2 → Load balancers**, delete `foc-alb`. Keep the target groups.
4. **Delete both Redis clusters.** In **ElastiCache → Redis OSS caches**, delete `foc-order-redis` and `foc-supplier-redis`, with no final backup.
5. **Stop the databases.** In **RDS → Databases**, for each of the 5, including `foc-chat-service`: **Actions → Stop temporarily**, with no snapshot.
6. **Note the date.** RDS restarts stopped databases after 7 days, and they bill again. Stop them again, or run the full teardown.
7. **Check.** Wait a day, because billing data lags, then look in **Billing → Bills** for anything unexpected.

CloudFront, target groups, S3, ECR, SSM, the roles and the VPC stay in place. CloudFront will return errors until the next start.

Merges to `main` while stopped still build images and register new task definitions, and report that nothing started.

## Start

1. **Start the databases.** In **RDS → Databases**, for each of the 5: **Actions → Start**. Wait for **Available**.
2. **Recreate both Redis clusters**, with the names `foc-order-redis` and `foc-supplier-redis`:

   | Setting | Value |
   |---|---|
   | Option | Design your own cache, Cluster cache, cluster mode disabled |
   | Engine | Redis OSS 7.x, port `6379` |
   | Multi-AZ and auto-failover | Off |
   | Parameter group | `foc-redis` |
   | Node type and replicas | `cache.t4g.micro`, 0 replicas |
   | Subnet group | `foc-redis` |
   | Encryption | At rest on, in transit on, mode Required |
   | Access control | No access control |
   | Security group | `foc-redis` only. Check the review page, as this has dropped before |
   | Backups and logs | Off |

3. **Compare the Redis addresses.** The task definitions expect:
   - `master.foc-order-redis.ssesaz.apse1.cache.amazonaws.com`
   - `master.foc-supplier-redis.ssesaz.apse1.cache.amazonaws.com`

   If either changed, create new revisions of `order-service`, `order-worker`, `credit-service`, `credit-worker`, `supplier-service` and `supplier-worker` with the new `REDIS_HOST`. `chat-service` also uses `foc-order-redis`, so it needs one too if that address changed.
4. **Recreate the load balancer** `foc-alb`: Application Load Balancer, internet-facing, IPv4, in `foc-vpc`, with both public subnets, the `foc-alb` security group only, and an HTTP:80 listener forwarding to `foc-frontend`. Add these rules:

   | Priority | Paths | Forward to |
   |---|---|---|
   | 1 | `/api/v1`, `/api/v1/*` | `foc-supplier` |
   | 2 | `/auth`, `/auth/*`, `/users`, `/users/*` | `foc-user` |
   | 3 | `/admin/audit-logs`, `/admin/audit-logs/*` | `foc-user` |
   | 4 | `/credits`, `/credits/*` | `foc-credit` |
   | 5 | `/orders`, `/orders/*`, `/socket.io`, `/socket.io/*` | `foc-order` |
   | 6 | `/chat/conversations`, `/chat/conversations/*`, `/chat-socket.io`, `/chat-socket.io/*` | `foc-chat` |

   `/chat` and `/chat/:id` are frontend pages, so rule 6 leaves them on the frontend.

5. **Point CloudFront at it.** In **CloudFront → `E2R6YUXKH02JA7` → Origins → Edit**, paste the new load balancer DNS name, and keep **HTTP only**, port 80. Wait for it to deploy.
6. **Apply schema changes and new settings.** If merges since the last run changed a database schema or added a required setting, do [Before starting after merges](#before-starting-after-merges) first.
7. **Scale up, in this order.** Set **Desired tasks** to `1`: `user-service`, `credit-service`, `supplier-service`, `order-service`, `chat-service`, the 3 workers, then `frontend`. Wait for each web service to show **Completed**. `chat-service` must be running before `order-worker` starts, because a Service Connect client only learns the names that exist when it starts.
8. **Restart `user-service`.** Use **Update service → Force new deployment**, so it can find `credit-service`.
9. **Check** `https://d2wshq3pru0fir.cloudfront.net`: log in, browse suppliers, post an errand, and check that its chat appears.

## Before starting after merges

CD only swaps the image in each task definition. Two kinds of change need a hand step before the services start:

- **New required settings.** Compare each service's config schema (for example `user-service/src/config.ts` or `order-service/src/config/env.ts`) with what its task definition sets. A service missing one exits at startup with a config error naming it. Add it in a new task definition revision, built on the latest revision so it keeps CD's image.
- **Schema changes.** `order-service` and `chat-service` apply their Prisma migrations when they boot. The others don't:
  - `user-service`: run the new statements from `user-service/src/db/init.sql` as a one-off task (stock `postgres:16` image, `PGSSLMODE=require`, password from `/foc/user/db-password`). The statements use `IF NOT EXISTS`, so it's safe to run them again. Its Prisma baseline doesn't match this database, so don't mark it applied.
  - `credit-service` and `supplier-service`: apply the statements the merge added to their `src/db/init.sql` (and credit's `grants.sql`), the same way as their first bootstrap (plan Phase 2 step 16). Check that each statement is safe to run on a database that already has the earlier schema.

  One-off tasks log to `/ecs/foc/one-off` and must use the `foc-tasks` security group.

## Full teardown

First remove the team repo's `AWS_DEPLOY_ROLE_ARN` variable or disable the `Deploy` workflow, as merges will otherwise fail. Then delete in this order, and confirm with **Billing → Bills** and Cost Explorer that nothing is still billing:

1. ECS services, then the `foc` cluster
2. `foc-alb` and the 6 target groups
3. The CloudFront distribution (disable it first)
4. Both Redis clusters, then the `foc-redis` subnet and parameter groups
5. All 5 RDS instances with no final snapshot, then the `foc-rds` subnet group and `foc-mysql` parameter group
6. The S3 photo bucket (empty it first)
7. The 7 ECR repositories
8. All `/foc/...` SSM parameters: 14, plus `/foc/chat/db-password` if it was kept
9. The 10 `/ecs/foc/...` log groups, the task definitions (including the one-off ones), and the `foc` Cloud Map namespace
10. IAM roles `foc-ecs-task-execution`, `foc-supplier-task` and `foc-github-deploy`, plus the `foc-github-deploy` policy and the GitHub OIDC provider
11. The security groups, then `foc-vpc` last

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Posting an errand says "Supplier details could not be checked" | `order-service` is missing `SUPPLIER_SERVICE_URL`, or supplier is down or rate limited |
| A transfer fails with `COURIER_NOT_FOUND` | The courier has no credit balance, for example `superadmin` |
| A one-off task can't reach a database | It wasn't run with the `foc-tasks` security group |
| A Service Connect task fails to start | **Use log collection** was left on when creating the service |
| CloudFront returns `502` or `504` | The load balancer is gone, or CloudFront's origin is out of date |
| A task stops at boot with a config error naming a variable | A merge added a required setting. See [Before starting after merges](#before-starting-after-merges) |
| `user-service` exits at boot naming an `SMTP_` setting | With `NODE_ENV=production`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` must all be set |
| Login returns `500`, and the logs say `column ... does not exist` | A `user-service` schema change wasn't applied. See [Before starting after merges](#before-starting-after-merges) |
| A new errand gets no chat | `order-worker` started before `chat-service`, or lacks `CHAT_SERVICE_URL` or `CHAT_SERVICE_API_KEY`. Force a new deployment of `order-worker` |
| Messages send, but translations never appear | `TRANSLATION_LLM_KEY` is wrong, or `foc-order-redis` is unreachable. Check `/ecs/foc/chat-service` |
| A one-off MySQL task says `Unknown MySQL server host` | The endpoint is mistyped, or the instance isn't **Available** yet. Copy it from the RDS console |
