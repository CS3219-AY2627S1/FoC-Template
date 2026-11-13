# Application image refresh

`latest-build.json` records the seven application image digests, previous ECS task
definitions for rollback, new revisions and additive database verification tasks.
It contains no credentials. The chat service image is updated through its
CloudFormation Image parameter. Other existing services use their new registered
revisions with previous environment, secrets, network and telemetry settings.

Verification on 11 November 2026: all seven production builds passed. Additive
Prisma initialization and verification passed for user, supplier, order and credit.
Public integration tests passed registration, login, refresh, backend APIs, errand
creation, credit hold, chat message/history and WebSocket delivery, delivery and
credit settlement. `verify-traces.py` confirmed all four instrumented backends
propagate the supplied X-Trace-Id and export matching traces with authenticated
user.id to Tempo. Verification creates disposable users and completed errands.

Current gateway at verification: http://13.229.108.70 (task replacement changes IP).
Monitoring images and RabbitMQ were not changed by this application refresh.

```powershell
python scripts/aws/rollouts/verify-traces.py http://GATEWAY_IP http://localhost:3000
```

The trace check requires an open Grafana tunnel and its existing anonymous Viewer
access to the Tempo datasource proxy.
