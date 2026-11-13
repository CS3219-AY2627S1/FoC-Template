locals {
  name_prefix = "foc-${var.environment}"
  tags = {
    Project     = "friend-on-campus"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "shared-team-infrastructure"
  }
  origin_id = "${local.name_prefix}-gateway"
}

# Resolve AWS-managed policies by their stable names instead of duplicating opaque IDs. A typo in
# an ID is otherwise accepted by Terraform validation and rejected only during distribution creation.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_vpc_origin" "gateway" {
  vpc_origin_endpoint_config {
    name                   = local.origin_id
    arn                    = var.alb_arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

data "aws_security_group" "gateway_alb" {
  id = var.alb_security_group_id
}

# CloudFront creates this service-managed group together with the VPC origin. Referencing the group
# explicitly follows AWS's VPC-origin guidance and avoids relying on the source IP of its ENIs.
data "aws_security_group" "cloudfront_vpc_origin" {
  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG"]
  }
  filter {
    name   = "vpc-id"
    values = [data.aws_security_group.gateway_alb.vpc_id]
  }

  depends_on = [aws_cloudfront_vpc_origin.gateway]
}

resource "aws_vpc_security_group_ingress_rule" "cloudfront_to_gateway" {
  security_group_id            = var.alb_security_group_id
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origin.id
  description                  = "HTTP from CloudFront VPC origin"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_cloudfront_origin_request_policy" "dynamic" {
  name    = "${local.name_prefix}-dynamic"
  comment = "Forward browser identity and request parameters while replacing the Host header."

  cookies_config { cookie_behavior = "all" }
  query_strings_config { query_string_behavior = "all" }
  headers_config {
    header_behavior = "allExcept"
    headers { items = ["Host"] }
  }
}

resource "aws_cloudfront_distribution" "gateway" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Friend on Campus ${var.environment}"
  price_class     = "PriceClass_200"
  http_version    = "http2and3"

  origin {
    domain_name = var.alb_dns_name
    origin_id   = local.origin_id

    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.gateway.id
    }
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.dynamic.id
  }

  dynamic "ordered_cache_behavior" {
    for_each = toset(["/user-assets/*", "/supplier-assets/*", "/order-assets/*", "/credit-assets/*", "/admin-assets/*"])
    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = local.origin_id
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    # AWS fixes this value at TLSv1 for its generated *.cloudfront.net certificate. Selecting a
    # newer viewer policy requires a custom domain and ACM certificate in us-east-1.
    minimum_protocol_version = "TLSv1"
  }

  depends_on = [aws_vpc_security_group_ingress_rule.cloudfront_to_gateway]
}

resource "aws_ssm_parameter" "public_url" {
  name        = "/foc/${var.environment}/public-url"
  type        = "String"
  value       = "https://${aws_cloudfront_distribution.gateway.domain_name}"
  description = "Public Friend on Campus staging URL used by deployment smoke tests."
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {
  provider            = aws.us_east_1
  alarm_name          = "${local.name_prefix}-cloudfront-5xx"
  alarm_description   = "CloudFront 5xx error rate exceeded five percent."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  dimensions = {
    DistributionId = aws_cloudfront_distribution.gateway.id
    Region         = "Global"
  }
}

locals {
  alb_dimension = replace(var.alb_arn, "/^arn:[^:]+:elasticloadbalancing:[^:]+:[^:]+:loadbalancer\\//", "")
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  alarm_name          = "${local.name_prefix}-alb-target-5xx"
  alarm_description   = "Gateway targets returned at least five 5xx responses in five minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  dimensions          = { LoadBalancer = local.alb_dimension }
}

resource "aws_cloudwatch_metric_alarm" "alb_latency" {
  alarm_name          = "${local.name_prefix}-alb-high-latency"
  alarm_description   = "Gateway target p95 response time exceeded two seconds."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 2
  treat_missing_data  = "notBreaching"
  dimensions          = { LoadBalancer = local.alb_dimension }
}

resource "aws_cloudwatch_dashboard" "edge" {
  dashboard_name = "${local.name_prefix}-edge"
  dashboard_body = jsonencode({
    widgets = [{
      type = "metric", x = 0, y = 0, width = 24, height = 7,
      properties = {
        title  = "ALB errors and target latency"
        region = var.aws_region
        metrics = [
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", local.alb_dimension, { stat = "Sum" }],
          [".", "TargetResponseTime", ".", ".", { stat = "p95", yAxis = "right" }]
        ]
        period = 300
      }
    }]
  })
}
