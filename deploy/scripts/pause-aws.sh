#!/usr/bin/env bash
# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
# Scope: Generated implementation of AWS service pausing and data-preserving snapshots
# Author review: Verified that all services are stopped and database, Cognito and S3 data are still retained. Documented loss of MSK log, and checked that pause will greatly minimize AWS costs. 

set -euo pipefail
source "$(dirname "$0")/aws-lifecycle-lib.sh" "${1:-relay}"
printf '\nAWS pause preview   account %s, region %s, stack %s\n' "$account_id" "$aws_region" "$stack_name"
printf '%s\n' \
  "  Disable and retain CloudFront stack $edge_stack and its domain; the application will be unavailable." \
  "  Delete gateway, VPC Link, AWS access and EKS stacks, including ALB, nodes, ECR images, RDS instances and MSK." \
  "  Permanently delete all MSK topic data; retain RDS snapshots, Cognito, S3 and the AI configuration secret." \
  "  Retained resources may incur charges; keep $state_file for redeployment."
confirm_lifecycle_action
pause_compute
printf 'Active Relay infrastructure, including MSK Provisioned, removed. The disabled CloudFront distribution, Cognito, S3, and RDS snapshots remain.\n'
printf 'MSK topic data is deleted immediately; RDS snapshot and S3 storage may still incur charges. Redeploy with deploy/deploy.sh.\n'
