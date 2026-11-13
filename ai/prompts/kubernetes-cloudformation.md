# Timestamp: 2026-10-28
# Key Prompt:

Implement the k8s setup as follows:

1. namespace.yaml

Create the relay namespace. 

2. configmap.yaml

Create the relay-runtime ConfigMap, include the following runtime settings:
- Production mode, port 3000, secure cookies and Cognito authentication.
- Internal credit-estimation URL, service timeouts and Singapore timezone.

Load settings through envFrom

3. runtime-secret.example.yaml

Documents the expected shape of the relay-runtime Secret:
- Database connection strings and passwords.
- Cognito configuration.
- S3 configuration.
- Relay service tokens
- Relay estimation config

For my reference only.

4. serviceaccounts.yaml

Create Kubernetes identities for user-api and user-auth-api.

Let the deployment script replace them with actual role ARNs. 

5. workloads.yaml

Add all deployments and services for the components accepting HTTP traffic, which are
- host
- supplier-frontend
- user-frontend
- errand-frontend
- credit-frontend
- supplier-api
- user-api
- user-auth-api
- errand-api
- credit-api
- user-event-publisher
- errand-event-publisher

By default, let backends equest 100m CPU and 512Mi memory, with 500m CPU and 768Mi limits.

6. migrations.yaml

Define 4 jobs:

supplier-schema: run migrate.cjs
user-migrate: apply user prisma migrate
errand-migrate: apply errand prisma migrate
credit-migrate: apply errand credit migrate

7. autoscaling.yaml

For all host and frontends, allow 2-4 replicas, scaling target 80% cpu usage
For all supplier, user and errand APIs, allow 1-4 replicas, scaling target 65% cpu usage

8. ingress.yaml

Define the AWS entry into the application by creating:
- IngressClass(alb)
- EKS Auto Mode IngressClassParams that requests the ALB
- Routing rules

9. rolebinding.yaml

Grant the admin user admin@example.com the cluster-admin role.

After you are done, implement the CloudFormation template into parts as follows, and do a test deployment afterwards.

1. infra/relay-eks.yaml: Create the VPC, public/private subnets, NAT gateway, EKS Auto Mode cluster and roles, four private PostgreSQL databases, ECR repositories, generated credentials and Metrics Server.

2. infra/relay-auth.yaml: Create the Cognito user pool, public app client, verification/password settings and admin groups

3. infra/relay-storage.yaml: Create the private profile-image S3 bucket

4. infra/relay-aws-access.yaml:	Create the OIDC trust and AWS roles used by the annotated ServiceAccounts

5. infra/relay-gateway.yaml: Create the API Gateway REST proxy and VPC link to the private ALB, with streaming responses.

After you are done, write a deployment script (deploy.sh) that I can run to deploy the CloudFormation template, running the project in EKS Auto Mode with the k8s setup specified above.

# Usage Scenario
Generated initial implementation, fixed bugs for deployment configuration












