# Service settings (non-secret)

One `.env` file per service, turned into a ConfigMap by `k8s/kustomization.yaml` (`configMapGenerator`).
Each Deployment reads its file as environment variables (`envFrom`).

The generated ConfigMap's name ends in a hash of its contents (`user-service-config-7c2f88fd49`), so
**changing any value here, or in `k8s/domain.yaml`, gives the ConfigMap a new name, which changes the
Deployment, which rolls the pods**. No `kubectl rollout restart` needed.

Format: `KEY=value`, one per line, `#` comment lines. No quotes, and no comments after a value
(they would become part of the value). Passwords and keys don't belong here: they come from AWS
Secrets Manager (`k8s/*/external-secrets.yaml`).

Values marked "from domain.yaml" are placeholders, overwritten at build time from `k8s/domain.yaml`.
