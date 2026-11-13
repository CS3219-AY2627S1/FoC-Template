# Notification Service on Minikube

Owner: XueTing. Shared setup and Docker Hub publishing are in
[the cluster guide](../../deploy/k8s/README.md). Complete its namespace, User, gateway and
[Order](../../order-service/k8s/README.md) steps first.

The Deployment downloads the CI-published `arkanian4/foc-notification-service` image pinned in
`deployment.yaml`; no local build is needed. Application port: 8086; the Service is
cluster-internal and the gateway routes `/api/notifications/**` and
`/docs/notification/openapi.json` to it.

CI publishes `linux/amd64` images only. On an Apple-silicon (arm64) Minikube node the kubelet pull
fails with "no match for platform in manifest". Preload the amd64 image by digest once; it then
runs under emulation like the other services' images (Git Bash or zsh):

```bash
IMG=$(grep -m1 'image:' notification-service/k8s/deployment.yaml | awk '{print $2}')
DIGEST=$(docker manifest inspect "$IMG" | python3 -c "import json,sys;print([m['digest'] for m in json.load(sys.stdin)['manifests'] if m['platform'].get('architecture')=='amd64'][0])")
minikube -p foc-local ssh -- "sudo ctr -n k8s.io images pull --platform linux/amd64 docker.io/${IMG%%:*}@$DIGEST && sudo ctr -n k8s.io images tag --force docker.io/${IMG%%:*}@$DIGEST docker.io/$IMG && sudo ctr -n k8s.io images label docker.io/$IMG io.cri-containerd.image=managed"
```

## Order of rollout

Lifecycle events are switched on last, so Order never publishes before the topic and its Write
ACL exist:

1. **Kafka.** Re-run the shared setup so the broker knows the `notification_service` password
   and `kafka-init` creates `order.lifecycle.events` with its ACLs:

   ```powershell
   pwsh -File deploy/kafka/k8s/Apply-LocalKafka.ps1
   ```

2. **Database password**, once (PowerShell 7.2+). It preserves an existing Secret and never prints
   or saves the password:

   ```powershell
   ./deploy/k8s/New-DatabaseSecret.ps1 -Service notification
   ```

3. **Database, then the application** (Git Bash):

   ```bash
   minikube -p foc-local kubectl -- --context=foc-local apply -f notification-service/k8s/database.yaml
   minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status statefulset/notification-db --timeout=180s
   minikube -p foc-local kubectl -- --context=foc-local apply -f notification-service/k8s/config.yaml -f notification-service/k8s/service.yaml -f notification-service/k8s/deployment.yaml
   minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/notification-service --timeout=300s
   ```

4. **Network policies and the gateway.** `Apply-NetworkPolicies.ps1` applies this directory's
   `network.yaml` together with the shared and Admin policies:

   ```powershell
   pwsh -File deploy/k8s/network/Apply-NetworkPolicies.ps1
   ```

   ```bash
   minikube -p foc-local kubectl -- --context=foc-local apply -f gateway-service/k8s/deployment.yaml
   minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/gateway --timeout=300s
   ```

5. **Order lifecycle events.** `order-service/k8s/config.yaml` sets
   `ORDER_LIFECYCLE_EVENTS_ENABLED=true`; apply it and restart Order so the setting is read:

   ```bash
   minikube -p foc-local kubectl -- --context=foc-local apply -f order-service/k8s/config.yaml
   minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout restart deployment/order-service
   minikube -p foc-local kubectl -- --context=foc-local -n foc-local rollout status deployment/order-service --timeout=300s
   ```

   Skip this step if step 1 did not create the topic: Order would otherwise hold its lifecycle
   rows and retry them, while its credit events on `order.events` continue.

## Verify

```powershell
./deploy/k8s/Test-LocalDeployment.ps1 -Service notification
# Optional: replaces ONLY the database pod and checks that migrations/PVC survive.
./deploy/k8s/Test-LocalDeployment.ps1 -Service notification -CheckDatabaseRestart
pwsh -File deploy/k8s/network/Test-NetworkPolicies.ps1 -Live
```

The service validates User JWTs through the internal JWKS endpoint, reads only its own database,
and consumes `credit.events` and `order.lifecycle.events` as group `notification-service` with the
`notification_service` password from `notification-kafka-client`. The pod does not start if that
Secret is missing.

The PostgreSQL StatefulSet uses a retained 5 GiB claim; keep it at one replica. This is single-node
persistence, not high availability or backup. Never delete the claim to restart the service.
