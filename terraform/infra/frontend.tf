# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# Frontend: the React build (static files) in a private S3 bucket, served worldwide over HTTPS by
# CloudFront at https://app.<domain>.
#
#   browser ──HTTPS──> CloudFront (edge locations, cache, TLS cert) ──signed request──> S3 bucket (private)
#                                                                                    ▲
#   scripts/deploy-frontend.ps1: pnpm build ──aws s3 sync──────────────────────────────┘
#
# The bucket is never public: only this CloudFront distribution may read it (Origin Access Control).
# Cost when idle: almost nothing (S3 storage is cents; CloudFront bills per request/GB).

locals {
  app_hostname = "${var.app_subdomain}.${var.domain_name}"
}

# --- Bucket ----------------------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project}-frontend-${var.aws_account_id}"

  # Only build output lives here (rebuildable from git), so let `terraform destroy` empty it
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Only this distribution may read objects (and nothing may list or write through it)
data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# --- Certificate (must be in us-east-1 for CloudFront) ---------------------------------------------
resource "aws_acm_certificate" "app" {
  provider = aws.us_east_1

  domain_name       = local.app_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "app_certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.app.domain_validation_options : option.domain_name => option
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

# Waits until the certificate is ISSUED (CloudFront refuses one that isn't). Quick now that the
# domain's nameservers point at Route 53.
resource "aws_acm_certificate_validation" "app" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for record in aws_route53_record.app_certificate_validation : record.fqdn]
}

# --- CloudFront ------------------------------------------------------------------------------------
# Lets CloudFront sign its requests to the private bucket
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project}-frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# AWS-managed policies (looked up by name)
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized" # caches by path; respects the Cache-Control headers set on upload
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy" # HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  comment             = "${var.project} frontend (${local.app_hostname})"
  aliases             = [local.app_hostname]
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_200" # edge locations incl. Asia; excludes the priciest regions

  origin {
    origin_id                = "s3-frontend"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id           = "s3-frontend"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  # The app uses React Router with real paths (/errands/123), which aren't files in the bucket.
  # S3 answers 403 for missing objects (CloudFront may not list the bucket), so serve index.html
  # with 200 instead and let React Router show the right page.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# --- DNS: app.<domain> -> CloudFront (IPv4 and IPv6) -----------------------------------------------
resource "aws_route53_record" "app" {
  for_each = toset(["A", "AAAA"])

  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.app_hostname
  type    = each.value

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
