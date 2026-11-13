# Enforced pod-to-pod isolation on local Kubernetes

Shared editor: Darryl's infrastructure task. Jun Hui reviews networking/broker changes; User,
Supplier, Order and Credit owners review their allowed connections before merge. This changes
infrastructure only: no API/event contracts, application images, migrations or business data.

## Enforcement provider

The default Minikube Kindnet setup does not itself enforce NetworkPolicies. This directory adds
the policy-only [kubernetes-sigs/kube-network-policies](https://github.com/kubernetes-sigs/kube-network-policies)
agent, version **v1.1.2**, alongside Kindnet. It uses NFQUEUE/nftables, not a replacement CNI.
Source: [upstream v1.1.2 installer](https://github.com/kubernetes-sigs/kube-network-policies/blob/v1.1.2/install.yaml).
That upstream installer still names image v1.1.1; our reviewed manifest selects released v1.1.2.

This node agent necessarily uses host networking, NET_ADMIN/privileged access and host netns/NRI
mounts. Its Kubernetes RBAC only lists/watches pods, namespaces and NetworkPolicies, not Secrets.
It requests 100m CPU/50Mi memory per Linux node; these are requests, not memory-use guarantees.
Check kernel NFQUEUE/nftables support on each teammate's machine; a Ready agent alone is not
proof of enforcement. Do not stack it with another policy engine such as Calico/Cilium.
No Kubernetes upgrade, CNI migration, cluster recreation or storage deletion is performed.

## Allowed traffic

All `foc-local` pods are default-denied for ingress/egress. These explicit rules add exceptions:

| Source | Destination | TCP port / purpose |
| --- | --- | --- |
| External browser | Gateway | 8088 |
| Gateway | User / Supplier / Order / Credit / Chat / Notification | 8081 / 8080 / 8082 / 8083 / 8085 / 8086 |
| Each backend | Its own PostgreSQL pod | 5432 |
| Gateway | Admin | 8084 |
| Admin | User / Kafka | 8081 current eligibility and JWKS / 9092 authenticated actions |
| Admin | Chat (when deployed) | 8085, agreed private APIs |
| Chat | Its PostgreSQL / User / Kafka / RabbitMQ | 5432 / 8081 / 9092 / 5672 |
| Supplier / Order / Credit / Chat / Notification | User | 8081, JWT public-key discovery |
| User / Order / Credit / Chat / Notification / Kafka UI / Kafka initializer | Kafka | 9092 |
| Kafka | Kafka | 9092 / 9093, broker/controller |
| All namespace pods | kube-system CoreDNS | UDP and TCP 53 |
| User | Public IPv4 HTTPS | 443, needed for SendGrid |

`initialize-job.yaml` labels its pod `app=kafka-init`, so future initializer Jobs keep working.
The broker still requires its per-service SASL credentials and ACLs. Network reachability does
not grant permission to produce/consume. Frontend calls go through the gateway; no current
backend-to-backend business API calls beyond the published JWKS connection are assumed.
Future services, monitoring, Jobs and new integrations need a reviewed rule before rollout.

Admin, Chat and Notification policies live in their service-local `k8s/network.yaml` files;
`Common.ps1` combines them with this directory's policies for isolated checks and the shared
application.
These exceptions grant network reachability only, not HTTP authorization. Admin cannot reach
service databases.

### Important boundaries

- L3/L4 NetworkPolicies cannot limit User port 8081 to only `/.well-known/jwks.json`. All backend
  HTTP authorization remains enforced by User Service.
- Standard policies cannot allow a DNS hostname such as SendGrid. User can use public IPv4 TCP
  443, excluding RFC1918, loopback and link-local destinations. It is not a SendGrid-only allowlist.
  This assumes the current private Minikube node/pod/service ranges and IPv4; review other CIDRs,
  proxies or IPv6 before using these rules elsewhere.
- These protect ordinary pod networking, not a hostile cluster administrator, host-network pod
  or someone allowed to create pods with trusted application labels. Keep Kubernetes RBAC tight.
- Node-local traffic, authorized `kubectl exec`/`port-forward` and kubelet probes are outside this
  pod boundary. Kafka UI remains available through its loopback port-forward and requires login.
- This does **not** remove the existing User NodePort or restrict Docker Compose. NetworkPolicies
  alone do not guarantee gateway-only external access, especially with node source NAT.
- Policies are additive: another policy can widen access. The apply helper refuses unknown
  existing policies in `foc-local` rather than deleting or silently combining them.
- Already established connections may behave differently across policy providers. Tests open
  fresh TCP connections. This single-node local setup is not a production HA/security design.

## Apply and verify

Use PowerShell 7.2+ on Windows with the existing Docker/Minikube `foc-local` profile running:

```powershell
pwsh -File deploy/k8s/network/Apply-NetworkPolicies.ps1
```

The helper validates/installs the pinned agent, proves enforcement using disposable listeners,
then applies the real namespace policies and tests live connections. Disposable tests compare
working connections before/after policy installation; a closed destination is not accepted as
proof of isolation. Test pods are small BusyBox v1.37.0 listeners with no credentials or volumes.
Only the exact ownership-labelled `foc-netpol-test-*` namespace is deleted after testing.
If live verification fails, the helper removes only its labelled policies to restore the previous
network exposure. It never deletes business resources or rotates Secrets.

Independent checks:

```powershell
pwsh -File deploy/k8s/network/Test-NetworkPolicies.ps1
pwsh -File deploy/k8s/network/Test-NetworkPolicies.ps1 -Live
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service gateway
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service supplier
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service credit
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service order
pwsh -File deploy/k8s/Test-LocalDeployment.ps1 -Service chat
```

The existing deployment smoke helper now probes from the authorized gateway using bash HTTP
instead of granting User Service an exception to reach every other backend. Live policy checks
use fresh TCP connections from real application pods, an unauthenticated SendGrid GET (no email),
and temporary loopback tunnels to verify gateway health/routes/auth and Kafka UI login protection.
They do not claim to test business event delivery, email inbox delivery or newer image features.
Previously failing routes (for example an old gateway's `/errands`) require an image update, not
a wider policy. Do not deploy new application images merely to make isolation checks pass.

## Rollback

Restore the previous unrestricted pod network first, leaving images/data/Secrets untouched:

```bash
minikube -p foc-local kubectl -- --context=foc-local -n foc-local delete networkpolicy -l foc/network-isolation=v1
```

If also removing the agent, do so **after** removing our policies and confirming no other
namespace relies on it. Uninstall its pinned resources:

```bash
minikube -p foc-local kubectl -- --context=foc-local delete -f deploy/k8s/network/enforcer.yaml
```

Retest connections after uninstalling; node-level rule cleanup/provider behaviour must not be
assumed. Do not flush arbitrary node firewall rules, remove Kindnet or delete the cluster/PVCs.
For manual acceptance, open the normal app and Kafka UI; sign in, browse the existing pages and
verify a real workflow. A fresh User activation or Order/Credit demo requires normal credentials
and the appropriate application images; these policies neither create facts nor bypass OTP/JWT.
