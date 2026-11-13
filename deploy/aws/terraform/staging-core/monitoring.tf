resource "aws_budgets_budget" "staging" {
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
}

resource "aws_cloudwatch_log_group" "eks_control_plane" {
  name              = "/aws/eks/${local.name_prefix}/cluster"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "container_insights" {
  for_each = toset(["application", "dataplane", "host", "performance"])

  name              = "/aws/containerinsights/${local.name_prefix}/${each.value}"
  retention_in_days = 7
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name_prefix}-rds-high-cpu"
  alarm_description   = "RDS CPU exceeded 80 percent for ten minutes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.name_prefix}-rds-low-storage"
  alarm_description   = "RDS has less than 2 GiB free storage."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 2147483648
  treat_missing_data  = "notBreaching"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
}

resource "aws_cloudwatch_metric_alarm" "service_pods_unavailable" {
  for_each = toset([
    "gateway",
    "user-service",
    "supplier-service",
    "order-service",
    "credit-service",
    "admin-service",
    "chat-service",
    "notification-service",
    "rabbitmq"
  ])

  alarm_name          = "${local.name_prefix}-${each.value}-unavailable"
  alarm_description   = "No running pod is reported for ${each.value}."
  namespace           = "ContainerInsights"
  metric_name         = "service_number_of_running_pods"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  dimensions = {
    ClusterName = aws_eks_cluster.main.name
    Namespace   = "foc-staging"
    Service     = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "msk_under_replicated_partitions" {
  alarm_name          = "${local.name_prefix}-msk-under-replicated-partitions"
  alarm_description   = "One or more MSK partitions have fewer in-sync replicas than expected."
  namespace           = "AWS/Kafka"
  metric_name         = "UnderReplicatedPartitions"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "breaching"
  dimensions          = { "Cluster Name" = aws_msk_cluster.main.cluster_name }
}

resource "aws_cloudwatch_metric_alarm" "msk_offline_partitions" {
  alarm_name          = "${local.name_prefix}-msk-offline-partitions"
  alarm_description   = "One or more MSK partitions have no active leader."
  namespace           = "AWS/Kafka"
  metric_name         = "OfflinePartitionsCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "breaching"
  dimensions          = { "Cluster Name" = aws_msk_cluster.main.cluster_name }
}

resource "aws_cloudwatch_dashboard" "staging" {
  dashboard_name = local.name_prefix
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6,
        properties = {
          title  = "RDS CPU and connections"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.postgres.identifier],
            [".", "DatabaseConnections", ".", ".", { yAxis = "right" }]
          ]
          period = 300
          stat   = "Average"
        }
      },
      {
        type = "log", x = 0, y = 6, width = 24, height = 8,
        properties = {
          title  = "Recent EKS application errors"
          region = var.aws_region
          query  = "SOURCE '/aws/containerinsights/${aws_eks_cluster.main.name}/application' | fields @timestamp, kubernetes.pod_name, log | filter log like /(?i)error|exception/ | sort @timestamp desc | limit 50"
          view   = "table"
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6,
        properties = {
          title  = "Application and RabbitMQ running pods"
          region = var.aws_region
          metrics = [
            for service in ["gateway", "user-service", "supplier-service", "order-service", "credit-service", "admin-service", "chat-service", "notification-service", "rabbitmq"] :
            ["ContainerInsights", "service_number_of_running_pods", "ClusterName", aws_eks_cluster.main.name, "Namespace", "foc-staging", "Service", service]
          ]
          period = 60
          stat   = "Minimum"
        }
      },
      {
        type = "metric", x = 0, y = 14, width = 24, height = 6,
        properties = {
          title  = "Amazon MSK replication health"
          region = var.aws_region
          metrics = [
            ["AWS/Kafka", "UnderReplicatedPartitions", "Cluster Name", aws_msk_cluster.main.cluster_name],
            [".", "OfflinePartitionsCount", ".", "."]
          ]
          period = 60
          stat   = "Maximum"
        }
      }
    ]
  })
}
