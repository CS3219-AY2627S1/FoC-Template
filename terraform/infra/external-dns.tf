# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# external-dns: keeps Route 53 records in sync with Kubernetes. When an Ingress says
# `host: api.yourdomain.com`, it creates the record api.yourdomain.com -> that Ingress's ALB.
#
# Needed because the ALB isn't created by Terraform: the Load Balancer Controller makes it from the
# Ingress after Terraform has run, and its address changes if the Ingress is ever recreated.
#
# The hosted zone itself lives in terraform/bootstrap (so it survives destroying this stack).

data "aws_route53_zone" "main" {
  name = var.domain_name
}

# --- IAM: change records in this one zone only -----------------------------------------------------
data "aws_iam_policy_document" "external_dns" {
  statement {
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [data.aws_route53_zone.main.arn]
  }

  statement {
    # Read-only lookups; these actions don't support narrowing to one zone
    actions = [
      "route53:ListHostedZones",
      "route53:ListResourceRecordSets",
      "route53:ListTagsForResource",
      "route53:ListTagsForResources",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "external_dns" {
  name               = "${local.cluster_name}-external-dns"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume["external_dns"].json
}

resource "aws_iam_role_policy" "external_dns" {
  name   = "manage-${replace(var.domain_name, ".", "-")}-records"
  role   = aws_iam_role.external_dns.id
  policy = data.aws_iam_policy_document.external_dns.json
}

# --- The controller --------------------------------------------------------------------------------
resource "helm_release" "external_dns" {
  name       = "external-dns"
  repository = "https://kubernetes-sigs.github.io/external-dns/"
  chart      = "external-dns"
  version    = "1.23.0"
  namespace  = "kube-system"

  values = [yamlencode({
    provider = { name = "aws" }
    env = [
      { name = "AWS_DEFAULT_REGION", value = var.aws_region },
    ]

    sources       = ["ingress"]       # watch Ingress hosts (not Services)
    domainFilters = [var.domain_name] # never touch any other domain
    policy        = "upsert-only"     # create/update records, never delete: safest while learning

    # Ownership: next to each record it creates, external-dns writes a TXT record saying "owned by
    # campuscouriers". It only ever changes records it owns, so hand-made records are left alone.
    registry   = "txt"
    txtOwnerId = local.cluster_name

    serviceAccount = {
      create = true
      name   = "external-dns"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.external_dns.arn # IRSA
      }
    }
  })]

  depends_on = [
    aws_eks_node_group.main,
    aws_iam_role_policy.external_dns,
  ]
}
