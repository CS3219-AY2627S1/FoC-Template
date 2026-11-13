# CI, releases, and deployment

The `CI` workflow tests pull requests to `main` and pushes to `main`. Pull requests never log
in to Docker Hub or publish images. Publishing depends on every verification job succeeding,
including the Order backend and workflow-policy checks. No job deploys to a Kubernetes cluster.

## One-time repository setup

An administrator adds these **repository Actions secrets** in GitHub under
Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | `arkanian4` |
| `DOCKERHUB_TOKEN` | A Docker Hub access token with read/write access to the eight `foc-*-service` repositories; no delete access needed |

Use a token, not your account password, and never paste it into chat or commit it. Keep these
repositories public so teammates' local clusters can pull without registry credentials. Missing
or mismatched credentials fail the publishing job with a setup message; existing CI checks
still run. All affected service owners must review shared CI changes before merge.

## AWS staging automation

The existing Docker Hub release remains the portable image-publishing path. AWS staging adds two
separate OIDC workflows:

- `cloud-infrastructure.yml` is manually approved and performs core plan/apply, initial runtime
  provisioning or guarded teardown.
- `cloud-deploy.yml` runs only when `AWS_STAGING_ENABLED=true`, publishes immutable ECR images after
  successful main CI and rolls out through EKS with smoke-test rollback.

No AWS access key is stored in GitHub. The protected `aws-staging-infra` and
`aws-staging-deploy` environments provide short-lived role sessions. Setup, variables, costs,
secret initialization and teardown are documented in [the AWS staging guide](../deploy/aws/README.md).

## What is published

On each push to `main`, CI compares the pushed commit to the previous `main` commit. Changes
under a service directory select that image, including frontend, tests and Dockerfiles. The
service's `k8s/` files and root-level Markdown documentation are excluded: committing a deployment
image-tag update must not publish another image. Changes under `.github/workflows/`,
`.github/scripts/` or `deploy/aws/` select all eight images. Unrelated root documentation changes
publish nothing.
If the previous commit is unavailable, CI
conservatively selects all eight. A rename between services selects both affected images.

Images retain the existing repository names, for example `arkanian4/foc-order-service`.
The tag is `sha-<full-commit-SHA>-r<workflow-run-ID>-<attempt>`. The suffix prevents reruns from
overwriting earlier images, including when only a publishing job is rerun. There is no moving
`latest` tag. Each image also records its source commit in its OCI labels. Builds target
`linux/amd64`, matching the current Windows/Minikube setup.

In GitHub, open **Actions → CI → the run for the merged commit → Summary**. Each successful
`Publish <service>` job adds a **Published <service>** card containing the complete image name
and digest. Copy the **Image** value from that card, not the planning card or a shortened commit
name. If a matrix build fails, other images may already be uploaded: wait for the whole CI run
to pass, and rerun failed jobs after correcting credential/network problems. A source failure
needs a code fix and another merge. Do not assume every service has a new image on every merge.

## Apply to your local cluster

Follow [the Minikube update steps](../deploy/k8s/README.md#apply-a-ci-published-service-update).
The GitHub runner has no access to your laptop, database passwords, JWT signing key or kubeconfig.
Publishing an image alone never changes running pods or committed Deployment image tags.

## Verify workflow changes

From the repository root:

```bash
python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
docker run --rm -v "$PWD:/repo:ro" -w /repo rhysd/actionlint:1.7.12 -color
```

The tests cover selection, missing history, event guards, unique retry tags, publication gates
and absence of automatic deployment. Registry authentication and actual uploads require a
successful main-branch run with the repository secrets configured; local tests do not prove them.
