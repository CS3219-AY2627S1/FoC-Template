# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-11-07
# Scope: Terraform configuration (infra/nonprod/aws), drafted and edited with Claude Code.
# Reviewed by Don Lee

# One Postgres instance for dev and stg (ADR-0010). Each env's services get a
# database and login <env>_<service>, created by deploy/charts/foc-database.
# RDS keeps the admin password in Secrets Manager (manage_master_user_password);
# External Secrets hands it to the setup Job as Secret foc-db-admin.
resource "aws_db_subnet_group" "this" {
  name       = var.cluster_name
  subnet_ids = [for s in aws_subnet.private : s.id]
}

resource "aws_security_group" "rds" {
  name   = "${var.cluster_name}-rds"
  vpc_id = aws_vpc.this.id

  ingress {
    # By subnet, not by the cluster's security group, so the cluster can be
    # removed (var.eks_enabled) without taking RDS with it. Only nodes, pods
    # and the internal NLB live in the private subnets.
    description = "Postgres from the private subnets (nodes and pods)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [for s in aws_subnet.private : s.cidr_block]
  }
}

resource "aws_db_instance" "foc" {
  identifier        = var.cluster_name
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.rds_instance_class
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  username                    = "foc_admin"
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  # Postgres 16 on RDS defaults to rds.force_ssl = 1: every client must use TLS.

  backup_retention_period = 1
  skip_final_snapshot     = true # non-prod data is disposable
  apply_immediately       = true
}
