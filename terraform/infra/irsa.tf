# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# IRSA: IAM Roles for Service Accounts. How a pod gets AWS permissions without stored keys:
#
#   1. Every EKS cluster has an OIDC issuer: it signs a token for each pod saying
#      "I am ServiceAccount X in namespace Y of cluster Z".
#   2. The OIDC provider below tells IAM to trust tokens signed by THIS cluster's issuer.
#   3. A role's trust policy (irsa_assume below) accepts only tokens for one specific ServiceAccount.
#   4. The ServiceAccount carries the annotation eks.amazonaws.com/role-arn: <role>. The AWS SDK in
#      the pod swaps its token for temporary credentials of that role (sts:AssumeRoleWithWebIdentity).
#
# Used instead of EKS Pod Identity, which this account's organization policy blocks.

resource "aws_iam_openid_connect_provider" "eks" {
  url            = aws_eks_cluster.main.identity[0].oidc[0].issuer
  client_id_list = ["sts.amazonaws.com"] # the token's intended audience
}

locals {
  oidc_issuer = replace(aws_iam_openid_connect_provider.eks.url, "https://", "")

  # Which ServiceAccount may use which role: "<namespace>:<serviceaccount>". Add one line per role.
  irsa_service_accounts = {
    ebs_csi                      = "kube-system:ebs-csi-controller-sa"
    aws_load_balancer_controller = "kube-system:aws-load-balancer-controller"
    external_secrets             = "external-secrets:external-secrets"
    external_dns                 = "kube-system:external-dns"
  }
}

# One trust policy per entry above
data "aws_iam_policy_document" "irsa_assume" {
  for_each = local.irsa_service_accounts

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    # Only this exact ServiceAccount...
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_issuer}:sub"
      values   = ["system:serviceaccount:${each.value}"]
    }

    # ...and only tokens meant for AWS STS
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_issuer}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}
