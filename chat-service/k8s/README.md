# Chat Service on local Kubernetes

These manifests run the Chat Service with its private PostgreSQL database and a single-node,
persistent RabbitMQ broker in the existing `foc-local` Minikube namespace. This is a local/demo
topology, not a highly available broker cluster.

The manifests pin published revision `ce035eee7ff4eda6972fa4554714051b6314b209` from successful
[CI run 42501172138](https://github.com/AY2627S1-CS3219-P12/FoC-Team-12/actions/runs/42501172138),
attempt 1. Admin, User, Order, Credit and Gateway use that same revision. These images exclude
the Admin GUI/client edits in this PR. Do not substitute local side-chat builds as acceptance evidence.

From the repository root, with Docker Desktop and the existing `foc-local` running:

```bash
# Preserves broker data, adds the Chat identity if missing and reruns topic/ACL initialization.
pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1
pwsh -File chat-service/k8s/New-ChatSecrets.ps1

# Requires existing independent service signing keys; never copy User's JWT signing key.
pwsh -File admin-service/k8s/Reconcile-ChatTrust.ps1 -Apply

kubectl --context=foc-local apply \
  -f chat-service/k8s/config.yaml \
  -f chat-service/k8s/database.yaml \
  -f chat-service/k8s/rabbitmq.yaml \
  -f chat-service/k8s/service.yaml \
  -f chat-service/k8s/deployment.yaml

kubectl --context=foc-local apply \
  -f deploy/k8s/network/policies.yaml \
  -f admin-service/k8s/network.yaml \
  -f chat-service/k8s/network.yaml

kubectl --context=foc-local apply -f gateway-service/k8s/deployment.yaml
kubectl --context=foc-local -n foc-local rollout status statefulset/chat-db --timeout=180s
kubectl --context=foc-local -n foc-local rollout status statefulset/rabbitmq --timeout=180s
kubectl --context=foc-local -n foc-local rollout status deployment/chat-service --timeout=300s
kubectl --context=foc-local -n foc-local rollout status deployment/gateway --timeout=300s
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service chat
```

The secret helpers preserve existing credentials and refuse to replace a missing Secret when its
persistent volume already exists. Do not commit generated credentials. `Apply-LocalKafka.ps1`
restarts the broker only when configuration or credential versions change, then reruns the
idempotent initializer so the `chat_service` ACL exists.

The Chat ConfigMap supplies explicit private Admin/User/Order/Credit URLs. Chat egress and producer
ingress allow only the existing HTTP ports. The pinned image's spring UID/GID is 999; Kubernetes
runAsNonRoot cannot verify its named image user without numeric runAsUser/runAsGroup settings.
These IDs apply to the pinned ce035ee image; newer source uses UID/GID 10001. Recheck the image
identity and update the manifest together when selecting a newer published tag.
Use the repository policies rather than extra foc-user-chat, foc-kafka-chat or foc-gateway-chat
runtime-only policies. Database access remains service-private.

Reconcile-ChatTrust.ps1 checks Admin→Chat and Chat→Admin/User/Order/Credit pins against the existing
signing identities. Default mode only checks; -Apply adds missing public pins. It validates every
map before patching and checks resourceVersion to reject concurrent changes. Existing private
keys, unrelated pins and database credentials are preserved; conflicting pins fail closed.
It does not generate/rotate keys or restart pods. Fresh clusters need separately provisioned
service identities before using this existing-cluster helper. ServiceTrustProbe.java tests internal
route/audience checks from caller pods without exporting their keys; it is not business acceptance.

Translation stays disabled when the optional `chat-translation-secrets` Secret is absent. To
enable Gemini locally, create that Secret from a private, ignored env file containing only
`CHAT_TRANSLATION_PROVIDER=gemini` and `GEMINI_API_KEY=...`, then restart Chat:

```bash
kubectl --context=foc-local -n foc-local create secret generic chat-translation-secrets \
  --from-env-file=.env.chat-translation --dry-run=client -o yaml | \
  kubectl --context=foc-local apply -f -
kubectl --context=foc-local -n foc-local rollout restart deployment/chat-service
```

Delete the temporary env file after applying it and never commit it.

The RabbitMQ management page is intentionally not exposed through Gateway. For local inspection:

```bash
kubectl --context=foc-local -n foc-local port-forward service/rabbitmq 15672:15672 --address=127.0.0.1
```

The management login username is `chat_service`. Copy its password without printing it into
shared logs:

```bash
kubectl --context=foc-local -n foc-local get secret chat-service-secrets \
  -o jsonpath='{.data.RABBITMQ_PASSWORD}' | base64 --decode | pbcopy
```

Browse to `http://127.0.0.1:15672` and paste the password from the clipboard.
Stop the environment with `minikube stop -p foc-local`; do not delete the namespace, PVCs or
Secrets merely to stop it.
