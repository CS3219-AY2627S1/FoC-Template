# AI usage log: shared repository work

Repo-level work outside any one service (CI, Kubernetes, EKS). Service work is
logged in each service's own log.

## 001: CI review fixes for order and user workflows (PR #100)

- **Timestamp:** 2026-11-05 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Review of a teammate's CI pull request and fixes needed to
  deploy order-service and user-service on Kubernetes (EKS).
- **Prompts:** [prompts/001-pr100-ci-fixes.md](prompts/001-pr100-ci-fixes.md) (4 prompts).
- **Key responses:**
  1. "The user-service CI fails because the tests import `@prisma/client`
     before `prisma generate` has run, and neither workflow builds the
     `-migrate` images the Kubernetes initContainers need."
  2. "Replace the tests with `npm run build`, which already runs
     `prisma generate`. Keep the job, since `build-and-push-image` depends
     on it."
  3. "Added steps that build the Dockerfile's `migrate` stage and push it as
     `<service>-migrate`, with the same tags as the main image."
- **Key output:** user-service CI job renamed `test` → `build` and runs
  `npm run build`; both workflows also publish a `-migrate` image.
- **Affected locations:** `.github/workflows/user-service.yaml`,
  `.github/workflows/order-service.yaml`.
- **Human review/edits:** JadeCheah decided to drop the user-service tests
  from CI in favour of a build check and to publish migrate images; AI made
  the edits; JadeCheah reviewed the changes and approved.
- **External sources:** Failing GitHub Actions log for PR #100 (User Service
  CI); teammate's workflows in PR #100 (sunpterodactyl); Kubernetes manifests
  in PR #95, which name the `-migrate` images.

## 002: UI CI workflow

- **Timestamp:** 2026-11-05 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** New CI workflow so the UI image is published to GHCR for
  the Kubernetes (EKS) deployment.
- **Prompts:** [prompts/002-ui-ci.md](prompts/002-ui-ci.md) (2 prompts).
- **Key responses:**
  1. "Sure, here's a UI CI workflow following the `user-service.yaml`
     pattern: a build check on PRs, and on main a push of the `runtime`
     image to GHCR."
  2. "The other services are root npm workspaces covered by the root
     `package-lock.json`. The UI is not, so its build runs inside `ui/` with
     its own lockfile and Docker context."
- **Key output:** New `UI CI` workflow: build check on PRs; on main, builds
  the Dockerfile's `runtime` stage and pushes `foc/ui` with `sha-<sha>` and
  `latest` tags.
- **Affected locations:** `.github/workflows/ui.yaml`.
- **Human review/edits:** JadeCheah asked for UI CI following the
  user-service pattern and checked it against the other workflows; AI wrote
  the workflow; JadeCheah reviewed it and approved.
- **External sources:** `.github/workflows/user-service.yaml` (template);
  `ui/Dockerfile`, `ui/package.json`.

## 003: Debugging the user-service migration crash on EKS

- **Timestamp:** 2026-11-06 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Debugging a crash-looping migration initContainer during the
  first full-stack deploy on EKS.
- **Prompts:** [prompts/003-migrate-oomkilled.md](prompts/003-migrate-oomkilled.md) (3 prompts).
- **Key responses:**
  1. "The migrate initContainer is failing, so check its logs and whether the
     database is up."
  2. "The log stops right after Prisma connects with no error, which usually
     means the process was killed from outside. Check whether it was OOMKilled."
  3. "Confirmed OOMKilled: raise the migrate memory limit from 128Mi to 512Mi
     for user and order, which both run `prisma migrate deploy`."
- **Key output:** Migrate initContainer memory raised to 256Mi request / 512Mi
  limit for user-service and order-service.
- **Affected locations:** `k8s/user-service/user-service.yaml`,
  `k8s/order-service/order-service.yaml`.
- **Human review/edits:** JadeCheah ran the diagnosis commands on the cluster
  and applied the fix; AI identified the cause and made the edits; JadeCheah
  verified the migration completed and the service started.
- **External sources:** Pod status and logs from the EKS cluster (`kubectl`).

## 004: Kubernetes deployment README

- **Timestamp:** 2026-11-06 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Documentation of the EKS deployment.
- **Prompts:** [prompts/004-k8s-readme.md](prompts/004-k8s-readme.md) (1 prompt).
- **Key responses:**
  1. "Sure, here's a short README: an overview of how the deployment fits
     together, what each folder is, how images and deploys work, and a
     Continuous Deployment section with the OIDC setup and the steps for the
     deploy job."
- **Key output:** `k8s/README.md`.
- **Affected locations:** `k8s/README.md`.
- **Human review/edits:** JadeCheah set the scope and audience; AI wrote the
  README; JadeCheah reviewed it and approved.
- **External sources:** none.

## 005: gRPC load balancing across pods

- **Timestamp:** 2026-11-06 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus.
- **Mode/scenario:** Fixing gRPC calls that went to only one pod behind the
  Kubernetes Services, found while documenting the deployment.
- **Prompts:** [prompts/005-grpc-round-robin.md](prompts/005-grpc-round-robin.md) (1 prompt).
- **Key responses:**
  1. "Only the credit client balanced across pods; the others sent every call
     to one pod. Use round_robin for all clients, and have servers close
     connections periodically so clients find pods added by autoscaling."
- **Key output:** All gRPC clients balance across pods; servers pick up new pods.
- **Affected locations:** `shared/grpc/src/clients.ts`, `shared/grpc/src/server.ts`,
  `user-service/src/grpc/server.ts`.
- **Human review/edits:** JadeCheah flagged the issue and asked for the fix;
  AI made the edits; JadeCheah reviewed and approved.
- **External sources:** credit-service's existing gRPC server settings
  (`credit-service/src/grpc/server.ts`), reused for consistency.
# 006 Generic CI workflow
- **Timestamp:** 2026-11-09 (Asia/Singapore).
- **Tool/model:** Grok 4.7 (xAI), in Cursor.
- **Mode/scenario:** Add continuous deployment to the credit-service workflow
  while keeping pull-request checks. The supplied sample was an Elastic
  Beanstalk zip deploy of an Address Book app.
- **Prompts:** [prompts/003-cd.md](prompts/003-cd.md).
- **Key responses:** Pull requests keep test, lint, and the image build. A
  deploy job runs only on push to `main`, after those jobs pass, and applies
  the credit-service Kubernetes manifests to EKS with this commit's GHCR image.
  The Beanstalk zip was not used: credit-service is a compiled workspace image
  with an init migration container, and the repo already deploys it to EKS.
- **Key output:** `deploy` job in `.github/workflows/credit-service.yaml`.
  Follow-up: the image swap is a `sed` in that job. `GITHUB_SHA` matches the
  `sha-<commit>` tag published by `build-and-push-image`. The substitution
  rewrites both `image:` lines in `k8s/credit-service/credit-service.yaml`
  before one `kubectl apply`. A `:latest` substitution does not match these
  manifests, which pin `:sha-<commit>`.
  Follow-up: the human copied the credit deploy job into the order, user,
  supplier and UI workflows. Then a new prompt was made to change the deployed
  credit-service to use each services own mainfest. AI pointed each copy at its own manifests and
deployment, matched the `-migrate` images for order and user, set
  `needs: build-and-push-image`, and added `k8s/<service>/**` to each
  workflow's paths.
- **Affected locations:** `.github/workflows/credit-service.yaml`,
  `.github/workflows/order-service.yaml`, `.github/workflows/user-service.yaml`,
  `.github/workflows/supplier-service.yaml`, `.github/workflows/ui.yaml`,
  `k8s/user-service/kustomization.yaml`, `k8s/order-service/kustomization.yaml`,
  `k8s/supplier-service/kustomization.yaml`, `k8s/ui/kustomization.yaml`,
  `k8s/credit-service/kustomization.yaml`,
  `ai/usage-log.md`, `ai/prompts/003-cd.md`.
  Follow-up: the human asked whether Kustomize can replace the image-tag
  regex. AI added `k8s/user-service/kustomization.yaml` (app + config only)
  and the deploy job now sets `newTag` to `sha-${GITHUB_SHA}` then
  `kubectl apply -k`. The previous `kubectl kustomize | set image` line
  failed: there was no kustomization file, `user-service-image` is not a
  container name, and `my-registry` is not GHCR.
  Follow-up: added the same kustomization + `kubectl apply -k` deploy to
  order, supplier and UI. User already had it. Credit was left on the
  earlier sed apply because it was not in this request. Databases and
  example secrets stay out of each `resources:` list.
  Follow-up: added `k8s/credit-service/kustomization.yaml`. Credit has one
  image name (the migrate initContainer reuses the app image), plus config
  and HPA.
- **Human review/edits:** Human review done actually, I was q specific.
- **External sources:** Existing credit-service workflow and
  `k8s/credit-service/credit-service.yaml`. User-supplied Beanstalk sample
  (AddressBookApp, `einaregilsson/beanstalk-deploy@v22`, region
  `ap-southeast-1`).

## 007: chat-service CI/CD and Kubernetes manifests

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus 5.5.
- **Mode/scenario:** New CI/CD workflow and Kubernetes manifests so the chat
  service (N2H, on `ui/final-n2h`) deploys to EKS like the other services.
- **Prompts:** [prompts/007-chat-service-k8s-ci-cd.md](prompts/007-chat-service-k8s-ci-cd.md) (2 prompts).
- **Key responses:**
  1. "Chat runs exactly one pod with no HPA: Socket.IO keeps chat rooms in the
     pod's memory, so users on a second pod would not get each other's
     messages. Scaling it needs the Socket.IO Redis adapter plus sticky
     sessions. There is no migrate initContainer, because chat-service applies
     `schema.sql` on startup."
  2. "No, the first version did not fully follow your spec: it was based on
     credit's database and the UI workflow instead of supplier's, used a 2Gi
     volume, built `DATABASE_URL` from separate env entries instead of
     `envFrom` chat-secrets, had a TCP liveness probe, larger requests, a
     non-headless Service and an extra test step, and the deploy only waited
     for the Deployment." All files were then rewritten from the supplier
     templates to match the spec.
- **Key output:** `k8s/chat-service/` (ConfigMap, secrets template with
  `DATABASE_URL`/`PGUSER`/`PGPASSWORD`, Postgres 16 StatefulSet with 1Gi,
  one-replica Deployment + headless Service on 3005, kustomization);
  `Chat Service CI` workflow (`npm ci` + `npm run build` in `chat-service/`,
  image with `context: chat-service`, deploy waiting for `statefulset/chat-db`
  and `deployment/chat-service`); `CHAT_SERVICE_URL` for nginx; README updates.
- **Affected locations:** `k8s/chat-service/chat-config.yaml`,
  `k8s/chat-service/chat-secrets.yaml.example`, `k8s/chat-service/chat-db.yaml`,
  `k8s/chat-service/chat-service.yaml`, `k8s/chat-service/kustomization.yaml`,
  `.github/workflows/chat-service.yaml`, `k8s/ui/ui.yaml`, `k8s/README.md`,
  `ai/prompts/007-chat-service-k8s-ci-cd.md`, `ai/usage-log.md`.
- **Checks:** `kubectl kustomize k8s/chat-service` renders 5 objects; all new
  YAML parses; the deploy `sed` pins the image to `sha-<commit>`. Using
  chat-service from `ui/final-n2h`: `npm ci` and `npm run build` pass, and the
  `runtime` image builds and starts as uid 1000 with a read-only filesystem.
  Not yet run on the EKS cluster.
- **Human review/edits:** Karthika specified the file-by-file spec (templates,
  values, volume size, probes, deploy waits) and asked AI to confirm it was
  followed; AI wrote the files, found and fixed where the first version
  differed, and ran the checks above; Karthika reviewed the workflow.
- **External sources:** `k8s/supplier-service/` manifests and
  `.github/workflows/supplier-service.yaml` (templates); `chat-service/`
  Dockerfile, compose files, `src/env.ts`, `src/index.ts` and `ui/api/chat.ts`
  on `ui/final-n2h`.

## 008: chat-service autoscaling (Kubernetes side)

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus 5.5.
- **Mode/scenario:** Preparing chat-service to run more than one pod on EKS.
- **Prompts:** [prompts/008-chat-service-scaling.md](prompts/008-chat-service-scaling.md) (1 prompt, 1 choice).
- **Key responses:**
  1. "Scaling chat isn't a YAML-only change. Socket.IO keeps chat rooms in each
     pod's memory and the UI starts with HTTP polling, so chat-service needs
     the Socket.IO Redis adapter and the UI should connect with WebSocket only."
  2. "Turning on more pods before that code lands would split users across
     pods and messages would silently stop arriving, so Redis is deployed now
     and the HPA is ready but switched off."
- **Key output:** `chat-redis.yaml` and `REDIS_URL` (active); `chat-hpa.yaml`
  (2–6 pods at 70% CPU, commented out in `kustomization.yaml`); `replicas: 1`
  kept with instructions; "Enabling chat autoscaling" section in
  `k8s/README.md` with the chat-service and UI code changes and the two-line
  switch.
- **Affected locations:** `k8s/chat-service/chat-redis.yaml`,
  `k8s/chat-service/chat-hpa.yaml`, `k8s/chat-service/chat-config.yaml`,
  `k8s/chat-service/kustomization.yaml`, `k8s/chat-service/chat-service.yaml`,
  `k8s/README.md`, `ai/prompts/008-chat-service-scaling.md`, `ai/usage-log.md`.
- **Checks:** The README code snippet compiles against chat-service from
  `ui/final-n2h` (`npm run build`). `kubectl kustomize` renders Redis and one
  chat pod now, and an HPA with 2–6 pods once the switch is made. Not tested
  with two live pods or on the EKS cluster.
- **Human review/edits:** Karthika asked for chat scaling and chose to add the
  Kubernetes files only, leaving the code change to the chat-service owner;
  AI wrote the files and the instructions; Karthika has reviewed the code changes as well.
- **External sources:** `k8s/user-service/user-redis.yaml` and
  `k8s/credit-service/credit-hpa.yaml` (templates); `chat-service/src/index.ts`,
  `src/env.ts` and `ui/api/chat.ts` on `ui/final-n2h`; Socket.IO Redis adapter
  documentation (`@socket.io/redis-adapter`).

## 009: chat-service code for running several pods

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude Code (Anthropic), Claude Opus 5.5.
- **Mode/scenario:** Code changes on `ui/final-n2h` so chat-service can run
  more than one pod (Kubernetes side: entry 008).
- **Prompts:** [prompts/009-chat-scaling-code.md](prompts/009-chat-scaling-code.md) (1 prompt).
- **Key responses:**
  1. "With `REDIS_URL` set, chat-service attaches the Socket.IO Redis adapter,
     so a message sent through one pod reaches users on the other pods.
     Without it, rooms stay in memory, so local dev is unchanged."
  2. "Two pods starting together can both run `CREATE TABLE IF NOT EXISTS` and
     fail with a duplicate-key error, so `migrate()` now takes a Postgres
     advisory lock and the pods take turns."
  3. "The UI connects with WebSocket only, so each connection stays on one pod
     and no sticky sessions are needed."
- **Key output:** Redis adapter, Redis error logging and shutdown in
  chat-service; locked `migrate()`; WebSocket-only UI chat client; README and
  `.env.example` notes.
- **Affected locations (branch `ui/final-n2h`):** `chat-service/package.json`,
  `chat-service/package-lock.json`, `chat-service/src/env.ts`,
  `chat-service/src/index.ts`, `chat-service/src/db.ts`,
  `chat-service/.env.example`, `chat-service/README.md`, `ui/api/chat.ts`.
  **(branch `k8s-ui-chat`):** `k8s/README.md`,
  `ai/prompts/009-chat-scaling-code.md`, `ai/usage-log.md`.
- **Checks:** chat-service `npm run build`, test type-check and `npm test`
  (6/6); UI `npm run build`. Two chat instances sharing one Postgres and one
  Redis, started together on a fresh database, with a stand-in order service
  and test-signed tokens: requester on instance A and courier on instance B
  received each other's messages; without Redis, neither did. Not yet run on
  EKS.
- **Human review/edits:** Karthika asked for the code changes on
  `ui/final-n2h`; AI made and tested them; human review pending, and Maliha
  (chat-service owner) should review before merge.
- **External sources:** `@socket.io/redis-adapter` and `redis` (node-redis)
  package documentation; existing chat-service and UI code on `ui/final-n2h`.
