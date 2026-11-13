#!/usr/bin/env bash
# Copies the cluster's kubeconfig from the EC2 instance to ~/.kube/relay-aws.yaml and points it at
# the public address. Needed once after terraform apply; the other cloud scripts use the file.
#
#   deploy/scripts/cloud-kubeconfig.sh
#   kubectl --kubeconfig ~/.kube/relay-aws.yaml get pods -n relay
set -euo pipefail

cd "$(dirname "$0")/../terraform"
ip="$(terraform output -raw public_ip)"
key="${RELAY_SSH_KEY:-$HOME/.ssh/relay-aws}"
target="$HOME/.kube/relay-aws.yaml"
# Own known_hosts file: a rebuilt instance gets a new host key, then delete this file.
ssh_opts=(-i "$key" -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$HOME/.ssh/relay-aws-known_hosts")

# On the first boot k3s needs a minute or two before it has written the file.
until ssh "${ssh_opts[@]}" "ubuntu@$ip" test -f /etc/rancher/k3s/k3s.yaml 2>/dev/null; do
  echo "waiting for k3s on $ip"
  sleep 10
done

mkdir -p "$(dirname "$target")"
ssh "${ssh_opts[@]}" "ubuntu@$ip" cat /etc/rancher/k3s/k3s.yaml \
  | sed -e "s#https://127.0.0.1:6443#https://$ip:6443#" -e 's#: default$#: relay-aws#' > "$target"
chmod 600 "$target"
echo "Wrote $target (context relay-aws)"
