locals {
  ecs_assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow", Action = "sts:AssumeRole"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role" "execution" {
  for_each           = local.runtime_services
  name               = "${var.project_name}-${each.key}-execution"
  assume_role_policy = local.ecs_assume_role_policy
}

resource "aws_iam_role_policy" "execution" {
  for_each = local.runtime_services
  name     = "image-logs-secrets"
  role     = aws_iam_role.execution[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = aws_ecr_repository.service[each.key].arn
      },
      {
        Effect   = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.service[each.key].arn}:*"
      }
      ], contains(local.backend_names, each.key) ? [{
        Effect   = "Allow", Action = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.service[each.key].arn
    }] : [])
  })
}

# The application does not call AWS APIs. Do not reuse the execution role.
resource "aws_iam_role" "task" {
  count              = var.deploy_runtime ? 1 : 0
  name               = "${var.project_name}-task"
  assume_role_policy = local.ecs_assume_role_policy
}
