# Timestamp: 2026-11-06
# Key Prompt:

Consolidate all deployment steps into a single script (`deploy/deploy.sh`). It must handle the following:
- Load environment variables and perform SSO sign-in automatically.
- Create/update Cognito, S3, and EKS resources.
- Build and pushi Docker images, ensuring that application images pull from local Floci ECR.
- Apply Kubernetes configuration in the k8s folder, including the EKS cluster, Kafka setup, and application workloads.
Note: Ensure that Reruns are designed to be non-destructive, stop before repeating steps where changes are not required, to avoid duplicate work.

Have two separate deployments, local with AWS Floci, and Full AWS deployment.

- AWS: EKS Auto Mode shall run the application; RDS, MSK, Cognito and S3 provide its external services.
- Local: Floci shall create a local k3s Kubernetes cluster, alongside emulated AWS services.

Inspect the already present `k8s/base` files before proceeding with the addition of Floci and the AWS deployment enhancements stated below:

1. configmap.yaml
Add the following
- Kafka topic names, 12 partitions, replication factor `3`, minimum in-sync replicas `2`.


2. runtime-secret.example.yaml
Add Kafka broker addresses and credentials.

3. kafka-topics.yaml
Define the `kafka-init` Job. Reuse the credit API image, then run `node scripts/kafka-topics.mjs`

That script shall create and check the following
- `user-events`
- `user-events-dlq`
- `errand-events`
- `errand-events-dlq`

Use the dlq topics for failed event processing.

4. keda-credit.yaml

Handle scaling for credit-api, separately from the ordinary HPA file as it needs to scale based on the backlog of messages.

Define a TriggerAuthentication that reads Kafka credentials from relay-runtime, and a KEDA ScaledObject targeting credit-api.

Scale between 1-4 replicas.

Make the Kafka trigger check relay-credit-events and errand-events using a lag threshold of 100 and a 30s polling interval.

After you are done, update the CloudFormation templates as follows:

infra/relay-cloudfront.yaml
Create the public HTTPS entry point here

Then add Floci support by creating a deployment script with the following stages:

deploy/scripts/deploy-eks.sh
1. Provision EKS and its supporting AWS resources.
2. Build images using the definitions in `compose.yaml`, pushes them to ECR and resolves image references.
3. Apply the namespace, ConfigMap and ServiceAccounts.
4. Create runtime, service-token and estimation Secrets.
5. Runs Kafka topic initialization and database migration Jobs.
6. Applies the application Deployments and Services.
7. Installs KEDA and applies scaling policies and ingress.
8. Waits for application rollouts and the ALB.
9. Provisions API Gateway and CloudFront.
10. Updates the auth service with the final public origin.

If you are unsure, check the existing deploy/scripts/deploy.sh as a reference. Ensure that the behaviour of deploy.sh and deploy-eks.sh are similar in terms of the flow above.

After you are done, add a CI step where you run the local eks.sh to test local deployment.

# Usage Scenario:
Created initial implementation and debugged edge cases
