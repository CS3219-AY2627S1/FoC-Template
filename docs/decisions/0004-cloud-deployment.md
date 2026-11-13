# 4. Relay runs in Kubernetes (k3s) on one EC2 instance

- Status: accepted
- Date: 2026-11-04
- Scope: running every container of Relay outside the laptops, for testing and the final presentation

## Context

- M7 asks for every service and supporting component in containers, locally or in the cloud. N4 adds deployment to a cloud platform, Kubernetes with automated scaling "demonstrated with evidence", infrastructure as code, secrets management and automated build, test and deployment.
- N6.2: each service runs from one image, unchanged, locally and in one cloud environment, with environment-specific values supplied at start. N6.3: an additional instance of a service starts within 60 seconds when its load stays above 70 % of one instance's capacity for 2 minutes.
- The system is many containers: every service with its own database (four services and four databases now, more to come), RabbitMQ, Mailpit and the web client's gateway. All of them must run together.
- The cloud account is an NUS sandbox lease on AWS: 50 $ for everything, sign-in through SSO only (creating IAM users is forbidden), and the account is emptied when the lease ends on 2026-12-11.
- The system only has to run now and then for tests and on the day of the presentation, not around the clock.

## Decision

Relay runs in k3s, a complete Kubernetes distribution, on a single EC2 instance (t3.xlarge, 4 vCPUs and 16 GB) in `ap-southeast-1`.

- Terraform (`deploy/terraform`) creates the VPC, a public subnet, the security group, an Elastic IP and the instance, which installs k3s on its first boot. There is no NAT gateway and no load balancer: Traefik inside k3s answers on ports 80 and 443 at the fixed address.
- One Helm chart (`deploy/helm/relay`) describes every container. Each service is one entry in `values.yaml` and becomes a Deployment and a Service with the same name as in `compose.yaml`; each database is a StatefulSet with its own volume. `values-local.yaml` (k3d on a laptop) and `values-cloud.yaml` only change where the images come from and what differs per place (N6.2).
- CI publishes every image to GHCR, tagged `dev` after each merge into `dev`. The cluster pulls them with a read-only token.
- HTTPS comes from Let's Encrypt through cert-manager, for a host name under sslip.io that maps to the Elastic IP, so no domain is needed. Plain HTTP redirects to HTTPS and session cookies are `Secure`. Mailpit stays open under `/mail/`, so anyone trying Relay can read the verification code the verify page points to; it only holds test emails.
- Every stateless service has a HorizontalPodAutoscaler that follows N6.3: 70 % of the CPU request as target, scale out only after 2 minutes above it, one instance at a time up to 4, scale in after 5 minutes below. Databases and the broker keep one instance.
- Passwords are random, created by `deploy.sh` into a file that never goes into Git, and handed to the services as a Kubernetes Secret.
- Network policies rebuild the separation of the two Compose networks inside the cluster: the gateway cannot reach any database or the broker, and each database only accepts the service it belongs to. From outside, only Traefik on ports 80 and 443 is reachable.
- GitHub Actions operates the instance through an IAM role it assumes with an OpenID Connect token, limited to workflows on `dev` and `main`: start, stop, and a restart onto the newest images through AWS Systems Manager after every merge into `dev`. A CloudWatch alarm stops the instance after 4 hours without use.

## Alternatives considered

Elastic Beanstalk with the Compose file. Least work, but no Kubernetes, and its scaling copies the whole instance including all databases, so every copy would have its own data. Scaling one service would need one environment with its own instance and load balancer per service, or managed databases.

Amazon EKS. Managed Kubernetes with node autoscaling. The control plane alone costs 0.10 $ per hour, about 73 $ a month, also while nothing runs, and it cannot be paused: the cluster would have to be created and destroyed around every test. It also needs considerably more AWS setup (IAM roles for the nodes, the load balancer controller, the EBS driver).

Amazon ECS on Fargate. Native per-service scaling and no idle cost for the tasks, but not Kubernetes, and stateful databases on Fargate need EFS or managed databases.

Managed databases (RDS, DocumentDB, Amazon MQ) next to any of these. Their hourly cost for seven databases and a broker would exceed the budget, and stopped RDS instances start again by themselves after seven days.

k3s on one instance is real Kubernetes, the same manifests would run on EKS, and it costs about 0.21 $ per hour while it runs and a few cents per day while it is stopped.

## Consequences

One machine is one point of failure: if the instance is down, all of Relay is down. Acceptable for tests and a demonstration, not for production. Within the machine, Kubernetes restarts failed containers, and each service still keeps running while another one is down (N6.1.2).

Scaling stops at the size of the machine. Adding machines (node autoscaling) is not covered; on EKS the Cluster Autoscaler or Karpenter would do it with the same chart.

The data lives on the instance's disk. It survives stopping and starting, but not a rebuild or the end of the lease. Everything else can be rebuilt with `terraform apply` and `deploy.sh` in a few minutes.

Only one person can run Terraform and `deploy.sh`, because the Terraform state and the passwords file stay on that laptop, and SSH and the Kubernetes API only accept that laptop's current address. Everyone else uses the `cloud` workflow in GitHub Actions. Chart changes need `deploy.sh`; new images reach a running instance by themselves after a merge into `dev`.

The `dev` tag moves with every merge. For the submission the chart is deployed with fixed `sha-…` tags, so the demonstrated state can be reproduced.
