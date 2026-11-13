resource "aws_mq_broker" "demo" {
  count                      = var.deploy_runtime ? 1 : 0
  broker_name                = "${var.project_name}-rabbitmq"
  engine_type                = "RabbitMQ"
  engine_version             = var.mq_engine_version
  host_instance_type         = var.mq_instance_type
  deployment_mode            = "SINGLE_INSTANCE"
  publicly_accessible        = false
  subnet_ids                 = [aws_subnet.public[0].id]
  security_groups            = [aws_security_group.mq[0].id]
  auto_minor_version_upgrade = true
  apply_immediately          = true

  # Provider 6.71.0 has no write-only password field. This persists in state.
  # RabbitMQ users cannot be updated through this resource after creation.
  user {
    username = var.mq_username
    password = var.mq_password
  }

  # MQ-created log groups otherwise default to indefinite retention and survive
  # broker deletion. Keep this disposable demo to managed ECS application logs.
  logs {
    general = false
  }

  encryption_options {
    use_aws_owned_key = true
  }
}
