# Prompt archive: 007

Received 2026-11-12 (Asia/Singapore).

## Prompts

```text
ok i want to set up the ci, cd, k8s files (might need kustomization.yaml also) for chat service first can follow the existing template. can please include this prompt and response in ai/prompts and ai/usage-log.md and do the necessary declaration comments on each file you create and edit?
```

```text
please confirm that you followed this

New files

# File Copy from What goes in it
1 k8s/chat-service/chat-config.yaml k8s/supplier-service/supplier-config.yaml ConfigMap chat-config: PORT=3005, PGDATABASE=chat_service, ORDER_SERVICE_URL=http://order-service.foc.svc.cluster.local:3003, USER_SERVICE_PUBLIC_KEY_PATH=/app/keys/public.pem
2 k8s/chat-service/chat-db.yaml k8s/supplier-service/supplier-db.yaml Service and StatefulSet chat-db (postgres:16, 1Gi volume). Leave out supplier's init and seed mounts, because chat creates its own tables.
3 k8s/chat-service/chat-service.yaml k8s/supplier-service/supplier-service.yaml Deployment (replicas: 1, image ghcr.io/ay2627s1-cs3219-p22/foc/chat-service:latest, envFrom chat-config and chat-secrets, the user-public-key mount, /health probes on 3005, small resource requests) and a Service named chat-service on port 3005
4 k8s/chat-service/kustomization.yaml supplier's kustomization Lists files 1–3, plus the images: block with newTag: latest. No configMapGenerator.
5 .github/workflows/chat-service.yaml .github/workflows/supplier-service.yaml Paths: chat-service/**, k8s/chat-service/** and the workflow file itself. The build job runs npm ci and npm run build in chat-service/. One image, with context: chat-service. Deploy waits for both statefulset/chat-db and deploy/chat-service.
There's also an optional k8s/chat-service/chat-secrets.yaml.example, a template that only documents what goes in the secret, like supplier has.
```

## Response (summary)

**Prompt 1.** Added chat-service Kubernetes manifests, a kustomization and a
CI/CD workflow from the existing templates, plus `CHAT_SERVICE_URL` in
`k8s/ui/ui.yaml` and chat in `k8s/README.md`. Chat runs one pod with no HPA,
because Socket.IO keeps chat rooms in the pod's memory, and has no migrate
initContainer, because it applies `schema.sql` on startup.

**Prompt 2.** The first version did not fully follow the spec: it was based on
credit's database and the UI workflow rather than supplier's, used a 2Gi volume,
a short `ORDER_SERVICE_URL`, separate `env` entries building `DATABASE_URL`
instead of `envFrom` chat-secrets, a TCP liveness probe, 250m CPU requests, a
non-headless Service and an extra `npm test` step, and the deploy waited only
for the Deployment. All files were rewritten from the supplier templates to
match the spec. `DATABASE_URL` now lives in chat-secrets, as in supplier.

Checks run: `kubectl kustomize` renders 5 objects; all YAML parses; the CD `sed`
pins the image to `sha-<commit>`; with chat-service from `ui/final-n2h`,
`npm ci` and `npm run build` pass, and the `runtime` Docker stage builds and
starts as uid 1000 with a read-only filesystem.
