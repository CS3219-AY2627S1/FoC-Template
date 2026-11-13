locals {
  task_role_arns = {
    for service, role in aws_iam_role.task : service => "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:role/${role.name}"
  }

  publisher_permissions = {
    for name, arn in var.topic_arns : name => [
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = arn
      },
      {
        Effect    = "Allow"
        Action    = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource  = var.messaging_kms_key_arn
        Condition = { StringEquals = { "kms:ViaService" = "sns.${var.region}.${data.aws_partition.current.dns_suffix}" } }
      }
    ]
  }

  consumer_permissions = {
    for name, arn in var.queue_arns : name => [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:ChangeMessageVisibility",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl"
        ]
        Resource = arn
      },
      {
        Effect    = "Allow"
        Action    = ["kms:Decrypt"]
        Resource  = var.messaging_kms_key_arn
        Condition = { StringEquals = { "kms:ViaService" = "sqs.${var.region}.${data.aws_partition.current.dns_suffix}" } }
      }
    ]
  }

  messaging_permissions = {
    for name in setunion(toset(keys(var.topic_arns)), toset(keys(var.queue_arns))) : name => flatten([
      for permissions in [local.publisher_permissions, local.consumer_permissions] :
      permissions[name] if contains(keys(permissions), name)
    ])
  }

  ecs_trust = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-execution"
  assume_role_policy = local.ecs_trust
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "secrets" {
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters"]
      Resource = var.execution_parameter_arns
    }]
  })
}

resource "aws_iam_role" "task" {
  for_each           = toset(keys(var.services))
  name               = "${var.name_prefix}-${each.key}-task"
  assume_role_policy = local.ecs_trust
}

resource "aws_iam_role_policy_attachment" "images" {
  for_each   = var.image_bucket_policy_arns
  role       = aws_iam_role.task[each.key].name
  policy_arn = each.value
}

resource "aws_iam_role_policy" "messaging" {
  for_each = local.messaging_permissions
  role     = aws_iam_role.task[each.key].id

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = each.value
  })
}

resource "aws_iam_role" "host" {
  name = "${var.name_prefix}-core-host"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "host_ecs" {
  role       = aws_iam_role.host.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "host_ssm" {
  role       = aws_iam_role.host.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "core_bootstrap" {
  role = aws_iam_role.host.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = ["${local.parameter_arn}-jwt-*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.configuration.arn}/tls.tar.gz"
      },
      {
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = aws_s3_bucket.configuration.arn
        Condition = { StringEquals = { "s3:prefix" = "tls.tar.gz" } }
      },
      {
        Effect = "Allow"
        Action = ["ec2:AssociateAddress"]
        Resource = [
          local.eip_arn,
          "arn:${data.aws_partition.current.partition}:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/*"
        ]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "host" {
  name = "${var.name_prefix}-core"
  role = aws_iam_role.host.name
}

resource "aws_iam_role" "bootstrap_execution" {
  name               = "${var.name_prefix}-bootstrap-execution"
  assume_role_policy = local.ecs_trust
}

resource "aws_iam_role_policy_attachment" "bootstrap_execution" {
  role       = aws_iam_role.bootstrap_execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "bootstrap_secrets" {
  role = aws_iam_role.bootstrap_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.database_master_secret_arn
      },
      {
        Effect = "Allow"
        Action = ["ssm:GetParameters"]
        Resource = concat(
          [for service in keys(local.database_services) : "${local.parameter_arn}-database-${service}"],
          ["${local.parameter_arn}-initial-admin-email", "${local.parameter_arn}-initial-admin-password"]
        )
      }
    ]
  })
}

resource "aws_iam_role" "grafana_cloudwatch" {
  count = nonsensitive(var.grafana_cloudwatch_reader == null) ? 0 : 1
  name  = "${var.name_prefix}-grafana-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${var.grafana_cloudwatch_reader.account_id}:root" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "sts:ExternalId" = var.grafana_cloudwatch_reader.external_id } }
    }]
  })
}

resource "aws_iam_role_policy" "grafana_cloudwatch" {
  count = length(aws_iam_role.grafana_cloudwatch)
  role  = aws_iam_role.grafana_cloudwatch[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadCloudWatchMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:GetMetricData", "cloudwatch:GetMetricStatistics", "cloudwatch:ListMetrics"]
        Resource = "*"
      },
      {
        Sid      = "DescribeLogGroupsAndStopQueries"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups", "logs:StopQuery"]
        Resource = "*"
      },
      {
        Sid    = "ReadApplicationLogs"
        Effect = "Allow"
        Action = ["logs:DescribeLogStreams", "logs:GetQueryResults", "logs:FilterLogEvents", "logs:GetLogEvents", "logs:StartQuery", "logs:GetLogGroupFields"]
        Resource = [
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.name_prefix}/*",
          "arn:${data.aws_partition.current.partition}:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.name_prefix}/*:log-stream:*"
        ]
      }
    ]
  })
}
