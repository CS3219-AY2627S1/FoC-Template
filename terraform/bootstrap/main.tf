# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# --- Remote state bucket ---------------------------------------------------------------------------
# Bucket names are global across all AWS accounts, so the account id makes it unique.
resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-tfstate-${var.aws_account_id}"

  lifecycle {
    # Deleting this bucket loses track of every resource Terraform manages, so
    # `terraform destroy` refuses until this line is removed.
    prevent_destroy = true
  }
}

# Keep every previous version of the state file. If a bad apply or a mistake corrupts the
# state, an older version can be restored from the S3 console.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encrypt at rest. State can contain sensitive values (e.g. database connection details).
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # S3-managed keys: free. KMS keys add audit trails but cost extra.
    }
  }
}

# Never public, whatever a later bucket policy or object ACL says
resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Reject any request not made over HTTPS
data "aws_iam_policy_document" "state" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
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

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state.json

  # S3 can reject a policy applied at the same moment as the public access block
  depends_on = [aws_s3_bucket_public_access_block.state]
}

# Old state versions pile up with every apply; delete ones older than 90 days
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {} # applies to the whole bucket

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

# --- Cost alerts -----------------------------------------------------------------------------------
# EKS and NAT gateways bill by the hour whether or not anyone uses the app. This emails you before a
# forgotten cluster becomes an expensive surprise.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
