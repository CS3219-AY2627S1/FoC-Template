#!/bin/sh
set -eu

export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION="${AWS_REGION:-ap-southeast-1}"
prefix="${FOC_NAME_PREFIX:-foc-dev}"

aws_local() { aws --endpoint-url http://localhost:4566 "$@"; }

for bucket in "${FOC_USER_BUCKET:-foc-dev-user}" "${FOC_SUPPLIER_BUCKET:-foc-dev-supplier}" "${FOC_ORDER_BUCKET:-foc-dev-order}"; do
  if ! aws_local s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    aws_local s3api create-bucket --bucket "$bucket" --create-bucket-configuration "LocationConstraint=$AWS_DEFAULT_REGION" >/dev/null
  fi

  aws_local s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
  aws_local s3api put-bucket-encryption --bucket "$bucket" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
done

# Match the production topic/queue naming, delivery settings, and subscriptions.
for service in user supplier order credit; do
  aws_local sns create-topic --name "$prefix-$service-events" >/dev/null
done

for service in order credit realtime; do

  dlq_url=$(aws_local sqs create-queue --queue-name "$prefix-$service-dlq" --query QueueUrl --output text)
  aws_local sqs set-queue-attributes --queue-url "$dlq_url" --attributes MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true >/dev/null
  dlq_arn=$(aws_local sqs get-queue-attributes --queue-url "$dlq_url" --attribute-names QueueArn --query Attributes.QueueArn --output text)

  queue_url=$(aws_local sqs create-queue --queue-name "$prefix-$service-events" --query QueueUrl --output text)
  cat > /tmp/foc-queue-attributes.json <<ATTRIBUTES
{
  "VisibilityTimeout": "60",
  "ReceiveMessageWaitTimeSeconds": "20",
  "MessageRetentionPeriod": "345600",
  "SqsManagedSseEnabled": "true",
  "RedrivePolicy": "{\"deadLetterTargetArn\":\"$dlq_arn\",\"maxReceiveCount\":5}"
}
ATTRIBUTES
  aws_local sqs set-queue-attributes --queue-url "$queue_url" --attributes file:///tmp/foc-queue-attributes.json >/dev/null
  queue_arn=$(aws_local sqs get-queue-attributes --queue-url "$queue_url" --attribute-names QueueArn --query Attributes.QueueArn --output text)

  cat > /tmp/foc-redrive-allow.json <<ATTRIBUTES
{"RedriveAllowPolicy":"{\"redrivePermission\":\"byQueue\",\"sourceQueueArns\":[\"$queue_arn\"]}"}
ATTRIBUTES
  aws_local sqs set-queue-attributes --queue-url "$dlq_url" --attributes file:///tmp/foc-redrive-allow.json >/dev/null
done

topic_arn_for() {
  aws_local sns create-topic --name "$prefix-$1-events" --query TopicArn --output text
}

queue_url_for() {
  aws_local sqs get-queue-url --queue-name "$prefix-$1-events" --query QueueUrl --output text
}

queue_arn_for() {
  queue_url=$(queue_url_for "$1")
  aws_local sqs get-queue-attributes --queue-url "$queue_url" --attribute-names QueueArn --query Attributes.QueueArn --output text
}

allow_sns() {
  consumer=$1
  sources=$2
  queue_arn=$(queue_arn_for "$consumer")
  queue_url=$(queue_url_for "$consumer")
  policy=$(printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"sns.amazonaws.com"},"Action":"sqs:SendMessage","Resource":"%s","Condition":{"ArnEquals":{"aws:SourceArn":%s},"StringEquals":{"aws:SourceAccount":"000000000000"}}}]}' "$queue_arn" "$sources")
  escaped=$(printf '%s' "$policy" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '%s\n' "{\"Policy\":\"$escaped\"}" > /tmp/foc-queue-policy.json
  aws_local sqs set-queue-attributes --queue-url "$queue_url" --attributes file:///tmp/foc-queue-policy.json >/dev/null
}

subscribe() {
  publisher=$1
  consumer=$2
  filter=$3
  topic_arn=$(topic_arn_for "$publisher")
  queue_arn=$(queue_arn_for "$consumer")
  cat > /tmp/foc-subscribe.json <<EOF
{
  "TopicArn": "$topic_arn",
  "Protocol": "sqs",
  "Endpoint": "$queue_arn",
  "Attributes": {
    "RawMessageDelivery": "true",
    "FilterPolicyScope": "MessageAttributes",
    "FilterPolicy": "$filter"
  }
}
EOF
  subscription_arn=$(aws_local sns subscribe --cli-input-json file:///tmp/foc-subscribe.json --query 'SubscriptionArn' --output text)
  aws_local sns set-subscription-attributes --subscription-arn "$subscription_arn" --attribute-name FilterPolicy --attribute-value "$(printf '%s' "$filter" | sed 's/\\"/"/g')" >/dev/null
}

user_topic=$(topic_arn_for user)
order_topic=$(topic_arn_for order)
credit_topic=$(topic_arn_for credit)
supplier_topic=$(topic_arn_for supplier)
allow_sns credit "[\"$user_topic\",\"$order_topic\"]"
allow_sns order "[\"$credit_topic\"]"
allow_sns realtime "[\"$supplier_topic\",\"$order_topic\"]"
subscribe supplier realtime '{\"eventType\":[\"SupplierChangedEvent\"]}'
subscribe order realtime '{\"eventType\":[\"ErrandMessagePostedEvent\",\"ErrandChatReadEvent\"]}'
subscribe user credit '{\"eventType\":[\"UserCreatedEvent\"]}'
subscribe order credit '{\"eventType\":[\"ErrandCancelledEvent\",\"ErrandExpiredEvent\",\"ErrandCompletedEvent\"]}'
subscribe credit order '{\"eventType\":[\"CreditPaidEvent\",\"CreditPaymentDeclinedEvent\",\"CreditRefundedEvent\",\"CreditRefundDeclinedEvent\"]}'

rm -f /tmp/foc-queue-attributes.json /tmp/foc-redrive-allow.json /tmp/foc-queue-policy.json /tmp/foc-subscribe.json /tmp/foc-filter.json
touch /tmp/foc-resources-ready
