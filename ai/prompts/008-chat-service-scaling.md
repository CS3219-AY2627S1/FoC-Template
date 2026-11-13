# Prompt archive: 008

Received 2026-11-12 (Asia/Singapore).

## Prompts

```text
can we implement scaling for chat service as well?
```

Follow-up choice (answered in Claude Code's question dialog): the chat code is
only on `ui/final-n2h`, and merging it into `k8s-ui-chat` conflicts in five UI
files. Options were to split the work across two branches, merge `ui/final-n2h`
here, or do the Kubernetes files only. Answer: **"Kubernetes files only for now"**.

## Response (summary)

Scaling chat needs code changes, not just YAML: Socket.IO keeps chat rooms in
each pod's memory, and the UI client starts with HTTP polling. So:

- Added `k8s/chat-service/chat-redis.yaml` (copied from `user-redis.yaml`) and
  `REDIS_URL` in `chat-config.yaml`; both are deployed and harmless with one pod.
- Added `k8s/chat-service/chat-hpa.yaml` (copied from `credit-hpa.yaml`: 2–6 pods,
  70% CPU, 5-minute scale-down window) but left it commented out in
  `kustomization.yaml`, and kept `replicas: 1`, so chat cannot run 2+ pods
  before the code supports it.
- Documented the code changes (Redis adapter in chat-service, WebSocket-only
  transport in `ui/api/chat.ts`) and the two-line switch in `k8s/README.md`,
  "Enabling chat autoscaling".

Checks run: the README snippet compiles against chat-service from
`ui/final-n2h` (`npm run build`); `kubectl kustomize` renders Redis and one chat
pod now, and an HPA with 2–6 pods once enabled. Not tested with two live pods.
