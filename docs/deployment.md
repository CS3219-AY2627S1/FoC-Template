# Deployment

Relay runs in Kubernetes from one Helm chart, [`deploy/helm/relay`](../deploy/helm/relay). Why this setup: [ADR 0004](decisions/0004-cloud-deployment.md). The same chart and the same images run on a laptop (k3d) and in the cloud (k3s on EC2); only the values files differ (N6.2). Docker Compose stays the quickest way to run everything for development.

## Local Kubernetes (k3d)

Needs Docker Desktop with at least 12 GB of memory, plus `k3d`, `helm` and `kubectl` (`brew install k3d helm kubernetes-cli`).

```bash
deploy/scripts/local-up.sh
```

The script creates the cluster `relay` on the first run, builds the images with `docker compose build`, imports them into the cluster and installs the chart into the namespace `relay`. Run it again after a code change. The app is on <http://localhost:8081>, Mailpit on <http://localhost:8081/mail/>. It runs next to `docker compose up`, which keeps port 8080.

```bash
deploy/scripts/smoke-test.sh
```

checks the system from the outside: gateway, refused anonymous requests, a closed `/internal` route, and two new students who register, read the code in Mailpit, verify, log in and get a credit account through the broker. Then one errand runs end to end: the first student posts it at a supplier that is open at the needed-by time (credits reserved), the second accepts, picks up and delivers it, the first confirms it, and the reward reaches the courier through the broker. On the way it checks that the requester cannot accept the own errand, a second acceptance and a courier's confirmation are refused, and every transition is recorded. It needs one supplier on the first page that is open within the next 24 hours.

Useful commands:

```bash
kubectl --context k3d-relay -n relay get pods
kubectl --context k3d-relay -n relay logs deploy/user-service
k3d cluster delete relay
```

## Cloud (AWS, k3s on EC2)

[`deploy/terraform`](../deploy/terraform) creates one EC2 instance (t3.xlarge, Singapore) with k3s, in its own VPC with a fixed public address. Traefik inside k3s answers on ports 80 and 443: HTTPS with a Let's Encrypt certificate from cert-manager, plain HTTP redirects to it. SSH and the Kubernetes API only accept the address terraform was run from. The images come from GHCR, where CI publishes them with the tag `dev` after every merge into `dev`.

### In short: bring the cloud to the newest `dev` state

```bash
git checkout dev && git pull
aws sso login --profile relay && export AWS_PROFILE=relay
deploy/scripts/cloud.sh status           # start it with cloud.sh start if it is stopped
terraform -chdir=deploy/terraform apply  # only when kubectl times out: your address changed
deploy/scripts/cloud-kubeconfig.sh       # after every apply
deploy/scripts/deploy.sh
```

`deploy.sh` takes the chart from your checkout and the images tagged `dev` from GHCR, which CI publishes after every merge into `dev`. If CI did not publish, build and push the changed image yourself (the token needs `write:packages`: `gh auth refresh -s write:packages`):

```bash
gh auth token | docker login ghcr.io -u <github user> --password-stdin
docker buildx build --platform linux/amd64 -t ghcr.io/ay2627s1-cs3219-p26/user-service:dev --push user-service
```

The supplier-service builds from the repository root: `-f supplier-service/Dockerfile .` instead of the folder.

Needs the AWS CLI with the SSO profile `relay`, `terraform`, `helm`, `kubectl`, and an SSH key in `~/.ssh/relay-aws` (`ssh-keygen -t ed25519 -f ~/.ssh/relay-aws -N ""`).

Once:

```bash
aws sso login --profile relay
export AWS_PROFILE=relay
terraform -chdir=deploy/terraform init
terraform -chdir=deploy/terraform apply
deploy/scripts/cloud-kubeconfig.sh
```

`deploy/ghcr.env` holds a GitHub token that may read the private images (classic token with only `read:packages`):

```
GHCR_USERNAME=<github user>
GHCR_TOKEN=<token>
```

Deploy, and again after every merge into `dev`:

```bash
deploy/scripts/deploy.sh
deploy/scripts/smoke-test.sh https://$(terraform -chdir=deploy/terraform output -raw hostname)
```

On the first run `deploy.sh` writes random passwords to `deploy/cloud-secrets.env`, the administrator's is `ADMIN_PASSWORD`. Mailpit under `/mail/` is open without a password, because the verify page links to it so that anyone trying Relay can read their code; it only ever holds test emails. The script also adds an empty `CLAUDE_API_KEY=` line; put the Anthropic key there and run `deploy.sh` again, otherwise the help assistant cannot answer. Both `.env` files stay out of Git. `deploy.sh` also installs cert-manager; the first certificate takes about a minute.

The instance costs money only while it runs. Stop it after testing:

```bash
deploy/scripts/cloud.sh stop
deploy/scripts/cloud.sh start
deploy/scripts/cloud.sh status
deploy/scripts/cloud.sh restart
```

`restart` makes the services pull the newest `dev` images. It runs on the instance through AWS Systems Manager, so it needs neither SSH nor the Kubernetes API. Changes to the chart itself (values, templates) still go out with `deploy.sh`.

If nobody uses the instance for 4 hours (CPU below 10 %), the CloudWatch alarm `relay-idle-stop` stops it, so a forgotten instance does not use up the budget. Start it again with `cloud.sh start`.

### From GitHub Actions

Without any AWS access of your own: Actions → **cloud** → Run workflow, then pick `start`, `stop`, `status` or `restart` (shown once the workflow is on `main`). After every merge into `dev`, CI publishes the images and then runs `restart`, so a running instance always serves the current integration state (continuous deployment). A stopped instance is left alone.

GitHub Actions gets into AWS with a short-lived OpenID Connect token instead of stored keys, and only workflows on `dev` and `main` may use the role. The workflows need one repository variable, the role from terraform:

```bash
gh variable set AWS_ROLE_ARN --body "$(terraform -chdir=deploy/terraform output -raw github_role_arn)"
```

When kubectl or `deploy.sh` cannot reach the cluster, your public address has changed (other Wi-Fi, and the NUS network changes it often). Run `terraform -chdir=deploy/terraform apply` once more, so SSH and kubectl accept the new address. The app itself stays reachable for everyone.

## Who may reach whom

From outside only ports 80 and 443 lead in, and only to Traefik; every Service in the cluster is internal (`ClusterIP`). Inside the cluster, `templates/network-policies.yaml` rebuilds the two networks of `compose.yaml`: nothing gets in unless a rule allows it.

| Pod | Accepts connections from |
|---|---|
| web-client (`public: true`) | Traefik, the load test |
| services | the web client and the other services |
| each database | only the services that list it in `waitFor` |
| RabbitMQ | the services |
| Mailpit | Traefik (`/mail/`), the services in `mailpit.senders` (SMTP), today only the user-service |
| cert-manager's check pod | Traefik, so the certificate can be renewed |

A new service that uses a database therefore has to list it in `waitFor`, or the database refuses it.

## Autoscaling (N6.3)

Every stateless service (`autoscaling` in `values.yaml`) has a HorizontalPodAutoscaler. It follows N6.3: when a service's load stays above 70 % of what one instance asks for (its CPU request) for 2 minutes, Kubernetes starts another instance, one at a time, up to 4. After 5 minutes of low load the extra instances are removed again. Databases and the broker keep one instance each.

```bash
kubectl --kubeconfig ~/.kube/relay-aws.yaml -n relay get hpa
deploy/scripts/loadtest.sh
```

`loadtest.sh` runs k6 as a Job inside the cluster: 20 virtual users ask for their profile through the gateway for 5 minutes. Meanwhile it records the load and instance count of each service every 15 seconds and finally the scaling events, so the run ends up in `docs/evidence/` as proof.

## Before a demo

1. `aws sso login --profile relay`, then `deploy/scripts/cloud.sh start` about 15 minutes before (or Actions → cloud → start).
2. Run the smoke test against the HTTPS address. It registers two test accounts and leaves one completed errand behind, so do it before the audience watches, not during.
3. Log in as the administrator (`admin`, `ADMIN_PASSWORD` from `deploy/cloud-secrets.env`). The demo students `alice.tan`, `ben.lim`, `chloe.ng` and `daniel.koh` log in with `SEED_DEMO_PASSWORD` from the same file. Verification codes for new accounts are in Mailpit under `/mail/`.
4. To show the autoscaling live: `kubectl --kubeconfig ~/.kube/relay-aws.yaml -n relay get hpa -w` in one terminal and `HOLD=3m AFTER_SECONDS=0 deploy/scripts/loadtest.sh` in another. The first extra instance appears about 2.5 minutes after the start. The run from `docs/evidence/` is the backup if there is no time.
5. Afterwards `deploy/scripts/cloud.sh stop`. If you forget, the idle alarm stops the instance after 4 hours.

## Freezing the submitted state

`dev` moves with every merge. For the submission, deploy the commit that was handed in with its fixed image tags, so the demonstrated system matches the code:

```bash
IMAGE_TAG=sha-$(git rev-parse --short=7 HEAD) deploy/scripts/deploy.sh
```

Use a commit on `dev` or `main` whose CI run has published the images.

## Adding a service

1. Add an entry under `services` in `deploy/helm/relay/values.yaml` (port, health path, `waitFor`, `secretEnv`, `env`). The comments there explain each field. The service name becomes the host name, so URLs from `compose.yaml` keep working.
2. If it has a database, add it under `databases` with `kind: mongo` or `kind: postgres`.
3. Add the service name to `SERVICES` in `deploy/scripts/local-up.sh`.

## Declaration of AI-assisted work

**Tool:** Claude Code (Claude Opus models).

**How Claude was used:**

- **Generate:** Claude was used to write the Terraform files, the Helm chart, the scripts in `deploy/scripts/`, the load test and the CI/CD workflows in `.github/workflows/`, one step at a time from a plan.
- **Adapt:** Claude was used to adapt the other services so they run in Kubernetes.
- **Debug:** Claude was used to debug failing pods, the certificates and the CI deploy job.
- **Explain:** Claude was used to explain each step before it was committed.
- **Document:** Claude was used to help write this document.

**Decisions:** The choice of k3s on one EC2 instance with Helm and HPA, over Elastic Beanstalk and EKS, was made by the team, not by Claude. The decision and its reasons are in `docs/decisions/0004-cloud-deployment.md`.

**Review:** Every change was reviewed, deployed by hand and checked in the cluster. The autoscaling evidence in `docs/evidence/` comes from real runs.
