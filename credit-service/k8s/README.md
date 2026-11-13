# Credit Service on Minikube

Owner review: Eldridge. Shared setup and Docker Hub publishing are in
[the cluster guide](../../deploy/k8s/README.md). Complete its namespace, User and gateway steps first.

The checked-in Deployment image remains `arkanian4/foc-credit-service:d3-1` until the Kafka-enabled
Credit image is published from `main`. Replace it with the exact SHA tag from the successful CI
summary before demonstrating event processing. Application port: 8083; the Service is
cluster-internal.

From the repository root, create the private password once (PowerShell 7.2+):

```powershell
./deploy/k8s/New-DatabaseSecret.ps1 -Service credit
```

The helper preserves an existing Secret and never prints/saves the password. If an existing
database claim has lost its Secret, recover its original credentials; do not generate a new
password for an initialized database. In Git Bash, invoke the helper with `pwsh -File`.

Provision the shared Kafka broker and client Secrets first, then deploy and wait for PostgreSQL
before starting the application:

```powershell
pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1
```

From Git Bash:

```bash
minikube -p foc-local kubectl -- --context=foc-local apply -f credit-service/k8s/database.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status statefulset/credit-db --timeout=180s
minikube -p foc-local kubectl -- --context=foc-local apply -f credit-service/k8s/config.yaml -f credit-service/k8s/service.yaml -f credit-service/k8s/deployment.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/credit-service --timeout=300s
```

Verify health, documentation, authorization rejection and the database (PowerShell):

```powershell
./deploy/k8s/Test-LocalDeployment.ps1 -Service credit
# Optional: replaces ONLY the database pod and checks that migrations/PVC survive.
./deploy/k8s/Test-LocalDeployment.ps1 -Service credit -CheckDatabaseRestart
```

The `/credits` UI and protected query APIs are available through the gateway. The ConfigMap enables
the Credit Kafka adapter at `kafka:9092`; the Deployment reads only the `credit_service` password
from `credit-kafka-client`. Credit consumes `user.events` and `order.events`, then publishes its
outcomes to `credit.events`. The pod will not start successfully if the required client Secret is
missing; the event flow will not exist until the Kafka-enabled image has been selected.

The application reads only its own database and validates User JWTs via the internal public
JWKS endpoint. No User signing key is copied here. The PostgreSQL StatefulSet uses a retained
5 GiB claim; keep the database at one replica. This is single-node persistence, not high
availability or backup. Stop Minikube to pause work; never delete the claim to restart a service.
