locals {
  chat_attachment_bucket_name = "foc-team-12-chat-attachments-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
}

resource "aws_s3_bucket" "chat_attachments" {
  bucket        = local.chat_attachment_bucket_name
  force_destroy = true

  tags = {
    Name    = local.chat_attachment_bucket_name
    Service = "chat-service"
    Data    = "private-chat-attachments"
  }
}

resource "aws_s3_bucket_ownership_controls" "chat_attachments" {
  bucket = aws_s3_bucket.chat_attachments.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "chat_attachments" {
  bucket = aws_s3_bucket.chat_attachments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "chat_attachment_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.chat_attachments.arn,
      "${aws_s3_bucket.chat_attachments.arn}/*"
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "chat_attachments" {
  bucket = aws_s3_bucket.chat_attachments.id
  policy = data.aws_iam_policy_document.chat_attachment_bucket.json
}

resource "aws_s3_bucket_server_side_encryption_configuration" "chat_attachments" {
  bucket = aws_s3_bucket.chat_attachments.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_versioning" "chat_attachments" {
  bucket = aws_s3_bucket.chat_attachments.id
  versioning_configuration { status = "Suspended" }
}

data "aws_iam_policy_document" "chat_attachments" {
  statement {
    sid       = "ListAttachmentPrefix"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.chat_attachments.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["attachments/*"]
    }
  }

  statement {
    sid = "ManageAttachmentObjects"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.chat_attachments.arn}/attachments/*"]
  }
}

data "aws_iam_policy_document" "chat_service_irsa_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.eks_oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.eks_oidc_provider}:sub"
      values   = ["system:serviceaccount:foc-staging:chat-service"]
    }
  }
}

resource "aws_iam_role" "chat_service" {
  name               = "${local.name_prefix}-chat-service"
  assume_role_policy = data.aws_iam_policy_document.chat_service_irsa_assume.json
}

resource "aws_iam_role_policy" "chat_attachments" {
  name   = "private-chat-attachments"
  role   = aws_iam_role.chat_service.id
  policy = data.aws_iam_policy_document.chat_attachments.json
}
