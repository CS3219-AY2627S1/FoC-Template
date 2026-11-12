# Automatic deploys (`deploy.yml`)

Every push to `main` (including merging a pull request) deploys to AWS. You can also run it by hand:
**Actions → Deploy → Run workflow**. Progress and the deployed image tags show on the run's page.

```
plan ──> images ──> backend ──> frontend
```

| Job | What it does |
|---|---|
| **plan** | Works out each service's image tag (`scripts/image-tags.sh`) and which ones are not in ECR yet. |
| **images** | Builds and pushes only those, in parallel. A service whose folder didn't change is not rebuilt. |
| **backend** | Points `k8s/kustomization.yaml` at the tags (on the runner only; nothing is committed), runs the order-service migration first if order-service changed, then `kubectl apply -k k8s`; imports the Assistant's knowledge chunks (`rag-index` Job) if rag-service changed; and waits for every rollout. If `debezium/` changed, it updates the connector files and re-registers the connectors. |
| **frontend** | Builds and uploads the frontend, then clears the CloudFront cache. Skipped when the live build already matches (`https://<app>/version.json` records what is deployed). Runs after the backend, so new pages never call endpoints that aren't live yet. |

**Image tags** are the git hash of each service's folder, so the same code always has the same tag
and unchanged services keep running untouched. Only one deploy runs at a time; a push during a
deploy waits for it.

**Not deployed automatically:** changes under `terraform/` (run `terraform apply` yourself), the
one-off Jobs `user-bootstrap` and `supplier-seed`, and `k8s/ops` (database setup). Pushes that only
touch Markdown, `docs/`, `terraform/` or `compose.yaml` don't start a deploy.

**Tests don't run here.** A broken `main` gets deployed (a crashing service fails its rollout and
the old pods keep serving, but other bugs go live). Keep testing in pull requests.

## One-time setup

1. Create the AWS role GitHub signs in with (`terraform/infra/github-actions.tf`):

   ```
   terraform -chdir=terraform/infra apply
   ```

   The role trusts only tokens whose subject is `<github_oidc_subject_prefix>:ref:refs/heads/main`
   (`terraform/infra/variables.tf`). This repository uses GitHub's "immutable" subject, which
   includes numeric IDs (`repo:AY2627S1-CS3219-P14@323944968/FoC-Template@1356783930`). If the
   workflow fails with *Not authorized to perform sts:AssumeRoleWithWebIdentity*, compare that
   variable with `sub_claim_prefix` from `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`.

2. Add three repository variables (**Settings → Secrets and variables → Actions → Variables**). They
   aren't secret: the role can only be used by this repository's `main` branch.

   | Variable | Value |
   |---|---|
   | `AWS_DEPLOY_ROLE_ARN` | `terraform -chdir=terraform/infra output -raw github_deploy_role_arn` |
   | `FRONTEND_BUCKET` | `terraform -chdir=terraform/infra output -raw frontend_bucket` |
   | `FRONTEND_DISTRIBUTION_ID` | `terraform -chdir=terraform/infra output -raw frontend_distribution_id` |

   Or with the GitHub CLI: `gh variable set AWS_DEPLOY_ROLE_ARN --body "<value>"` (and the same for the others).

## Deploying by hand, and rolling back

To deploy from your machine (e.g. while GitHub is down), use the same tags as the workflow, so the
two never disagree:

```
bash scripts/image-tags.sh --write     # point the manifests at the images for your checkout
kubectl diff -k k8s                    # check: only what you expect should change
kubectl apply -k k8s
git checkout -- k8s/kustomization.yaml k8s/jobs/kustomization.yaml
```

The images must already be in ECR (pushed by an earlier workflow run). To roll back, revert the
commit on `main` and push: the workflow redeploys the previous tags, which are still in ECR (it
keeps the 15 most recent images of each service; an older one is simply rebuilt).
For a quick rollback of one service without git: `kubectl rollout undo deployment/<name> -n campuscouriers-app`
(the next deploy from `main` will replace it again).
