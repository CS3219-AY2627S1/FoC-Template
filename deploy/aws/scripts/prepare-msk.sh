#!/usr/bin/env bash
set -euo pipefail

: "${AWS_REGION:=ap-southeast-1}"
: "${FOC_ENVIRONMENT:=staging}"

profile_args=()
if [[ -n ${AWS_PROFILE:-} ]]; then profile_args=(--profile "$AWS_PROFILE"); fi

aws_cli() { aws "${profile_args[@]}" --region "$AWS_REGION" "$@"; }
parameter() {
  aws_cli ssm get-parameter --name "/foc/$FOC_ENVIRONMENT/$1" \
    --query Parameter.Value --output text
}

cluster_arn=${MSK_CLUSTER_ARN:-$(parameter msk-cluster-arn)}
secret_arns_json=${MSK_SCRAM_SECRET_ARNS:-$(parameter msk-scram-secret-arns)}
locked_configuration_arn=${MSK_LOCKED_CONFIGURATION_ARN:-$(parameter msk-locked-configuration-arn)}
locked_configuration_revision=${MSK_LOCKED_CONFIGURATION_REVISION:-$(parameter msk-locked-configuration-revision)}

secret_arns=()
while IFS= read -r arn; do secret_arns+=("$arn"); done < <(jq -r '.[]' <<< "$secret_arns_json")
if ((${#secret_arns[@]} == 0)); then
  echo 'No MSK SCRAM secrets were resolved.' >&2
  exit 1
fi

wait_for_operation() {
  local operation_arn=$1 state deadline=$((SECONDS + 5400))
  while ((SECONDS < deadline)); do
    state=$(aws_cli kafka describe-cluster-operation-v2 \
      --cluster-operation-arn "$operation_arn" \
      --query ClusterOperationInfo.OperationState --output text)
    case "$state" in
      UPDATE_COMPLETE) return 0 ;;
      UPDATE_FAILED)
        aws_cli kafka describe-cluster-operation-v2 --cluster-operation-arn "$operation_arn" >&2
        return 1
        ;;
    esac
    sleep 20
  done
  echo 'Timed out waiting for the MSK configuration update.' >&2
  return 1
}

wait_for_cluster_active() {
  local state deadline=$((SECONDS + 5400))
  while ((SECONDS < deadline)); do
    state=$(aws_cli kafka describe-cluster-v2 --cluster-arn "$cluster_arn" \
      --query ClusterInfo.State --output text)
    case "$state" in
      ACTIVE) return 0 ;;
      FAILED|DELETING)
        echo "MSK cluster entered unrecoverable state $state." >&2
        return 1
        ;;
    esac
    sleep 20
  done
  echo 'Timed out waiting for the MSK cluster to become ACTIVE.' >&2
  return 1
}

associate() {
  local arn secret
  wait_for_cluster_active
  for arn in "${secret_arns[@]}"; do
    secret=$(aws_cli secretsmanager get-secret-value \
      --secret-id "$arn" --query SecretString --output text)
    jq -e '
      (.username | type == "string" and length > 0) and
      (.password | type == "string" and length > 0)
    ' <<< "$secret" >/dev/null || {
      echo "SCRAM secret $arn is not initialized; rerun configure-secrets.sh." >&2
      return 1
    }
  done

  aws_cli kafka batch-associate-scram-secret \
    --cluster-arn "$cluster_arn" \
    --secret-arn-list "${secret_arns[@]}" >/dev/null

  local associated deadline=$((SECONDS + 900))
  while ((SECONDS < deadline)); do
    associated=$(aws_cli kafka list-scram-secrets --cluster-arn "$cluster_arn" \
      --query 'SecretArnList' --output json)
    if jq -e --argjson expected "$secret_arns_json" \
      '($expected - .) | length == 0' <<< "$associated" >/dev/null; then
      echo "All ${#secret_arns[@]} MSK SCRAM identities are associated."
      return 0
    fi
    sleep 10
  done
  echo 'Timed out waiting for MSK SCRAM secret association.' >&2
  return 1
}

disassociate() {
  local associated disassociate_arns_json=() arn deadline
  wait_for_cluster_active
  associated=$(aws_cli kafka list-scram-secrets --cluster-arn "$cluster_arn" \
    --query 'SecretArnList' --output json)
  while IFS= read -r arn; do disassociate_arns_json+=("$arn"); done \
    < <(jq -r --argjson managed "$secret_arns_json" '.[] | select(. as $arn | $managed | index($arn))' \
      <<< "$associated")

  if ((${#disassociate_arns_json[@]} == 0)); then
    echo 'No managed MSK SCRAM identities remain associated.'
    return 0
  fi

  aws_cli kafka batch-disassociate-scram-secret \
    --cluster-arn "$cluster_arn" \
    --secret-arn-list "${disassociate_arns_json[@]}" >/dev/null

  deadline=$((SECONDS + 900))
  while ((SECONDS < deadline)); do
    associated=$(aws_cli kafka list-scram-secrets --cluster-arn "$cluster_arn" \
      --query 'SecretArnList' --output json)
    if jq -e --argjson managed "$secret_arns_json" \
      '[.[] | select(. as $arn | $managed | index($arn))] | length == 0' \
      <<< "$associated" >/dev/null; then
      echo "Disassociated ${#disassociate_arns_json[@]} managed MSK SCRAM identities."
      return 0
    fi
    sleep 10
  done
  echo 'Timed out waiting for MSK SCRAM secret disassociation.' >&2
  return 1
}

lockdown() {
  local cluster current_arn current_revision current_version response operation_arn
  wait_for_cluster_active
  cluster=$(aws_cli kafka describe-cluster-v2 --cluster-arn "$cluster_arn")
  current_arn=$(jq -r '.ClusterInfo.Provisioned.CurrentBrokerSoftwareInfo.ConfigurationArn // ""' <<< "$cluster")
  current_revision=$(jq -r '.ClusterInfo.Provisioned.CurrentBrokerSoftwareInfo.ConfigurationRevision // ""' <<< "$cluster")
  if [[ $current_arn == "$locked_configuration_arn" && $current_revision == "$locked_configuration_revision" ]]; then
    echo 'MSK already uses the locked ACL configuration.'
    return 0
  fi

  current_version=$(jq -r '.ClusterInfo.CurrentVersion' <<< "$cluster")
  response=$(aws_cli kafka update-cluster-configuration \
    --cluster-arn "$cluster_arn" \
    --current-version "$current_version" \
    --configuration-info \
      "Arn=$locked_configuration_arn,Revision=$locked_configuration_revision")
  operation_arn=$(jq -r '.ClusterOperationArn' <<< "$response")
  wait_for_operation "$operation_arn"
  echo 'MSK now rejects access not explicitly granted by Kafka ACLs.'
}

verify() {
  local cluster state brokers associated current_arn current_revision
  wait_for_cluster_active
  cluster=$(aws_cli kafka describe-cluster-v2 --cluster-arn "$cluster_arn")
  state=$(jq -r '.ClusterInfo.State' <<< "$cluster")
  [[ $state == ACTIVE ]] || { echo "MSK cluster state is $state, not ACTIVE." >&2; return 1; }
  current_arn=$(jq -r '.ClusterInfo.Provisioned.CurrentBrokerSoftwareInfo.ConfigurationArn // ""' <<< "$cluster")
  current_revision=$(jq -r '.ClusterInfo.Provisioned.CurrentBrokerSoftwareInfo.ConfigurationRevision // ""' <<< "$cluster")
  [[ $current_arn == "$locked_configuration_arn" && $current_revision == "$locked_configuration_revision" ]] || {
    echo 'MSK is ACTIVE but does not use the expected locked ACL configuration.' >&2
    return 1
  }
  brokers=$(aws_cli kafka get-bootstrap-brokers --cluster-arn "$cluster_arn" \
    --query BootstrapBrokerStringSaslScram --output text)
  [[ -n $brokers && $brokers != None ]] || { echo 'MSK SCRAM bootstrap brokers are unavailable.' >&2; return 1; }
  associated=$(aws_cli kafka list-scram-secrets --cluster-arn "$cluster_arn" \
    --query 'length(SecretArnList)' --output text)
  [[ $associated -eq ${#secret_arns[@]} ]] || {
    echo "MSK has $associated associated SCRAM secrets; expected ${#secret_arns[@]}." >&2
    return 1
  }
  echo "MSK is ACTIVE with $associated associated SCRAM identities."
}

mark_ready() {
  verify
  aws_cli ssm put-parameter \
    --name "/foc/$FOC_ENVIRONMENT/msk-runtime-ready" \
    --type String --value true --overwrite >/dev/null
  echo 'MSK runtime readiness gate is enabled for automatic deployments.'
}

case "${1:-}" in
  associate) associate ;;
  disassociate) disassociate ;;
  lockdown) lockdown ;;
  verify) verify ;;
  mark-ready) mark_ready ;;
  *) echo 'Usage: prepare-msk.sh {associate|disassociate|lockdown|verify|mark-ready}' >&2; exit 64 ;;
esac
