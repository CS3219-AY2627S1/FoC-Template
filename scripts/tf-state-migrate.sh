#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-nusisb_IsbUsersPS-986918902548}"
export AWS_REGION="${AWS_REGION:-ap-southeast-1}"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
TF_DIR="$REPO_ROOT/infra/terraform"
STATE="$TF_DIR/terraform.tfstate"

if [[ ! -s "$STATE" ]]; then
  echo "error: $STATE is missing or empty; there is no local state to migrate." >&2
  echo "Only the teammate who holds the local state runs this script." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required to count resources in the local state file." >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TF_DIR/terraform.tfstate.pre-s3-backup-$TS"
cp "$STATE" "$BACKUP"
echo "Backed up local state to:"
echo "  $BACKUP"

# `terraform state list` cannot run here: once the s3 backend block is present,
# Terraform refuses every state command until `init -migrate-state`. So the
# baseline count is read straight from the local state file; it equals the
# number of addresses `terraform state list` prints from identical content.
BEFORE_COUNT="$(python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); print(sum(len(r.get("instances",[])) for r in d.get("resources",[])))' "$STATE")"
BEFORE_SERIAL="$(grep -m1 -o '"serial": *[0-9]*' "$STATE" | grep -o '[0-9]*')"
echo "Baseline before migration: $BEFORE_COUNT resource instances, serial ${BEFORE_SERIAL:-unknown}."

echo
echo "Migrating local state to the S3 backend ..."
terraform -chdir="$TF_DIR" init -migrate-state -force-copy

AFTER_COUNT="$(terraform -chdir="$TF_DIR" state list | wc -l | tr -d ' ')"
echo
echo "After migration: $AFTER_COUNT resource instances in the S3 backend."

if [[ "$AFTER_COUNT" != "$BEFORE_COUNT" ]]; then
  echo "error: resource count changed during migration ($BEFORE_COUNT -> $AFTER_COUNT)." >&2
  echo "Do NOT proceed. Your backup is at $BACKUP." >&2
  exit 1
fi
echo "Resource count matches the baseline."

echo
echo "Checking for drift (terraform plan) ..."
set +e
terraform -chdir="$TF_DIR" plan -detailed-exitcode
PLAN_RC=$?
set -e

echo
case "$PLAN_RC" in
0)
  echo "plan reports no changes. Migration is clean."
  ;;
2)
  echo "WARNING: plan reports changes (exit code 2)." >&2
  echo "Review the plan above carefully. Do NOT run 'terraform apply' until you" >&2
  echo "understand every change; the migration should show no changes." >&2
  ;;
*)
  echo "error: terraform plan failed (exit code $PLAN_RC). Investigate before applying." >&2
  exit "$PLAN_RC"
  ;;
esac

echo
echo "Next steps:"
echo "  1. Keep the backup ($BACKUP) somewhere safe until the team confirms S3 state works."
echo "  2. Only then delete the local $STATE yourself. This script never deletes it."
