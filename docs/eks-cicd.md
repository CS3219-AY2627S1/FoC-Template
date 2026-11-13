# FoC: GitHub Actions CI / ECR publication / EKS deployment

This package supplies three **new** workflows in `.github/workflows/` and one
one-time administrator RBAC manifest. It does not remove the pre-existing
service-specific workflows on `main`, change application source code, or create
AWS infrastructure automatically.

## Operational model

1. **FoC EKS CI**: on pushes to `feat/cloud-deployment`, run EKS render checks,
   service unit tests, Order migration checks, frontend lint/tests/build, and
   six Docker builds. PRs also validate these checks.
2. **Publish six images to ECR**: after a green CI run, manually dispatch a
   release with a *new*, immutable tag, such as `release-20261110-01`.
   Uses GitHub OIDC to assume a narrow ECR publishing role. The publish job
   targets the `foc-publish` protected GitHub environment.
3. **Deploy to EKS**: after all six ECR images share the selected tag, manually
   dispatch the deploy workflow with `image_tag`. It validates AWS, EKS, six ECR
   images, existing Kubernetes Secrets and renders, then runs the existing
   `scripts/eks-deploy.sh`. The `foc-deploy` environment should require approval.
   Workflows do not automatically deploy on push.

**Important GitHub limitation:** A workflow must exist on the repository's
**default branch** for `workflow_dispatch` to appear in GitHub Actions.
Therefore, adding only to `feat/cloud-deployment` enables its push CI but not
its manual release buttons. Arrange a reviewed PR or a safe merge of these two
release workflow YAMLs into `main` (without merging unready deployment code).
When manually starting either release workflow, select branch
`feat/cloud-deployment`, otherwise the job's branch guard skips deployment.
Configure the environment deployment branch restrictions likewise.

## Required GitHub repository setup

In GitHub repository Settings > Environments:

- `foc-publish`: enable required reviewers if supported; restrict permitted
  branches to `feat/cloud-deployment`.
- `foc-deploy`: enable required reviewers if supported; restrict permitted
  branches to `feat/cloud-deployment`.

In Settings > Secrets and variables > Actions > Variables:

- `FOC_ECR_ROLE_ARN`: IAM role trusted by the `foc-publish` environment.
- `FOC_EKS_ROLE_ARN`: distinct IAM role trusted by the `foc-deploy` environment.

Role ARNs are not credentials. **Never store AWS access keys, PostgreSQL
passwords, JWTs, or certificate private keys in this repository or workflows.**

## Optional: provision cloud IAM configuration with CloudFormation

Rather than creating the OIDC provider, IAM roles, and EKS access entry one by
one, an approved AWS administrator can inspect the supplied
`deploy/aws/foc-github-oidc.yaml` template and deploy it once with:

```bash
aws cloudformation validate-template \
  --region ap-southeast-1 \
  --template-body file://deploy/aws/foc-github-oidc.yaml

aws cloudformation deploy \
  --region ap-southeast-1 \
  --stack-name foc-github-oidc \
  --template-file deploy/aws/foc-github-oidc.yaml \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation describe-stacks \
  --region ap-southeast-1 \
  --stack-name foc-github-oidc \
  --query 'Stacks[0].Outputs'
```

**Do not run this without school administrator authorization.** It creates an
account-wide OIDC identity provider and two IAM roles, plus an EKS access
entry, but does not change or recreate the existing EKS cluster. It assumes
the GitHub OIDC provider does not already exist, as observed earlier; if one
has been created since, use/import that existing provider rather than create a
duplicate. Apply the supplementary `deploy/k8s/eks/cicd-rbac.yaml` once as the
existing Kubernetes administrator. Set GitHub Actions variables from the
CloudFormation outputs and configure GitHub environments separately.

The following manual setup instructions describe the equivalent AWS resources
for administrators who prefer not to use CloudFormation.

## One-time AWS administrator setup

The school-managed AWS account currently has **no OIDC providers registered**.
GitHub Actions cannot deploy with an AWS role until an authorized AWS
administrator completes the setup below. These changes are intentionally not
executed by a CI job.

### 1. Register GitHub's OIDC provider

Using an identity with AWS IAM administrator-approved permissions:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

This provider is account-wide. Check for an existing provider first and do not
create a duplicate. Provider URL and audience must match the trust policy.

### 2. Create two dedicated IAM roles with exact environment-scoped trust

Each role trusts `token.actions.githubusercontent.com` using the AWS STS
`AssumeRoleWithWebIdentity` action, with conditions:

For **ECR publishing role**:

```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub":
      "repo:AY2627S1-CS3219-P8/FoC:environment:foc-publish"
  }
}
```

For **EKS deployment role**, use the same trust structure but the subject:
`repo:AY2627S1-CS3219-P8/FoC:environment:foc-deploy`.

The principal must be the registered provider ARN in account 816435462502,
and `Action` must be `sts:AssumeRoleWithWebIdentity`. Trust restriction to a
GitHub environment **must be paired with GitHub environment branch protections
and approvals**, since GitHub's OIDC subject is environment-scoped, not
simultaneously branch-scoped in the default format.

### 3. Attach minimal AWS API permissions

ECR publishing role needs:

- `ecr:GetAuthorizationToken` on `*`.
- `ecr:DescribeRepositories`, `ecr:DescribeImages`,
  `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`,
  `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`, and
  `ecr:BatchGetImage` scoped to the six `foc/*` repository ARNs in
  `ap-southeast-1`.

EKS deployment role needs:

- `eks:DescribeCluster` for `foc-eks`.
- `ecr:DescribeImages` for the six `foc/*` repositories.
- (Optional) `sts:GetCallerIdentity` needs no IAM allow statement.

Neither role needs IAM administration or access to AWS secrets when the
Kubernetes `foc-env` and `foc-tls` Secrets are provisioned separately.

### 4. Authorize the deployment role in EKS

As the existing cluster administrator, create a **STANDARD** access entry for
`FOC_EKS_ROLE_ARN` in `foc-eks`, with Kubernetes group `foc-cd`:

```bash
aws eks create-access-entry \
  --cluster-name foc-eks --region ap-southeast-1 \
  --principal-arn "$FOC_EKS_ROLE_ARN" \
  --type STANDARD --kubernetes-groups foc-cd
```

Associate AWS-managed `AmazonEKSAdminPolicy` with a **namespace** access scope
of `foc` (not a cluster-wide scope). The role still needs a small set of
cluster-scoped permissions to check the StorageClass and patch the already
existing namespace; supply these via the checked-in RBAC manifest:

```bash
aws eks associate-access-policy \
  --cluster-name foc-eks --region ap-southeast-1 \
  --principal-arn "$FOC_EKS_ROLE_ARN" \
  --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSAdminPolicy \
  --access-scope type=namespace,namespaces=foc

kubectl apply -f deploy/k8s/eks/cicd-rbac.yaml
```

**Do not** grant the role `AmazonEKSClusterAdminPolicy` just to make the
pipeline pass. If the school account denies these IAM/API operations, an
administrator must approve them. Do not modify the existing node, service or
school SSO IAM roles as a workaround.

### 5. Bootstrap credentials and certificates once

The EKS deployment script already supports reusing `foc-env` and `foc-tls`
without local credential files after they exist in the `foc` namespace.
Provision these once with the approved operator/secret manager before running
GitHub CD. Example: from the SSO-authorized CloudShell session in which
`deploy/k8s/eks/secrets.env` and `FOC_TLS_DIR` have been prepared:

```bash
kubectl -n foc create secret generic foc-env \
  --from-env-file=deploy/k8s/eks/secrets.env
kubectl -n foc create secret generic foc-tls \
  --from-file=ca.crt="$FOC_TLS_DIR/ca.crt" \
  --from-file=user-service.crt="$FOC_TLS_DIR/user-service.crt" \
  --from-file=user-service.key="$FOC_TLS_DIR/user-service.key"
```

Only run these if the Secrets do not already exist. Never regenerate database
passwords against existing PVCs. Long term, migrate the secret sources to AWS
Secrets Manager and a Kubernetes secret-synchronization controller approved by
the cloud administrator. The current workflows intentionally *do not* read or
expose secret values from GitHub Actions.

## Using the release workflows

1. Push change to `feat/cloud-deployment`; inspect **FoC EKS CI** for green jobs.
2. Once manual Actions workflows are present on `main`, choose **FoC publish six
   images to ECR**, `Run workflow`, branch `feat/cloud-deployment`, and enter a
   release tag not already present in ECR.
3. Confirm all six publish jobs succeed. Partial failures should be retried
   with a **new** release tag to avoid accidental mutation of existing tags.
4. Choose **FoC deploy existing ECR release to EKS**, same branch, the exact
   successful release tag, and `rerun_jobs=false` unless migrations require it.
5. Review and approve the `foc-deploy` environment gate. Inspect final rollout
   and Job logs on failure. Do not rerun database migrations blindly.

Initial existing image tag `9a6415d` was previously uploaded and can be
selected in the deployment workflow without rebuilding, subject to ECR checks.

## Why not enable automatic CD on push?

Release automation is distinct from unreviewed production deployment. FoC has
stateful PostgreSQL and Kafka resources and explicit migration Jobs. The CI
workflows execute automatically, but deployment is manually approved to avoid
inadvertent data migration, credential rotation, or chargeable deployments.

## Known limitations

- IAM provider/roles/EKS access entries and GitHub environments/variables
  require administrator authorization and have not been created by these files.
- A GitHub-hosted runner can reach the EKS API only while the configured public
  endpoint allows it; API authentication remains mandatory. Restrict the broad
  `0.0.0.0/0` EKS API endpoint when practical.
- EKS deploy script expects pre-existing namespace `foc` and StorageClass
  `foc-gp3`. Neither is created by the workflows.
- `eks-deploy.sh` applies the base Namespace manifest even though the namespace
  already exists; the scoped ClusterRole above supplies the narrowly limited
  patch permission.
- The first secret bootstrap is not fully hands-off; integrating AWS Secrets
  Manager and a controller is a separate infrastructure change.
- No deployment or AWS permissions have been verified by simply committing
  these files. Perform an approved end-to-end workflow run to verify.
