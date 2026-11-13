# AWS EKS deployment

This deployment targets the existing `foc-eks` cluster in AWS account
`816435462502`, region `ap-southeast-1`. It does not create or change the VPC,
NAT gateway, EKS cluster, node capacity, ECR repositories, DNS, or public load
balancers.

The local kind deployment remains independent. It builds local images, imports
them into kind, and exposes fixed `NodePort` values. The EKS overlays instead
pull immutable application tags from ECR, use `foc-gp3` for persistent claims,
and convert the application Services to internal `ClusterIP` Services.

## Existing AWS prerequisites

The following resources must already exist:

- EKS cluster `foc-eks` with Ready worker capacity and namespace `foc`.
- StorageClass `foc-gp3`, provisioned by `ebs.csi.eks.amazonaws.com`.
- ECR repositories `foc/user-service`, `foc/supplier-service`,
  `foc/supplier-db`, `foc/order-service`, `foc/credit-service`, and
  `foc/frontend-service`.
- All six repositories must contain the selected image tag. The initial tag is
  `9a6415d`.
- The operator needs AWS and Kubernetes access sufficient to read the cluster,
  inspect ECR, manage namespace resources, and read the StorageClass.

The checked-in NetworkPolicies restrict each database to Pods carrying its
corresponding `foc.io/db` label. A NetworkPolicy object has no effect unless the
cluster networking implementation enforces it. Confirm EKS network-policy
enforcement with the cluster owner and test denied connections before treating
these policies as a security boundary.

## Deployment stages

The EKS configuration under `deploy/k8s/eks/` reuses the existing manifests and
preserves their dependency order:

1. `data`: four PostgreSQL StatefulSets, Kafka, internal Services, PVCs, and
   NetworkPolicies.
2. `jobs/wave-1`: User, Order, and Credit migrations; Supplier role bootstrap;
   Kafka topic creation.
3. `jobs/wave-2`: optional User administrator bootstrap and Supplier migration.
4. `jobs/wave-3`: Supplier runtime grants.
5. `apps`: APIs, workers, and frontend.

The deployment script waits for every StatefulSet and Job before starting the
next stage. Successful Jobs are not rerun by default. If a release adds a
database migration, pass `--rerun-jobs` deliberately after reviewing the
migration and its rollback plan.

## Prepare credentials

Copy the safe example into the ignored path and replace every placeholder:

```bash
cp deploy/k8s/eks/secrets.env.example deploy/k8s/eks/secrets.env
chmod 600 deploy/k8s/eks/secrets.env
${EDITOR:-vi} deploy/k8s/eks/secrets.env
```

The file is sourced as shell-compatible `KEY=value` data, so quote values that
contain whitespace or shell metacharacters. The script validates required
values without printing them and creates `foc-env` only when it is absent.
Existing `foc-env` values are reused by default, because changing PostgreSQL
credentials does not update credentials already stored in existing database
volumes.

An approved external secret controller may create `foc-env` instead. The script
then validates the required keys and leaves the Secret unchanged. Use
`--refresh-secrets` only for a coordinated rotation; that option refreshes both
`foc-env` and `foc-tls` from local inputs.

The non-UTF-8 `data/csv/supplier-seed-data.csv` file is stored in the
`foc-supplier-seed` Secret because ConfigMaps reject its raw bytes. The script
also creates or updates these initialization resources from the repository:

- `foc-supplier-bootstrap` ConfigMap
- `foc-supplier-grants` ConfigMap
- `foc-kafka-topics` ConfigMap
- `foc-supplier-seed` Secret

## Prepare internal TLS

Certificate issuance and rotation are deployment prerequisites. This repository
does not select a PKI or secret manager, and the deployment script never falls
back to the development files under `certs/`.

Provide a secure directory outside the repository containing:

- `ca.crt`: the CA bundle trusted by internal clients.
- `user-service.crt`: the User Service server certificate. Its Subject
  Alternative Names must cover the Kubernetes DNS name used by clients,
  including `user-service`.
- `user-service.key`: the matching unencrypted private key, readable only by
  the operator.

Set `FOC_TLS_DIR` to that directory. On the first deployment the script creates
the existing `foc-tls` Secret contract. User Service receives the certificate,
key, and CA; the frontend and other HTTPS clients receive only the CA file.
Hostname and chain verification remain enabled.

If an approved external secret controller already manages `foc-tls`, no local
TLS directory is required. The script validates the three required keys and
does not rotate the Secret.

## Deploy from AWS CloudShell

After the branch changes are available in GitHub, run these exact commands:

```bash
git clone --branch feat/cloud-deployment https://github.com/AY2627S1-CS3219-P8/FoC.git
cd FoC

aws eks update-kubeconfig --region ap-southeast-1 --name foc-eks
kubectl config current-context

cp deploy/k8s/eks/secrets.env.example deploy/k8s/eks/secrets.env
chmod 600 deploy/k8s/eks/secrets.env
${EDITOR:-vi} deploy/k8s/eks/secrets.env

export FOC_TLS_DIR="$HOME/foc-production-tls"
# Securely upload ca.crt, user-service.crt, and user-service.key to that directory.

bash ./scripts/eks-deploy.sh --validate
bash ./scripts/eks-deploy.sh
```

For an existing clone, use `git switch feat/cloud-deployment` and
`git pull --ff-only origin feat/cloud-deployment` instead of cloning.

The deployment defaults can be changed per invocation without editing YAML:

```bash
AWS_ACCOUNT_ID=816435462502 \
AWS_REGION=ap-southeast-1 \
IMAGE_TAG=9a6415d \
STORAGE_CLASS=foc-gp3 \
bash ./scripts/eks-deploy.sh --validate
```

Run `bash ./scripts/eks-deploy.sh --render-only` for a cluster-free render check.
`--validate` additionally checks AWS identity, the exact active EKS endpoint,
namespace access, StorageClass, all six ECR images, and Secret/configuration
contracts, but does not modify the cluster.

## Frontend access and cookies

The initial EKS deployment is internal only. PostgreSQL, Kafka, APIs, workers,
and frontend are not exposed publicly. For an operator smoke test:

```bash
kubectl -n foc port-forward service/frontend-service 3000:3000
```

Then browse to `http://127.0.0.1:3000`. This access path uses HTTP, so
`FRONTEND_COOKIE_SECURE=false` is the default. Before public access, decide and
document the Ingress or LoadBalancer, TLS certificate, DNS name, security-group
rules, health checks, and source restrictions. Public browser access must use
HTTPS and deploy with `FRONTEND_COOKIE_SECURE=true`. Public exposure belongs in
a separate, explicitly approved overlay; it is intentionally not created by
the base deployment script.

## Inspect the deployment

```bash
kubectl -n foc get pods -o wide
kubectl -n foc get jobs
kubectl -n foc get services
kubectl -n foc get pvc
kubectl -n foc describe pod POD_NAME
kubectl -n foc logs deployment/user-service --tail=200
kubectl -n foc logs job/user-migrate --tail=200
kubectl -n foc get events --sort-by=.lastTimestamp
```

The deployment script prints Job logs and descriptions on failure. It prints
StatefulSet or Deployment diagnostics when a rollout does not become ready.

## Troubleshooting

### `ImagePullBackOff`

Confirm the rendered image and tag, repository contents, and node/ECR access:

```bash
IMAGE_TAG=9a6415d bash ./scripts/eks-deploy.sh --validate
kubectl -n foc describe pod POD_NAME
aws ecr describe-images --region ap-southeast-1 \
  --repository-name foc/user-service --image-ids imageTag=9a6415d
```

### `CrashLoopBackOff`

Read current and previous logs, then inspect events. Common causes are a
missing Secret key, a database that was initialized with different credentials,
or invalid TLS material.

```bash
kubectl -n foc logs POD_NAME --all-containers --tail=200
kubectl -n foc logs POD_NAME --all-containers --previous --tail=200
kubectl -n foc describe pod POD_NAME
```

### Pending PVCs

Confirm the PVC requests `foc-gp3`, the StorageClass exists, and EBS CSI events
do not report an availability-zone, IAM, or capacity error:

```bash
kubectl -n foc get pvc
kubectl -n foc describe pvc PVC_NAME
kubectl get storageclass foc-gp3 -o yaml
kubectl -n foc get events --sort-by=.lastTimestamp
```

Do not delete a database PVC as a troubleshooting shortcut; doing so deletes or
orphanes persistent application data depending on the reclaim policy.

### Failed migration or initialization Job

```bash
kubectl -n foc describe job JOB_NAME
kubectl -n foc logs job/JOB_NAME --all-containers --tail=200
```

Fix the cause, then rerun the deployment. An incomplete wave is replaced and
rerun. Fully successful waves are skipped unless `--rerun-jobs` is supplied.
Review Supplier bootstrap/grant SQL and database migrations before forcing a
rerun against production data.

## Update the application

Build and push all changed images before deployment; the deployment script does
not build images. Use one immutable release tag consistently across the six ECR
repositories, then run:

```bash
IMAGE_TAG=NEW_IMMUTABLE_TAG bash ./scripts/eks-deploy.sh --validate
IMAGE_TAG=NEW_IMMUTABLE_TAG bash ./scripts/eks-deploy.sh --rerun-jobs
```

Omit `--rerun-jobs` only when the release has no initialization or migration
changes. The EKS cluster and persistent volumes are reused; no infrastructure
rebuild is required.

## Cleanup and cost

Deleting namespace workloads is not the same as deleting AWS infrastructure.
Persistent volumes may retain EBS volumes depending on reclaim policy. The EKS
control plane, worker capacity, NAT gateway, load balancers, EBS volumes, and
data transfer can continue incurring charges while provisioned.

Before any cleanup, identify data-retention requirements and inspect PVC/PV
reclaim policies. This repository intentionally does not automate deletion of
the existing EKS cluster, VPC, NAT gateway, ECR repositories, or storage.

## Verification status

Repository validation proves only local rendering and static configuration.
Do not treat it as evidence that AWS deployment succeeded. A maintainer must run
the validation and deployment commands against `foc-eks` and record the actual
cluster results separately.

## Component	Configuration
CloudFront distribution	E357ABJQQBSGSB
Public URL	https://d1zyry725efjgr.cloudfront.net
VPC origin	vo_6y9LDcBN2PxGKlytRO04Id
ALB	Internal, HTTP port 80
Frontend	frontend-service:3000
ALB security group	Allow TCP 80 from the CloudFront VPC-origin security group
Subnet role tag	kubernetes.io/role/internal-elb=1
