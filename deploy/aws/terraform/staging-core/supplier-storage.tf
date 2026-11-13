locals {
  supplier_image_bucket_name = "foc-team-12-supplier-images-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
}

resource "aws_s3_bucket" "supplier_images" {
  bucket        = local.supplier_image_bucket_name
  force_destroy = true

  tags = {
    Name    = local.supplier_image_bucket_name
    Service = "supplier-service"
    Data    = "private-supplier-images"
  }
}

resource "aws_s3_bucket_ownership_controls" "supplier_images" {
  bucket = aws_s3_bucket.supplier_images.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "supplier_images" {
  bucket = aws_s3_bucket.supplier_images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "supplier_image_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.supplier_images.arn,
      "${aws_s3_bucket.supplier_images.arn}/*"
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

resource "aws_s3_bucket_policy" "supplier_images" {
  bucket = aws_s3_bucket.supplier_images.id
  policy = data.aws_iam_policy_document.supplier_image_bucket.json
}

resource "aws_s3_bucket_server_side_encryption_configuration" "supplier_images" {
  bucket = aws_s3_bucket.supplier_images.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_versioning" "supplier_images" {
  bucket = aws_s3_bucket.supplier_images.id
  versioning_configuration { status = "Suspended" }
}

data "aws_iam_policy_document" "supplier_images" {
  statement {
    sid = "ManageSupplierImages"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject"
    ]
    resources = ["${aws_s3_bucket.supplier_images.arn}/images/*"]
  }
}

data "aws_iam_policy_document" "supplier_service_irsa_assume" {
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
      values   = ["system:serviceaccount:foc-staging:supplier-service"]
    }
  }
}

resource "aws_iam_role" "supplier_service" {
  name               = "${local.name_prefix}-supplier-service"
  assume_role_policy = data.aws_iam_policy_document.supplier_service_irsa_assume.json
}

resource "aws_iam_role_policy" "supplier_images" {
  name   = "private-supplier-images"
  role   = aws_iam_role.supplier_service.id
  policy = data.aws_iam_policy_document.supplier_images.json
}
