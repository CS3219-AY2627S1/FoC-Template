# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# External Secrets Operator (ESO): copies secrets from AWS Secrets Manager into Kubernetes Secrets,
# and keeps them in sync when they change in AWS.
#
#   Secrets Manager "campuscouriers/user-service-jwt"
#        │  read by the ESO controller (IAM role below, IRSA)
#        ▼
#   ExternalSecret (k8s/app/external-secrets.yaml) ──> Kubernetes Secret "user-service-jwt" ──> pods
#
# Kubernetes never stores the source of truth, and nobody runs `kubectl create secret` by hand.

locals {
  # Every secret for this project lives under this name prefix; ESO may read only these
  secrets_prefix = "${var.project}/"
}

# --- IAM: read-only access to this project's secrets -----------------------------------------------
data "aws_iam_policy_document" "external_secrets" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
      "secretsmanager:ListSecretVersionIds",
    ]
    # Secrets Manager adds a random 6-character suffix to every secret ARN, hence the trailing *
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:${local.secrets_prefix}*",
      # The RDS master password. RDS names this secret itself ("rds!db-..."), so it doesn't match
      # the prefix above; only the db-init Job in k8s/ops uses it.
      aws_db_instance.main.master_user_secret[0].secret_arn,
    ]
  }
}

resource "aws_iam_role" "external_secrets" {
  name               = "${local.cluster_name}-external-secrets"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume["external_secrets"].json
}

resource "aws_iam_role_policy" "external_secrets" {
  name   = "read-project-secrets"
  role   = aws_iam_role.external_secrets.id
  policy = data.aws_iam_policy_document.external_secrets.json
}

# --- The operator ----------------------------------------------------------------------------------
resource "helm_release" "external_secrets" {
  name = "external-secrets"
  # OCI registry (GitHub Container Registry) rather than https://charts.external-secrets.io: that
  # index points at GitHub release downloads, which returned 504s for this version
  repository       = "oci://ghcr.io/external-secrets/charts"
  chart            = "external-secrets"
  version          = "2.14.0"
  namespace        = "external-secrets"
  create_namespace = true

  values = [yamlencode({
    installCRDs = true # ExternalSecret, ClusterSecretStore, ... resource types

    serviceAccount = {
      create = true
      name   = "external-secrets"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.external_secrets.arn # IRSA
      }
    }
  })]

  depends_on = [
    aws_eks_node_group.main,
    aws_iam_role_policy.external_secrets,
  ]
}

# --- Secrets ---------------------------------------------------------------------------------------
# Terraform creates each secret "container" but never its value: anything Terraform sets ends up in
# the state file. Put the values in with the AWS CLI (see terraform/README.md, "Secrets").
# Database credentials are added in the RDS step.
resource "aws_secretsmanager_secret" "user_service_jwt" {
  name        = "${local.secrets_prefix}user-service-jwt"
  description = "RSA key pair user-service signs JWTs with. JSON keys: private.pem, public.pem"

  # Delete immediately on destroy so the name can be reused right away (default: 30-day recovery
  # window, during which the name is taken). Use 7-30 days for anything long-lived.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret" "user_bootstrap_admin" {
  name                    = "${local.secrets_prefix}user-bootstrap-admin"
  description             = "First administrator. JSON keys: BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD"
  recovery_window_in_days = 0
}

# Claude (Anthropic) API key for rag-service, the Assistant page. Same approach as the OpenAI key below:
# Terraform creates only the empty secret, a person stores the key (k8s/README.md, "API keys").
resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name                    = "${local.secrets_prefix}anthropic-api-key"
  description             = "Claude API key for rag-service. JSON key: ANTHROPIC_API_KEY"
  recovery_window_in_days = 7 # can't be regenerated, so allow recovery after an accidental delete
}

# OpenAI API key for ai-errand-assistant-service. Terraform creates only the empty secret: the key is
# issued by OpenAI, and storing it here would put it in the Terraform state. Store the value by hand
# (k8s/README.md, "API keys"); k8s/app/external-secrets.yaml syncs it into the cluster.
resource "aws_secretsmanager_secret" "openai_api_key" {
  name                    = "${local.secrets_prefix}openai-api-key"
  description             = "OpenAI API key for ai-errand-assistant-service. JSON key: OPENAI_API_KEY"
  recovery_window_in_days = 7 # can't be regenerated, so allow recovery after an accidental delete
}

# Shared key order-service sends to credit-service (header X-Order-Service-Key) to prove a credit
# reservation really comes from order-service. Generated like the DB passwords: ephemeral +
# write-only, so it never appears in the state file. To rotate: bump secret_string_wo_version, apply,
# wait for External Secrets to sync (up to 1h, or force-sync), then restart BOTH services together:
# environment variables from Secrets are only read at pod start.
ephemeral "random_password" "order_credit_service_key" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "order_credit_service_key" {
  name                    = "${local.secrets_prefix}order-credit-service-key"
  description             = "Shared key between order-service and credit-service. JSON key: ORDER_CREDIT_SERVICE_KEY"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "order_credit_service_key" {
  secret_id = aws_secretsmanager_secret.order_credit_service_key.id
  secret_string_wo = jsonencode({
    ORDER_CREDIT_SERVICE_KEY = ephemeral.random_password.order_credit_service_key.result
  })
  secret_string_wo_version = 1
}
