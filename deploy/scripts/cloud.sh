#!/usr/bin/env bash
# Starts, stops and restarts the EC2 instance, from the laptop or from GitHub Actions
# (.github/workflows/cloud.yml). It finds the instance by its Name tag, so it needs no Terraform state.
# A stopped instance keeps its disk, its data and its address; k3s and every pod come back by
# themselves after a start, which takes about two minutes.
#
#   deploy/scripts/cloud.sh start | stop | status
#   deploy/scripts/cloud.sh restart    pods pull the newest dev images (through Systems Manager)
set -euo pipefail

# On the laptop the SSO profile; in GitHub Actions the credentials come from the environment.
[ -n "${AWS_ACCESS_KEY_ID:-}" ] || export AWS_PROFILE="${AWS_PROFILE:-relay}"
export AWS_REGION="${AWS_REGION:-ap-southeast-1}" AWS_PAGER=""

# The SSO login lasts a few hours; say how to renew it instead of showing the CLI's error.
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "The AWS login has expired. Run: aws sso login --profile ${AWS_PROFILE:-relay}" >&2
  exit 1
fi

read -r instance state ip < <(aws ec2 describe-instances \
  --filters Name=tag:Name,Values=relay Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].[InstanceId,State.Name,PublicIpAddress]' --output text)
if [ "$instance" = None ]; then
  echo "No instance named relay in $AWS_REGION. Create it with terraform, see docs/deployment.md." >&2
  exit 1
fi
url="https://relay.${ip//./-}.sslip.io"

case "${1:-status}" in
  start)
    echo "Starting $instance, waiting until it runs (about a minute)..."
    aws ec2 start-instances --instance-ids "$instance" >/dev/null
    aws ec2 wait instance-running --instance-ids "$instance"
    ip="$(aws ec2 describe-instances --instance-ids "$instance" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
    echo "Running. Relay is back in about two minutes on https://relay.${ip//./-}.sslip.io"
    ;;
  stop)
    echo "Stopping $instance, waiting until it is stopped (one to two minutes)..."
    aws ec2 stop-instances --instance-ids "$instance" >/dev/null
    aws ec2 wait instance-stopped --instance-ids "$instance"
    echo "Stopped. Only the disk and the address cost money now."
    ;;
  status)
    echo "$instance is $state ($url)"
    ;;
  restart)
    if [ "$state" != running ]; then
      echo "$instance is $state, so there is nothing to restart. The next start uses the newest images anyway."
      exit 0
    fi
    # Runs on the instance itself, so neither SSH nor the Kubernetes API has to be reachable.
    command_id="$(aws ssm send-command --instance-ids "$instance" --document-name AWS-RunShellScript \
      --comment "relay: run the newest dev images" \
      --parameters 'commands=["export KUBECONFIG=/etc/rancher/k3s/k3s.yaml","kubectl -n relay rollout restart deployment","kubectl -n relay rollout status deployment --timeout=5m"]' \
      --query Command.CommandId --output text)"
    echo "Restarting the services on $instance (command $command_id)..."
    status=Pending
    for _ in $(seq 1 80); do
      sleep 5
      status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance" \
        --query Status --output text 2>/dev/null || echo Pending)"
      case "$status" in Pending | InProgress | Delayed) ;; *) break ;; esac
    done
    aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance" \
      --query '[StandardOutputContent,StandardErrorContent]' --output text 2>/dev/null || true
    if [ "$status" != Success ]; then
      echo "The restart ended with status $status." >&2
      exit 1
    fi
    echo "Done. Relay runs the newest dev images on $url"
    ;;
  *)
    echo "usage: $0 start | stop | status | restart" >&2
    exit 2
    ;;
esac
