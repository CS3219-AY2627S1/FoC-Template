data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  parameter_arn = "arn:${data.aws_partition.current.partition}:ssm:${local.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.name_prefix}"
  java_environment = {
    SPRING_PROFILES_ACTIVE                  = "prod"
    JAVA_TOOL_OPTIONS                       = "-XX:InitialRAMPercentage=20 -XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"
    MANAGEMENT_OTLP_METRICS_EXPORT_ENABLED  = "true"
    MANAGEMENT_OTLP_METRICS_EXPORT_STEP     = "1m"
    MANAGEMENT_TRACING_SAMPLING_PROBABILITY = "1.0"
    FOC_JWKS_URI                            = "https://${var.domain_name}/api/.well-known/jwks.json"
    FOC_FRONTEND_URL                        = "https://${var.domain_name}"
  }
  java_secrets = {
    MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT              = "${local.parameter_arn}-grafana-otlp-traces-url"
    MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_HEADERS_AUTHORIZATION = "${local.parameter_arn}-grafana-otlp-authorization"
    MANAGEMENT_OTLP_METRICS_EXPORT_URL                                 = "${local.parameter_arn}-grafana-otlp-url"
    MANAGEMENT_OTLP_METRICS_EXPORT_HEADERS_AUTHORIZATION               = "${local.parameter_arn}-grafana-otlp-authorization"
  }
  java_task = { cpu = 256, memory = 512, health_path = "/api/actuator/health" }

  service_definitions = {
    user = merge(local.java_task, {
      port     = 8080
      database = "foc_user"
      username = "foc_user"
      environment = merge(local.java_environment, {
        OTEL_SERVICE_NAME          = "user"
        FOC_USER_BUCKET            = var.image_bucket_names.user
        MAIL_FROM                  = var.mail_from
        EVENTS_MESSAGING_TOPIC_ARN = module.messaging.topic_arns["user"]
      })
      secrets = merge(local.java_secrets, {
        MAIL_USERNAME = "${local.parameter_arn}-mail-username"
        MAIL_PASSWORD = "${local.parameter_arn}-mail-password"
      })
      volumes = { jwt = { host_path = "/var/lib/runtime/jwt", container_path = "/run/secrets" } }
    })
    supplier = merge(local.java_task, {
      port     = 8081
      database = "foc_supplier"
      username = "foc_supplier"
      environment = merge(local.java_environment, {
        OTEL_SERVICE_NAME          = "supplier"
        FOC_SUPPLIER_BUCKET        = var.image_bucket_names.supplier
        EVENTS_MESSAGING_TOPIC_ARN = module.messaging.topic_arns["supplier"]
      })
      secrets = local.java_secrets
    })
    order = merge(local.java_task, {
      port     = 8082
      cpu      = 512
      database = "foc_order"
      username = "foc_order"
      environment = merge(local.java_environment, {
        OTEL_SERVICE_NAME           = "order"
        FOC_ORDER_BUCKET            = var.image_bucket_names.order
        FOC_ORDER_AI_ENABLED        = "true"
        FOC_CREDIT_SERVICE_URL      = "http://credit:8083/api"
        FOC_SUPPLIER_SERVICE_URL    = "http://supplier:8081/api"
        FOC_USER_SERVICE_URL        = "http://user:8080/api"
        EVENTS_MESSAGING_TOPIC_ARN  = module.messaging.topic_arns["order"]
        EVENTS_MESSAGING_QUEUE_NAME = module.messaging.queue_names["order"]
      })
      secrets = merge(local.java_secrets, { OPENAI_API_KEY = "${local.parameter_arn}-openai-api-key" })
    })
    credit = merge(local.java_task, {
      port     = 8083
      database = "foc_credit"
      username = "foc_credit"
      environment = merge(local.java_environment, {
        OTEL_SERVICE_NAME           = "credit"
        EVENTS_MESSAGING_TOPIC_ARN  = module.messaging.topic_arns["credit"]
        EVENTS_MESSAGING_QUEUE_NAME = module.messaging.queue_names["credit"]
      })
      secrets = local.java_secrets
    })
    realtime = {
      port        = 8084
      cpu         = 128
      memory      = 256
      health_path = "/health"
      environment = {
        NODE_ENV      = "production"
        JWKS_URL      = "https://${var.domain_name}/api/.well-known/jwks.json"
        SQS_QUEUE_URL = module.messaging.queue_urls["realtime"]
      }
      secrets = {}
    }
  }

  database_services = { for name, service in local.service_definitions : name => service if contains(keys(service), "database") }
  database_environment = {
    for name, service in local.database_services : name => {
      SPRING_DATASOURCE_URL      = "jdbc:postgresql://${module.rds.address}:5432/${service.database}?sslmode=verify-full&sslrootcert=/app/rds-ca.pem"
      SPRING_DATASOURCE_USERNAME = service.username
    }
  }
  services = {
    for name, service in local.service_definitions : name => merge(service, {
      environment = merge({ AWS_REGION = local.region }, service.environment, lookup(local.database_environment, name, {}))
      secrets = merge(service.secrets, contains(keys(local.database_services), name) ? {
        SPRING_DATASOURCE_PASSWORD = "${local.parameter_arn}-database-${name}"
      } : {})
    })
  }
}
