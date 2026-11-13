data "aws_caller_identity" "current" {}

locals {
  name_prefix                = "foc-${var.environment}"
  github_repository_parts    = split("/", var.github_repository)
  github_oidc_subject_prefix = "repo:${local.github_repository_parts[0]}@${var.github_repository_owner_id}/${local.github_repository_parts[1]}@${var.github_repository_id}"
  tags = {
    Project     = "friend-on-campus"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "shared-team-infrastructure"
  }
}

data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "github_infra_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_oidc_subject_prefix}:environment:aws-staging-infra"]
    }
  }
}

data "aws_iam_policy_document" "github_deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.github_oidc_subject_prefix}:environment:aws-staging-deploy"]
    }
  }
}

resource "aws_iam_role" "github_infra" {
  name               = "${local.name_prefix}-github-infra"
  assume_role_policy = data.aws_iam_policy_document.github_infra_trust.json
}

resource "aws_iam_role" "github_deploy" {
  name               = "${local.name_prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_trust.json
}

# Infrastructure changes are protected by the aws-staging-infra GitHub Environment. The policy
# is service-scoped rather than account AdministratorAccess; IAM writes are restricted by prefix.
data "aws_iam_policy_document" "infra" {
  statement {
    sid = "TerraformState"
    actions = [
      "s3:GetBucketVersioning",
      "s3:ListBucket"
    ]
    resources = ["arn:aws:s3:::${var.state_bucket_name}"]
  }

  statement {
    sid = "TerraformStateObjects"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject"
    ]
    resources = ["arn:aws:s3:::${var.state_bucket_name}/*"]
  }

  statement {
    sid = "ManagedInfrastructure"
    actions = [
      "autoscaling:*",
      "budgets:*",
      "cloudfront:*",
      "cloudwatch:*",
      "ec2:*",
      "ecr:*",
      "eks:*",
      "elasticloadbalancing:*",
      "logs:*",
      "kafka:*",
      "rds:*",
      "secretsmanager:*",
      "ssm:*",
      "sts:GetCallerIdentity"
    ]
    resources = ["*"]
  }

  # MSK SCRAM credentials require a customer-managed symmetric KMS key. The infrastructure
  # workflow creates and owns only the foc-staging-prefixed key and alias declared by Terraform.
  statement {
    sid = "ManageMskEncryptionKey"
    actions = [
      "kms:CreateAlias",
      "kms:CancelKeyDeletion",
      "kms:CreateGrant",
      "kms:CreateKey",
      "kms:DeleteAlias",
      "kms:DescribeKey",
      "kms:DisableKey",
      "kms:DisableKeyRotation",
      "kms:Decrypt",
      "kms:EnableKey",
      "kms:EnableKeyRotation",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:GetKeyPolicy",
      "kms:GetKeyRotationStatus",
      "kms:ListAliases",
      "kms:ListGrants",
      "kms:ListResourceTags",
      "kms:PutKeyPolicy",
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo",
      "kms:RevokeGrant",
      "kms:ScheduleKeyDeletion",
      "kms:TagResource",
      "kms:UntagResource",
      "kms:UpdateAlias",
      "kms:UpdateKeyDescription"
    ]
    resources = ["*"]
  }

  # The staging RDS instance uses the account's AWS-managed RDS key for storage and the
  # Secrets Manager managed key for its generated master-password secret. Restrict key inspection
  # to those aliases and restrict grant creation to the RDS key rather than granting the workflow
  # general KMS access.
  statement {
    sid       = "UseRdsManagedKey"
    actions   = ["kms:DescribeKey"]
    resources = ["arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/*"]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "kms:ResourceAliases"
      values = [
        "alias/aws/rds",
        "alias/aws/secretsmanager"
      ]
    }
  }

  statement {
    sid       = "GrantRdsManagedKeyToAws"
    actions   = ["kms:CreateGrant"]
    resources = ["arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/*"]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "kms:ResourceAliases"
      values   = ["alias/aws/rds"]
    }

    condition {
      test     = "Bool"
      variable = "kms:GrantIsForAWSResource"
      values   = ["true"]
    }
  }

  statement {
    sid = "PrivateMediaBuckets"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:DeleteBucketPolicy",
      "s3:DeleteBucketPublicAccessBlock",
      "s3:Get*",
      "s3:List*",
      "s3:PutBucketOwnershipControls",
      "s3:PutBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketTagging",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration"
    ]
    resources = [
      "arn:aws:s3:::foc-team-12-chat-attachments-${data.aws_caller_identity.current.account_id}-${var.aws_region}",
      "arn:aws:s3:::foc-team-12-supplier-images-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
    ]
  }

  statement {
    sid = "PrivateMediaObjectsForTeardown"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:GetObject",
      "s3:ListMultipartUploadParts"
    ]
    resources = [
      "arn:aws:s3:::foc-team-12-chat-attachments-${data.aws_caller_identity.current.account_id}-${var.aws_region}/*",
      "arn:aws:s3:::foc-team-12-supplier-images-${data.aws_caller_identity.current.account_id}-${var.aws_region}/*"
    ]
  }

  statement {
    sid = "PrefixedIamResources"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreatePolicy",
      "iam:CreateRole",
      "iam:DeletePolicy",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListPolicyVersions",
      "iam:ListRolePolicies",
      "iam:PassRole",
      "iam:PutRolePolicy",
      "iam:TagPolicy",
      "iam:TagRole",
      "iam:UntagPolicy",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy"
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${local.name_prefix}-*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-*"
    ]
  }

  # EKS IAM Roles for Service Accounts (IRSA) requires an IAM OIDC provider for
  # this cluster's issuer. Scope management to EKS issuer URLs in the staging region.
  statement {
    sid = "ManageEksOidcProvider"
    actions = [
      "iam:AddClientIDToOpenIDConnectProvider",
      "iam:CreateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:GetOpenIDConnectProvider",
      "iam:RemoveClientIDFromOpenIDConnectProvider",
      "iam:TagOpenIDConnectProvider",
      "iam:UntagOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint"
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/oidc.eks.${var.aws_region}.amazonaws.com/id/*"
    ]
  }

  statement {
    sid       = "CreateRequiredServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::*:role/aws-service-role/*"]

    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values = [
        "autoscaling.amazonaws.com",
        "cloudfront.amazonaws.com",
        "vpcorigin.cloudfront.amazonaws.com",
        "eks.amazonaws.com",
        "elasticloadbalancing.amazonaws.com",
        "kafka.amazonaws.com",
        "rds.amazonaws.com",
        "spot.amazonaws.com"
      ]
    }
  }
}

resource "aws_iam_role_policy" "github_infra" {
  name   = "${local.name_prefix}-infrastructure"
  role   = aws_iam_role.github_infra.id
  policy = data.aws_iam_policy_document.infra.json
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid = "PublishImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetAuthorizationToken",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    ]
    resources = ["*"]
  }

  statement {
    sid       = "DescribeCluster"
    actions   = ["eks:DescribeCluster"]
    resources = ["arn:aws:eks:${var.aws_region}:${data.aws_caller_identity.current.account_id}:cluster/${local.name_prefix}"]
  }

  statement {
    sid       = "ReadDeploymentEndpoint"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/foc/${var.environment}/*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.name_prefix}-deployment"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
