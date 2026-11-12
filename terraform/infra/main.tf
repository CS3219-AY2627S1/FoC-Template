# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# One file per part: vpc.tf, eks.tf, irsa.tf, load-balancer-controller.tf, external-secrets.tf, rds.tf,
# ecr.tf, external-dns.tf, frontend.tf (the hosted zone and API certificate live in terraform/bootstrap/dns.tf).
# Further parts are added the same way.
#
# These data sources read who you are signed in as; the signed_in_as output shows it, so
# `terraform plan` quickly confirms you are in the right account.
data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
