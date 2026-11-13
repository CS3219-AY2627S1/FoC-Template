data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "foc-${var.environment}"
  # MSK needs three distinct AZs. The existing EKS control plane was created with the first two
  # AZs and AWS does not permit expanding that set later, so keep its subnet selection stable.
  azs     = slice(data.aws_availability_zones.available.names, 0, 3)
  eks_azs = slice(data.aws_availability_zones.available.names, 0, 2)

  msk_scram_users = {
    foc_admin            = "KAFKA_ADMIN_PASSWORD"
    user_service         = "KAFKA_USER_SERVICE_PASSWORD"
    order_service        = "KAFKA_ORDER_SERVICE_PASSWORD"
    credit_service       = "KAFKA_CREDIT_SERVICE_PASSWORD"
    admin_service        = "KAFKA_ADMIN_SERVICE_PASSWORD"
    chat_service         = "KAFKA_CHAT_SERVICE_PASSWORD"
    notification_service = "KAFKA_NOTIFICATION_SERVICE_PASSWORD"
    kafka_ui             = "KAFKA_UI_BROKER_PASSWORD"
  }

  # EKS exposes an OpenID Connect issuer for IAM Roles for Service Accounts (IRSA).
  # The NUS AWS organization denies eks-auth:AssumeRoleForPodIdentity, so workloads
  # that need AWS APIs authenticate through this standard STS web-identity path.
  eks_oidc_issuer   = aws_eks_cluster.main.identity[0].oidc[0].issuer
  eks_oidc_provider = replace(local.eks_oidc_issuer, "https://", "")

  services = {
    gateway      = "gateway-service"
    user         = "user-service"
    supplier     = "supplier-service"
    order        = "order-service"
    credit       = "credit-service"
    admin        = "admin-service"
    chat         = "chat-service"
    notification = "notification-service"
  }

  secret_names = toset([
    "user-service-secrets",
    "user-mail-secrets",
    "supplier-service-secrets",
    "order-service-secrets",
    "credit-service-secrets",
    "admin-service-secrets",
    "chat-service-secrets",
    "notification-service-secrets",
    "kafka-broker-secrets",
    "kafka-ui-secrets"
  ])

  tags = {
    Project     = "friend-on-campus"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "shared-team-infrastructure"
  }
}
