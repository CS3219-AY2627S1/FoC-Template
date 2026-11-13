resource "aws_db_subnet_group" "main" {
  name       = local.name_prefix
  subnet_ids = values(aws_subnet.database)[*].id
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds"
  description = "PostgreSQL from EKS workloads only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "PostgreSQL from private EKS application subnets"
    protocol    = "tcp"
    from_port   = 5432
    to_port     = 5432
    cidr_blocks = [for subnet in aws_subnet.application : subnet.cidr_block]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "${local.name_prefix}-postgres"

  engine                      = "postgres"
  engine_version              = "17"
  instance_class              = var.rds_instance_class
  allocated_storage           = 20
  max_allocated_storage       = 100
  storage_type                = "gp3"
  storage_encrypted           = true
  db_name                     = "postgres"
  username                    = "foc_master"
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 1
  copy_tags_to_snapshot   = true
  deletion_protection     = false
  skip_final_snapshot     = true
  apply_immediately       = true

  performance_insights_enabled = false
}

resource "aws_ecr_repository" "service" {
  for_each = local.services

  name                 = "foc-${each.value}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the newest twenty immutable staging images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_secretsmanager_secret" "runtime" {
  for_each = local.secret_names

  name                    = "foc/${var.environment}/${each.value}"
  recovery_window_in_days = 0
  description             = "Runtime values for ${each.value}; populated outside Terraform."
}

resource "aws_ssm_parameter" "rds_host" {
  name  = "/foc/${var.environment}/rds-host"
  type  = "String"
  value = aws_db_instance.postgres.address
}

resource "aws_ssm_parameter" "rds_master_secret_arn" {
  name  = "/foc/${var.environment}/rds-master-secret-arn"
  type  = "String"
  value = aws_db_instance.postgres.master_user_secret[0].secret_arn
}

resource "aws_ssm_parameter" "alb_security_group_id" {
  name  = "/foc/${var.environment}/alb-security-group-id"
  type  = "String"
  value = aws_security_group.gateway_alb.id
}

resource "aws_ssm_parameter" "external_secrets_role_arn" {
  name  = "/foc/${var.environment}/external-secrets-role-arn"
  type  = "String"
  value = aws_iam_role.external_secrets.arn
}

resource "aws_ssm_parameter" "chat_service_role_arn" {
  name  = "/foc/${var.environment}/chat-service-role-arn"
  type  = "String"
  value = aws_iam_role.chat_service.arn
}

resource "aws_ssm_parameter" "supplier_service_role_arn" {
  name  = "/foc/${var.environment}/supplier-service-role-arn"
  type  = "String"
  value = aws_iam_role.supplier_service.arn
}
