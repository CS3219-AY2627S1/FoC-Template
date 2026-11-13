locals {
  tags = { Project = "FoC", Environment = var.name_prefix }
}

resource "aws_db_subnet_group" "app" {
  name       = var.name_prefix
  subnet_ids = var.database_subnet_ids
}

resource "aws_db_instance" "postgres" {
  identifier                  = var.name_prefix
  engine                      = "postgres"
  engine_version              = "18"
  instance_class              = var.db_instance_class
  allocated_storage           = 20
  storage_type                = "gp3"
  storage_encrypted           = true
  db_name                     = "foc"
  username                    = "foc_admin"
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.app.name
  vpc_security_group_ids      = [var.database_security_group_id]
  publicly_accessible         = false
  # Single-AZ is sufficient for the one-month presentation budget.
  multi_az                   = false
  backup_retention_period    = 7
  auto_minor_version_upgrade = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.name_prefix}-final"
  tags                       = local.tags
}
