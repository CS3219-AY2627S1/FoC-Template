# User Service on local Kubernetes

This is the first verified increment of the course's Minikube/Docker workflow. The application
image packages the User React frontend and Spring Boot backend. PostgreSQL has one StatefulSet
replica and a retained 5Gi PVC; application replicas share that database and the same signing key.

## Start or resume

Run Docker Desktop in Linux-container mode, then from the repository root in Git Bash:

```bash
minikube start -p foc-local --driver=docker
minikube -p foc-local kubectl -- --context=foc-local get nodes
```

Use the explicit context even when another Minikube profile is running. The namespace is also
named `foc-local`; the cluster profile and namespace are separate objects.

For a fresh cluster, create the namespace and local secret (the existing cluster already has it):

```bash
minikube -p foc-local kubectl -- --context=foc-local create namespace foc-local
minikube -p foc-local kubectl -- --context=foc-local -n foc-local create secret generic user-service-secrets \
  --from-file=DB_PASSWORD=user-service/k8s/db-password.key \
  --from-file=JWT_PRIVATE_KEY=user-service/k8s/jwt-private.key
```

The two `.key` files are ignored by Git. Generate a random password and Base64-encoded PKCS#8 RSA
private key for a new environment; do not rotate them merely to redeploy. The database password
must match the initialized PostgreSQL data. Never commit key files or exported Secret manifests.

The User deployment now enables its activation-event publisher and connects to `kafka:9092`
using its own `user-kafka-client` Secret. First provision the
[in-cluster Kafka setup](../../deploy/kafka/k8s/README.md), which creates that Secret without
exporting credentials. Compose's `.env` is not loaded by Kubernetes. Reapplying the User manifest
preserves the publisher settings; the separate optional Kafka connection patch is not required.

The demo also enables SendGrid. Before applying the Deployment on a fresh cluster, supply
`user-mail-secrets` with `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` (a verified SendGrid sender).
For example, put each value in its own private, Git-ignored `.key` file with no trailing newline:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local create secret generic user-mail-secrets \
  --from-file=SENDGRID_API_KEY=user-service/k8s/sendgrid-api.key \
  --from-file=SENDGRID_FROM_EMAIL=user-service/k8s/sendgrid-from.key
```

Do not commit these files or Secret exports. Each teammate supplies credentials in their own
cluster. Existing `.env` credentials are not imported automatically; the manifest contains
only Secret references. Do not recreate an existing Secret just to redeploy the application.

### First administrator (one-time setup)

Before the first User application startup, create `user-admin-bootstrap` with all three values
from the [User bootstrap contract](../README.md#first-administrator-bootstrap). Example private,
Git-ignored files (values only, no trailing newline):

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local create secret generic user-admin-bootstrap \
  --from-file=ADMIN_BOOTSTRAP_EMAIL=user-service/k8s/admin-email.key \
  --from-file=ADMIN_BOOTSTRAP_USERNAME=user-service/k8s/admin-username.key \
  --from-file=ADMIN_BOOTSTRAP_PASSWORD=user-service/k8s/admin-password.key
```

The Deployment references this Secret optionally: no Secret means bootstrap is disabled;
when present, all three valid values and working SendGrid must be supplied. An existing account
matched by email/username retains its existing password; bootstrap does not reset it. New or
unverified bootstrap accounts receive the normal verification email. Opening the site alone
does not run bootstrap or send another code. If the application is already running, restart its
Deployment after creating the Secret. A completed bootstrap is not rerun on later restarts.

Once the rollout succeeds and `admin_bootstrap_state.completed_at` is non-null, remove the
one-time credentials and restart to remove them from the running process environment:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local delete secret user-admin-bootstrap
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout restart deployment/user-service
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/user-service --timeout=300s
```

Keep the database/bootstrap state; do not reset accounts or migrations to rerun bootstrap.

### Deploy the application

```bash
minikube -p foc-local kubectl -- --context=foc-local apply -f user-service/k8s/database.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status statefulset/user-db --timeout=180s
minikube -p foc-local kubectl -- --context=foc-local apply -f user-service/k8s/deployment.yaml
minikube -p foc-local kubectl -- --context=foc-local apply -f user-service/k8s/service.yaml
minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/user-service --timeout=300s
minikube -p foc-local service user-service -n foc-local
```

Keep the service tunnel open on Windows. Use one browser address throughout a login session;
session storage belongs to its origin. This direct User NodePort supports the tutorial; use the
gateway entry point once the shared stack is deployed.

The Deployment enables the activation-event publisher at `kafka:9092` and reads only the
`user_service` password from `user-kafka-client`. Verification still commits through the database
when Kafka is temporarily unavailable; the durable outbox retries delivery after recovery.

## Verification and persistence

Check `/`, `/actuator/health`, `/.well-known/jwks.json` and that `/api/users/me` returns `401`
without a token. Startup and readiness use the existing health endpoint. PostgreSQL availability
does not drive an application liveness restart loop.

The Deployment uses `MAIL_PROVIDER=sendgrid` and runtime Secret references so normal registration
can deliver a verification code. The initial Kubernetes demo used `noop`; that disabled email only
in Kubernetes and did not change Compose's `.env` settings. Missing/invalid credentials or an
unverified SendGrid sender must be corrected before claiming end-to-end activation works.
Do not bypass verification by changing application account data during infrastructure testing.
After verifying a new account through the normal UI, confirm its `UserActivated` event appears
in Kafka UI's `user.events` topic and its User outbox row has a non-null `published_at`.
Logging in to an already-active account does not publish a new activation event.

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local exec user-db-0 -- \
  psql -U user_user -d user_db -c 'SELECT COUNT(*) FROM users;'
```

Record the count, deliberately replace only `user-db-0`, wait for its replacement to become ready,
and repeat the query. The count and PVC UID should remain unchanged. A backup/restore test gives
stronger protection than a restart test alone.

`minikube stop -p foc-local` pauses the cluster. Do not delete the profile, PVC or namespace to
stop applications: local storage can be lost. StatefulSet retention preserves claims when the
StatefulSet is removed; it does not make explicit PVC deletion safe. Compose volumes are separate
and are never imported automatically.
