# Kubernetes preparation and rollout

Read `deploy/k8s/README.md`, the selected service's `k8s/` guide if present, and the relevant
sections of `deploy/kafka/k8s/README.md` and `deploy/k8s/network/README.md`. Resource names and
capabilities must come from current manifests/helpers. Service directory, Deployment name and
smoke-helper selector can differ. Discover them rather than deriving them blindly.

## Prepare service resources

- The repository's documented local target is Minikube profile/context/namespace `foc-local`.
  Confirm the user's requested target and actual cluster identity. Use explicit context and
  namespace for every namespaced command, including reads and verification. For Minikube,
  select the matching profile for image loading and helper commands. Inspect existing helpers
  for target assumptions before using them in another environment.
- Inventory workloads, Services, labels/selectors, ConfigMaps, Secret references, claims,
  rollout strategy, images and probes. Reuse existing infrastructure. Add only selected-service
  resources and necessary approved shared connections. Stateful storage and credentials must
  survive application rollout. Check schema compatibility and applied migrations before update.
- Keep database ownership private. Configure credentials separately for each environment and
  use the project's secret helpers. Preserve existing signing keys, client passwords and trust
  entries. Use public keys for inter-service trust. Missing credentials for existing storage
  require investigation before setup continues. Never print/export secret values into artifacts.
- Pin the intended versioned image or digest and ensure it is accessible to the cluster. Match
  architecture, pull policy, registry permissions and local image loading to the chosen route.
  Do not assume an image built on the host exists inside Minikube.
- Derive ports, startup/readiness/liveness, resource budgets and replicas from actual service
  behavior. Liveness should not create restart loops merely because a remote dependency is down.
  Database/broker initialization and migrations require their own rollout ordering.
- Extend both ingress and egress rules for necessary traffic, including DNS and reverse
  callbacks. Verify the enforcement provider actually denies disallowed connections. A written
  NetworkPolicy without enforcement provides no verified isolation. Preserve approved shared
  policies while adding least-privilege service-specific exceptions.

## Validate before activation

Inspect the concrete helper commands before execution. Some secret/apply scripts mutate cluster
state. The broker directory contains templates/optional patches, so use its documented helper
instead of applying the directory wholesale. Test only intended manifest files.

1. Run the selected service's supported build/tests and affected shared validation.
2. Validate YAML/resource references locally and inspect targeted manifest diffs without exposing
   secrets. Use explicit-target client validation where supported. With cluster read access,
   use server dry-run to validate against its API, recording unavailable admission checks.
3. Identify data/schema changes, affected owners, shared broker/network impact, image source,
   credentials provisioning and manual acceptance steps. Obtain outstanding reviews required
   by root instructions before shared activation.
4. Describe recovery. Record prior image/config identity without exporting secrets. Image
   rollback alone cannot reverse migrations, committed data or emitted messages. A migration
   that is incompatible with the prior image needs an approved recovery plan before rollout.

## Activate and verify the authorized target

Apply prerequisites and targeted resources in dependency order using existing helpers where
appropriate. Recheck context/namespace immediately before applying. Preserve unrelated workloads,
Secrets, PVCs and Minikube profiles. Cluster recreation, persistent-data deletion and unrelated
service upgrades require explicit scope authorization.

Wait for each relevant rollout with a finite timeout. Inspect failed Pods/events and metadata-only
logs without dumping credentials. Repair the diagnosed in-scope issue, then rerun affected checks.
Verify gateway routing, local JWT checks/service trust, private database isolation, broker ACLs
and a real service business flow. Exercise restart/retry phases only against disposable test
resources or where explicitly authorized. A broad helper that restarts databases needs that
scope checked before execution.

Report the actual target, image/version, rollout state, business evidence, data persistence
checks, denied-network checks and remaining producer dependencies. Provide a teammate-facing
start/update/check sequence in the service's existing guide. End-to-end acceptance requires
the real cooperating services plus any manual acceptance required by the feature workflow.
