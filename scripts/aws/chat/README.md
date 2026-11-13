# AWS chat deployment

Chat runs as one Fargate task in `campusgo`, discovered as `chat.campusgo.local`.
The `campusgo-chat` CloudFormation stack owns its ECR repository, service,
execution role, Cloud Map entry, logs and runtime secret. The chat PostgreSQL
database shares the existing RDS instance and survives task replacement.

`campusgo/chat/runtime` contains DATABASE_URL (chat database only),
JWT_ACCESS_SECRET and RABBITMQ_CONNECTION. ECS injects these at startup.
Do not print the secret or copy its values into deployment files.

`initialize.ts` is run once with `deno eval --ext=ts` as a command override
on the chat task. It creates the chat database only if absent and runs additive
Prisma initialization followed by schema verification. Run initialization with
DesiredCount=0, then set the stack DesiredCount parameter to 1. Keep exactly one
replica until shared WebSocket fanout is implemented.

The production image includes the AWS RDS certificate bundle. The deployed chat
image tag is `chat-20261110-rds`, pinned by digest in CloudFormation. Gateway and
frontend use tag `chat-20261110`, pinned by digest in their ECS revisions.
`deployment.json` records initialization and gateway/frontend rollback revisions.

The AWS gateway substitutes the chat discovery name and forwards WebSocket
upgrades on both proxy hops. Restarting the gateway changes its public task IP;
use `../power.ps1 -Action Status` to find the current URL. Daily power and
redeployment scripts include chat-service.

Verification on 10 November 2026: database schema verified; registration, login,
refresh, all backend APIs, errand creation/acceptance, chat REST message/history,
WebSocket ping and live message delivery, errand delivery and credit settlement
passed through the public gateway. The test created disposable users and a completed
errand. Existing errands created before chat started are not backfilled.

Run the integration check (creates disposable users and a completed errand):

```powershell
uv run --with websockets python scripts/aws/chat/smoke-test.py http://GATEWAY_IP --errand
```

Rollback gateway/frontend to the revisions in deployment.json. Scale chat to zero
before removing it. Retain its database, secret and repository when rolling back.
