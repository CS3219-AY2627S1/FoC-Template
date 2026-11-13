#!/bin/sh
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of Floci infrastructure initialization and service configuration
# Author review: Verified correctness and implementation alignment, with operations not supported in Floci's Cloudformation done with aws cli.

# Secret-bearing commands must not be exposed by inherited shell tracing.
set +x
set -eu

export AWS_ENDPOINT_URL=http://127.0.0.1:4566
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
export AWS_REGION="$AWS_DEFAULT_REGION"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_PAGER=''

rm -f /app/data/ready /app/data/relay-auth.env /app/data/relay-rds.env /app/data/relay-msk.env /app/data/relay-aws-access.env

aws cloudformation deploy --stack-name relay-local-auth \
  --template-file /opt/relay/infra/relay-auth.yaml \
  --parameter-overrides \
    "UserPoolName=${COGNITO_USER_POOL_NAME:-test}" \
    "ClientName=${COGNITO_CLIENT_NAME:-relay-client}" \
    "AdminGroupName=${COGNITO_ADMIN_GROUP_NAME:-AdminGroup}" \
    "SuperAdminGroupName=${COGNITO_SUPERADMIN_GROUP_NAME:-SuperAdminGroup}"

pool_id="$(aws cloudformation describe-stacks --stack-name relay-local-auth --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)"
client_id="$(aws cloudformation describe-stacks --stack-name relay-local-auth --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)"
test -n "$pool_id"
test -n "$client_id"
printf 'COGNITO_USER_POOL_ID=%s\nCOGNITO_CLIENT_ID=%s\n' "$pool_id" "$client_id" >/app/data/relay-auth.env

aws cloudformation deploy --stack-name relay-local-storage \
  --template-file /opt/relay/infra/relay-storage.yaml
bucket_name="$(aws cloudformation describe-stacks --stack-name relay-local-storage \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' --output text)"
test -n "$bucket_name" && test "$bucket_name" != None

infrastructure_stack=relay-local-rds
aws cloudformation deploy --stack-name "$infrastructure_stack" \
  --template-file /opt/relay/infra/relay-floci-db.yaml

output() {
  aws cloudformation describe-stacks --stack-name "$infrastructure_stack" \
    --query "Stacks[0].Outputs[?OutputKey==\`$1\`].OutputValue" --output text
}

if [ "${FLOCI_LOCAL_EKS:-false}" = true ]; then
  aws cloudformation deploy --stack-name relay-local-eks \
    --template-file /opt/relay/infra/relay-floci-eks.yaml \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
      "VpcId=$(output VpcId)" \
      "SubnetAId=$(output SubnetAId)" \
      "SubnetBId=$(output SubnetBId)"
fi

# Floci's CloudFormation RDS provider currently ignores these DBInstance
# properties. Reconcile its RDS metadata through the supported RDS API.
database_security_group="$(aws cloudformation describe-stack-resource \
  --stack-name "$infrastructure_stack" --logical-resource-id DatabaseSecurityGroup \
  --query StackResourceDetail.PhysicalResourceId --output text)"
for database in UserDatabase ErrandDatabase CreditDatabase SupplierDatabase; do
  database_id="$(aws cloudformation describe-stack-resource \
    --stack-name "$infrastructure_stack" --logical-resource-id "$database" \
    --query StackResourceDetail.PhysicalResourceId --output text)"
  aws rds modify-db-instance --db-instance-identifier "$database_id" \
    --storage-type gp3 --backup-retention-period 7 \
    --vpc-security-group-ids "$database_security_group" --apply-immediately >/dev/null
  actual="$(aws rds describe-db-instances --db-instance-identifier "$database_id" \
    --query 'DBInstances[0].[StorageType,BackupRetentionPeriod,VpcSecurityGroups[0].VpcSecurityGroupId]' \
    --output text)"
  test "$actual" = "$(printf 'gp3\t7\t%s' "$database_security_group")"
done

password_for() {
  aws secretsmanager get-secret-value --secret-id "$(output "$1")" \
    --query SecretString --output text |
    jq -r '.password'
}
printf 'USER_DATABASE_HOST=%s\nUSER_DATABASE_PORT=%s\nUSER_DATABASE_PASSWORD=%s\nERRAND_DATABASE_HOST=%s\nERRAND_DATABASE_PORT=%s\nERRAND_DATABASE_PASSWORD=%s\nCREDIT_DATABASE_HOST=%s\nCREDIT_DATABASE_PORT=%s\nCREDIT_DATABASE_PASSWORD=%s\nSUPPLIER_DATABASE_HOST=%s\nSUPPLIER_DATABASE_PORT=%s\nSUPPLIER_DATABASE_PASSWORD=%s\n' \
  "$(output UserDatabaseEndpoint)" "$(output UserDatabasePort)" "$(password_for UserDatabaseSecretArn)" \
  "$(output ErrandDatabaseEndpoint)" "$(output ErrandDatabasePort)" "$(password_for ErrandDatabaseSecretArn)" \
  "$(output CreditDatabaseEndpoint)" "$(output CreditDatabasePort)" "$(password_for CreditDatabaseSecretArn)" \
  "$(output SupplierDatabaseEndpoint)" "$(output SupplierDatabasePort)" "$(password_for SupplierDatabaseSecretArn)" >/app/data/relay-rds.env

# Floci records a three-broker Provisioned cluster but runs one plaintext Redpanda
# broker. See floci/README.md for the local fidelity limits.
msk_arn="$(aws kafka create-cluster-v2 --cluster-name relay-local-events \
  --provisioned "BrokerNodeGroupInfo={ClientSubnets=[$(output SubnetAId),$(output SubnetBId),$(output SubnetCId)],InstanceType=kafka.t3.small,SecurityGroups=[$database_security_group]},KafkaVersion=3.8.x,NumberOfBrokerNodes=3,ClientAuthentication={Sasl={Scram={Enabled=true}}},EncryptionInfo={EncryptionInTransit={ClientBroker=TLS,InCluster=true}}" \
  --query ClusterArn --output text)"
test -n "$msk_arn"
# Mirror the AWS KMS-backed SCRAM secret and association as metadata. The
# Redpanda sidecar does not enforce the credential or TLS on its listener.
msk_key_arn="$(aws kms create-key --description 'Local Relay MSK SCRAM credential' --query KeyMetadata.Arn --output text)"
msk_password="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
msk_secret_arn="$(aws secretsmanager create-secret   --name AmazonMSK_relay-local-events --kms-key-id "$msk_key_arn"   --secret-string "$(printf '{"username":"relay","password":"%s"}' "$msk_password")"   --query ARN --output text)"
aws kafka batch-associate-scram-secret --cluster-arn "$msk_arn"   --secret-arn-list "$msk_secret_arn" >/dev/null
for attempt in $(seq 1 60); do
  msk_brokers="$(aws kafka get-bootstrap-brokers --cluster-arn "$msk_arn" --query BootstrapBrokerString --output text 2>/dev/null || true)"
  if [ -n "$msk_brokers" ] && [ "$msk_brokers" != None ]; then break; fi
  sleep 2
done
test -n "$msk_brokers" && test "$msk_brokers" != None
printf 'MSK_CLUSTER_ARN=%s\nMSK_BROKERS=%s\n' "$msk_arn" "$msk_brokers" >/app/data/relay-msk.env

if [ "${FLOCI_LOCAL_EKS:-false}" = true ]; then
  issuer_url="$(aws eks describe-cluster --name relay-local --query cluster.identity.oidc.issuer --output text)"
  issuer_host="${issuer_url#https://}"
  test "$issuer_host" != "$issuer_url"
  # Floci CloudFormation stubs AWS::IAM::OIDCProvider; its IAM API supports it.
  provider_arn="$(aws iam create-open-id-connect-provider --url "$issuer_url" --client-id-list sts.amazonaws.com --query OpenIDConnectProviderArn --output text)"
  test -n "$provider_arn"
  aws cloudformation deploy --stack-name relay-local-aws-access \
    --template-file /opt/relay/infra/relay-aws-access.yaml \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
      "ClusterIssuerUrl=$issuer_url" "ClusterIssuerHost=$issuer_host" \
      "ExistingOidcProviderArn=$provider_arn" \
      "ProfileImageBucketName=$bucket_name" "CognitoUserPoolId=$pool_id"
  access_output() {
    aws cloudformation describe-stacks --stack-name relay-local-aws-access \
      --query "Stacks[0].Outputs[?OutputKey==\`$1\`].OutputValue" --output text
  }
  printf 'USER_API_ROLE_ARN=%s\nUSER_AUTH_API_ROLE_ARN=%s\n' \
    "$(access_output UserApiRoleArn)" "$(access_output UserAuthRoleArn)" >/app/data/relay-aws-access.env
fi

aws cognito-idp admin-create-user \
  --user-pool-id "$pool_id" \
  --username "$FLOCI_INITIAL_ADMIN_EMAIL" \
  --user-attributes "Name=email,Value=$FLOCI_INITIAL_ADMIN_EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id "$pool_id" \
  --username "$FLOCI_INITIAL_ADMIN_EMAIL" \
  --password "$FLOCI_INITIAL_ADMIN_PASSWORD" \
  --permanent
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$pool_id" \
  --username "$FLOCI_INITIAL_ADMIN_EMAIL" \
  --group-name "${COGNITO_SUPERADMIN_GROUP_NAME:-SuperAdminGroup}"

touch /app/data/ready
