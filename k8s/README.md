<!-- AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-11-06-2026-11-12. Details: ai/usage-log.md, entry 004, 007, 008, 009. -->

# Kubernetes (EKS) deployment

FoC runs on an AWS EKS cluster in the team's NUS AWS sandbox. Everything lives
in the `foc` namespace. Only the UI is public; the services talk to each other
inside the cluster.

```
browser ──http──► AWS load balancer ──► ui (nginx) ──/backend/*──► user · supplier · order · credit · chat
                                                                     │        each has its own Postgres
                                                                     └─────── events via RabbitMQ
```

## What's in this folder

| Path | What it is |
|---|---|
| `eks/cluster.yaml` | Cluster config for `eksctl`: 3 × t3.medium nodes, OIDC, EBS disks, metrics-server |
| `shared/` | `foc` namespace and RabbitMQ |
| `<service>/` | One folder per service: config (ConfigMap), database (StatefulSet with a disk), app (Deployment + Service), HPA for order and credit, and a `*-secrets.yaml.example` listing the secret keys |
| `ui/ui.yaml` | nginx UI plus a `LoadBalancer` Service, which gives the public link |

Key ideas:
- **Config vs secrets:** non-secret settings are in the `*-config.yaml` files. Passwords and tokens are created with `kubectl create secret` and are never committed.
- **Migrations:** user, order and credit run their migrations in an `initContainer` before the app starts. Supplier's database sets itself up from `supplier-service/db/init/` on first start. Chat creates its tables itself on startup (`chat-service/schema.sql`).
- **Autoscaling:** order and credit run 2–6 pods, adding pods when average CPU is above 70% of their request.

## Images

- CI builds every service on merge to `main` and pushes to GHCR (public packages) as `sha-<commit>` and `latest`.
  `latest` only moves after the build passes, and never back to an older commit.
- **Fresh cluster:** manifests use `latest` with `imagePullPolicy: Always`, so `kubectl apply` starts the newest build of each service. Nothing to bump by hand.
- **After that:** CD deploys each merge by its exact `sha-<commit>` tag, so the running version is traceable and a rollback is `kubectl set image` to an earlier SHA.
- Which build is running: `kubectl -n foc get deploy -o wide` (shows the tag), or the pod's `imageID` (exact digest).

## Deploying (Manually)

Creating or deleting the cluster needs access to the team's AWS sandbox
(currently JadeCheah). Teammates don't need AWS access to ship code: merge to
`main` and CD deploys it (see below).

Reference steps for a fresh cluster (run from the repo root, logged in with `aws sso login`):

1. `eksctl create cluster -f k8s/eks/cluster.yaml` (about 20 min). This also creates
   the `foc/user-service` service account and its IAM role (IRSA), which lets
   user-service send OTP email through SES. On a cluster that already exists, run
   `eksctl create iamserviceaccount --config-file k8s/eks/cluster.yaml --approve`.
2. `kubectl apply -f k8s/shared/namespace.yaml`
3. Create the secrets listed in each `*-secrets.yaml.example`, plus `rabbitmq-secrets`
   (`RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`). Order and credit must share the
   same `CREDIT_ORDER_SERVICE_TOKEN`.
4. Create the file-based config:
   ```bash
   kubectl -n foc create configmap user-public-key --from-file=public.pem=user-service/keys/public.pem
   kubectl -n foc create secret generic user-jwt-private-key --from-file=private.pem=user-service/keys/private.pem
   kubectl -n foc create secret generic user-otp-key --from-file=otp.key=<fresh key from `openssl rand -base64 32`>
   kubectl -n foc create configmap supplier-db-init --from-file=supplier-service/db/init/
   kubectl -n foc create configmap supplier-db-seed --from-file=supplier-service/data/campus_suppliers.json
   ```
5. Apply in order, waiting for each to be ready: `shared/rabbitmq.yaml` → `user-service/` →
   `credit-service/` → `supplier-service/` → `order-service/` → `chat-service/` → `ui/`
   (use `kubectl apply -k k8s/<service>/` for folders with a `kustomization.yaml`)
6. The link: `kubectl -n foc get svc ui` → open `http://<EXTERNAL-IP hostname>`

**Teardown:** delete the namespace first (`kubectl delete namespace foc`), so the load
balancer and database disks are removed, then `eksctl delete cluster -f k8s/eks/cluster.yaml`.
The cluster costs credits while it runs, so it is only up for sessions and the demo.

## CD (continuous deployment)

Goal: after a merge to `main`, the new image is deployed automatically if the cluster is up.

How access works: GitHub Actions logs in to AWS with **OIDC**, so no AWS keys are
stored anywhere. GitHub proves "this is a workflow on `main` of this repo", and AWS
returns short-lived credentials for the role `foc-github-deploy`. That role can only
read the cluster's details and edit resources in the `foc` namespace.

To add it, put a `deploy` job at the end of each service workflow:

1. `needs: build-and-push-image`, and run only on push to `main`.
2. Job permissions: `id-token: write` (to request the OIDC token) and `contents: read`.
3. Log in: `aws-actions/configure-aws-credentials@v4` with
   `role-to-assume: arn:aws:iam::200340799641:role/foc-github-deploy` and
   `aws-region: ap-southeast-1`.
4. Skip when the cluster is down: `aws eks describe-cluster --name foc || exit 0`.
5. Connect: `aws eks update-kubeconfig --name foc --region ap-southeast-1`.
6. Apply the service's manifests with this build's exact tag swapped in for `latest`,
   so manifest and config changes ship together with the new image:
   ```bash
   sed "s|:latest|:sha-${{ github.sha }}|" k8s/order-service/*.yaml | kubectl apply -f -
   kubectl -n foc rollout status deployment/order-service --timeout=5m
   ```
   One apply, one rolling update. The `sed` covers the app and `migrate` images together,
   and new pods start with the latest config. Use `k8s/ui/ui.yaml` for the UI.
7. Add `k8s/<service>/**` to the workflow's `paths:`, so a manifest-only change also deploys.

Things to know:
- The role only trusts `main`, so the job can't be tested from a PR branch.
- CD never creates or changes **secrets**. If new code needs a new secret key, create it
  before merging, or the new pods fail to start (the old ones keep running).
- A manual `kubectl apply -f k8s/...` deploys `latest`, i.e. the newest builds. That is fine;
  the next CD deploy switches back to an exact SHA.
- No image pull secret is needed, since the GHCR packages are public.

## Autoscaling demo

```bash
kubectl -n foc get hpa order-service -w        # terminal 1: watch replicas
for i in 1 2 3 4; do                            # terminal 2: generate load
  kubectl -n foc run load-$i --image=busybox:1.36 --labels=role=load --restart=Never -- \
    sh -c 'while true; do wget -q -O- http://order-service:3003/health >/dev/null; done'
done
kubectl -n foc delete pod -l role=load          # stop; scales back down after ~2 min
```

## Known limitations

- **http only:** HTTPS needs a domain and certificate. Because of that, `user-config.yaml`
  sets `COOKIE_SECURE: "false"` so the login cookie works over http.
- **Single replica databases** on one disk each. Fine for the demo, not highly available.
- **Chat runs one pod until its autoscaling is enabled** (next section). Socket.IO keeps chat
  rooms in the pod's memory, so a second pod would not see the first pod's users. Open chats
  reconnect automatically after a restart or deploy.
- **SES sandbox:** OTP email is sent from `campusdash.otp@gmail.com` (verified in SES,
  ap-southeast-1). Until SES production access is granted, every recipient address must
  also be verified (`aws sesv2 create-email-identity`), so verify demo accounts first.

## Chat autoscaling

`chat-hpa.yaml` scales chat-service between 2 and 6 pods at 70% CPU. It works because of:

1. **chat-service** (ai/usage-log.md entry 009): with `REDIS_URL` set, the Socket.IO Redis
   adapter (`chat-redis.yaml`) shares chat rooms between pods, and `migrate()` takes a
   Postgres advisory lock so pods starting together don't race creating the tables. See
   "Running several instances" in `chat-service/README.md`.
2. **UI**: `ui/api/chat.ts` connects with `transports: ["websocket"]`, so each chat stays on
   one pod for its whole connection and no sticky sessions are needed.
3. **Kubernetes**: `chat-service.yaml` has no `replicas` field, so the HPA owns the pod count.

Check with `kubectl -n foc get hpa chat-service` (2 pods), then open the same errand's chat as
requester and courier in two browsers: messages must arrive both ways. The 5-minute cleanup
of ended chats runs on every pod; that is safe, since deleting the same rows twice does nothing.

## Troubleshooting

| You see | Usually means |
|---|---|
| `ImagePullBackOff` | Wrong tag, or the image was never built (check that service's CI run) |
| `Init:CrashLoopBackOff` | Migration failed: `kubectl -n foc logs deploy/<svc> -c migrate` |
| `OOMKilled` | Container hit its memory limit; raise `limits.memory` |
| Pod stuck `ContainerCreating` | A secret or ConfigMap it mounts is missing: `kubectl -n foc describe pod <pod>` |
| HPA shows `<unknown>` | Normal for the first minute after deploy |
| user-service pods not created, `serviceaccount "user-service" not found` | Run the `eksctl create iamserviceaccount` command in step 1 |
| Sign-up returns 500 "Failed to send OTP" | `kubectl -n foc logs deploy/user-service \| grep -A3 "Error sending"`. `MessageRejected`: recipient not verified (SES sandbox). `AccessDenied`: check the role in `cluster.yaml` |
