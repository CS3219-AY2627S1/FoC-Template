# Supplier Service on Minikube

Owner review: Jun Hui. Shared setup and Docker Hub publishing are in
[the cluster guide](../../deploy/k8s/README.md). Complete its namespace, User and gateway steps first.

The Deployment downloads `arkanian4/foc-supplier-service:d3-1` from Docker Hub. No local build is
needed to use the published release. Application port: 8080; the Service is cluster-internal.

From the repository root, create the private password once (PowerShell 7.2+):

```powershell
./deploy/k8s/New-DatabaseSecret.ps1 -Service supplier
```

The helper preserves an existing Secret and never prints/saves the password. If an existing
database claim has lost its Secret, recover its original credentials; do not generate a new
password for an initialized database. In Git Bash, invoke the helper with `pwsh -File`.

Deploy and wait for PostgreSQL before starting the application (Git Bash):

```bash
minikube -p foc-local kubectl -- --context=foc-local apply -f supplier-service/k8s/database.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status statefulset/supplier-db --timeout=180s
minikube -p foc-local kubectl -- --context=foc-local apply -f supplier-service/k8s/config.yaml -f supplier-service/k8s/service.yaml -f supplier-service/k8s/deployment.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/supplier-service --timeout=300s
```

Verify health, documentation, authorization rejection and the database (PowerShell):

```powershell
./deploy/k8s/Test-LocalDeployment.ps1 -Service supplier
# Optional: replaces ONLY the database pod and checks that migrations/PVC survive.
./deploy/k8s/Test-LocalDeployment.ps1 -Service supplier -CheckDatabaseRestart
```

Public Supplier reads and the packaged `/suppliers` UI are available through the gateway. Administrative endpoints still require an ADMIN JWT.

The application reads only its own database and validates User JWTs via the internal public
JWKS endpoint. No User signing key is copied here. The PostgreSQL StatefulSet uses a retained
5 GiB claim; keep the database at one replica. This is single-node persistence, not high
availability or backup. Stop Minikube to pause work; never delete the claim to restart a service.
