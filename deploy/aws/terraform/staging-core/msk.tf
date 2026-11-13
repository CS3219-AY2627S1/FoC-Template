resource "aws_kms_key" "msk_scram" {
  description             = "Encrypt Friend on Campus MSK SCRAM credentials"
  enable_key_rotation     = true
  deletion_window_in_days = 7
}

resource "aws_kms_alias" "msk_scram" {
  name          = "alias/${local.name_prefix}-msk-scram"
  target_key_id = aws_kms_key.msk_scram.key_id
}

resource "aws_cloudwatch_log_group" "msk_broker" {
  name              = "/aws/msk/${local.name_prefix}/broker"
  retention_in_days = 7
}

resource "aws_security_group" "msk" {
  name        = "${local.name_prefix}-msk"
  description = "Private SASL SCRAM access to Amazon MSK from EKS application subnets"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Encrypted SASL SCRAM from private EKS application subnets"
    protocol    = "tcp"
    from_port   = 9096
    to_port     = 9096
    cidr_blocks = [for subnet in aws_subnet.application : subnet.cidr_block]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-msk" }
}

# The cluster starts in bootstrap mode so the authenticated administrator can create the explicit
# topics and ACLs. Runtime provisioning then moves the cluster to the locked configuration below.
# Terraform ignores that deliberate revision switch so a later core apply cannot reopen access.
resource "aws_msk_configuration" "bootstrap" {
  name           = "${local.name_prefix}-bootstrap"
  kafka_versions = [var.msk_kafka_version]

  server_properties = <<-PROPERTIES
    allow.everyone.if.no.acl.found=true
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=3
    transaction.state.log.min.isr=2
    transaction.state.log.replication.factor=3
    unclean.leader.election.enable=false
  PROPERTIES
}

resource "aws_msk_configuration" "locked" {
  name           = "${local.name_prefix}-locked"
  kafka_versions = [var.msk_kafka_version]

  server_properties = <<-PROPERTIES
    allow.everyone.if.no.acl.found=false
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=3
    transaction.state.log.min.isr=2
    transaction.state.log.replication.factor=3
    unclean.leader.election.enable=false
  PROPERTIES
}

resource "aws_msk_cluster" "main" {
  cluster_name           = local.name_prefix
  kafka_version          = var.msk_kafka_version
  number_of_broker_nodes = 3
  enhanced_monitoring    = "PER_BROKER"

  broker_node_group_info {
    instance_type   = var.msk_broker_instance_type
    client_subnets  = values(aws_subnet.application)[*].id
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.msk_broker_storage_gib
      }
    }
  }

  client_authentication {
    sasl {
      scram = true
    }
    unauthenticated = false
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.bootstrap.arn
    revision = aws_msk_configuration.bootstrap.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk_broker.name
      }
    }
  }

  lifecycle {
    # deploy/aws/scripts/prepare-msk.sh switches to the locked revision after ACL initialization.
    ignore_changes = [configuration_info]
  }

  timeouts {
    create = "90m"
    update = "90m"
    delete = "90m"
  }
}

# Only secret containers are Terraform-managed. configure-secrets.sh copies the existing service
# passwords into MSK's required {username,password} format without exposing values to Terraform.
resource "aws_secretsmanager_secret" "msk_scram" {
  for_each = local.msk_scram_users

  name                    = "AmazonMSK_${local.name_prefix}_${each.key}"
  description             = "SCRAM credentials for ${each.key} on ${local.name_prefix}"
  kms_key_id              = aws_kms_key.msk_scram.arn
  recovery_window_in_days = 0
}

# SCRAM secret versions are populated after this stack exists, so their association is performed
# idempotently by prepare-msk.sh before any client is deployed. BatchAssociateScramSecret owns the
# cluster-specific resource policy AWS attaches to each secret; Terraform must not overwrite it.
# This keeps secret values out of Terraform state while retaining declarative ownership of the
# cluster, KMS key and secret containers.
resource "aws_ssm_parameter" "msk_cluster_arn" {
  name  = "/foc/${var.environment}/msk-cluster-arn"
  type  = "String"
  value = aws_msk_cluster.main.arn
}

resource "aws_ssm_parameter" "msk_bootstrap_brokers" {
  name  = "/foc/${var.environment}/msk-bootstrap-brokers"
  type  = "String"
  value = aws_msk_cluster.main.bootstrap_brokers_sasl_scram
}

resource "aws_ssm_parameter" "msk_scram_secret_arns" {
  name  = "/foc/${var.environment}/msk-scram-secret-arns"
  type  = "String"
  value = jsonencode([for secret in aws_secretsmanager_secret.msk_scram : secret.arn])
}

resource "aws_ssm_parameter" "msk_locked_configuration_arn" {
  name  = "/foc/${var.environment}/msk-locked-configuration-arn"
  type  = "String"
  value = aws_msk_configuration.locked.arn
}

resource "aws_ssm_parameter" "msk_locked_configuration_revision" {
  name  = "/foc/${var.environment}/msk-locked-configuration-revision"
  type  = "String"
  value = tostring(aws_msk_configuration.locked.latest_revision)
}

resource "aws_ssm_parameter" "msk_runtime_ready" {
  name  = "/foc/${var.environment}/msk-runtime-ready"
  type  = "String"
  value = "false"

  # Successful runtime provisioning changes this to true only after topics, ACLs and the locked
  # broker configuration are verified. Core reconciliation must not reset that activation flag.
  lifecycle {
    ignore_changes = [value]
  }
}
