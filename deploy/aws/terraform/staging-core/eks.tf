data "aws_iam_policy_document" "eks_cluster_assume" {
  statement {
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_cluster" {
  name               = "${local.name_prefix}-eks-cluster"
  assume_role_policy = data.aws_iam_policy_document.eks_cluster_assume.json
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_role_policy_attachment" "eks_compute" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSComputePolicy"
}

resource "aws_iam_role_policy_attachment" "eks_block_storage" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSBlockStoragePolicyV2"
}

resource "aws_iam_role_policy_attachment" "eks_load_balancing" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSLoadBalancingPolicy"
}

resource "aws_iam_role_policy_attachment" "eks_networking" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSNetworkingPolicy"
}

data "aws_iam_policy_document" "eks_node_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_node" {
  name               = "${local.name_prefix}-eks-node"
  assume_role_policy = data.aws_iam_policy_document.eks_node_assume.json
}

resource "aws_iam_role_policy_attachment" "eks_node_minimal" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodeMinimalPolicy"
}

resource "aws_iam_role_policy_attachment" "eks_node_ecr" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
}

resource "aws_eks_cluster" "main" {
  name     = local.name_prefix
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.eks_version

  bootstrap_self_managed_addons = false
  enabled_cluster_log_types     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  compute_config {
    enabled       = true
    node_pools    = ["general-purpose", "system"]
    node_role_arn = aws_iam_role.eks_node.arn
  }

  kubernetes_network_config {
    elastic_load_balancing {
      enabled = true
    }
  }

  storage_config {
    block_storage {
      enabled = true
    }
  }

  vpc_config {
    endpoint_private_access = true
    endpoint_public_access  = true
    # An EKS cluster may switch subnets only within the AZ set selected at creation. Keep the
    # original two-AZ control-plane placement while MSK uses all three application subnets.
    subnet_ids = [for az in local.eks_azs : aws_subnet.application[az].id]
  }

  depends_on = [
    aws_cloudwatch_log_group.eks_control_plane,
    aws_iam_role_policy_attachment.eks_cluster,
    aws_iam_role_policy_attachment.eks_compute,
    aws_iam_role_policy_attachment.eks_block_storage,
    aws_iam_role_policy_attachment.eks_load_balancing,
    aws_iam_role_policy_attachment.eks_networking,
    aws_iam_role_policy_attachment.eks_node_minimal,
    aws_iam_role_policy_attachment.eks_node_ecr
  ]
}

# The GitHub infrastructure role creates this cluster. EKS therefore grants it the cluster-admin
# bootstrap access entry automatically; declaring the same entry here causes a 409 duplicate.

resource "aws_eks_access_entry" "deploy" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.github_deploy_role_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "deploy" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.github_deploy_role_arn
  # The deployment workflow installs External Secrets CRDs and the shared encrypted
  # StorageClass before applying namespaced workloads. GitHub Environment approval and
  # the OIDC subject restriction are therefore the outer guard for this cluster-scoped role.
  policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope { type = "cluster" }
  depends_on = [aws_eks_access_entry.deploy]
}

# Human operators keep the AWS-managed EKS View policy as their normal access boundary. This
# optional group mapping adds only the Kubernetes subresource permission that View deliberately
# omits, allowing Kafbat to remain private behind a local port-forward instead of a public route.
resource "aws_eks_access_entry" "kafbat_viewer" {
  count = var.kafbat_viewer_role_arn == "" ? 0 : 1

  cluster_name      = aws_eks_cluster.main.name
  principal_arn     = var.kafbat_viewer_role_arn
  kubernetes_groups = ["foc-kafka-viewers"]
  type              = "STANDARD"
}

# Terraform creates this namespace before the runtime workflow applies workloads. Existing staging
# environments adopt it in the infrastructure workflow so this remains safe for both first-time and
# already-running environments.
resource "kubernetes_namespace_v1" "runtime" {
  metadata {
    name = "foc-staging"

    labels = {
      "app.kubernetes.io/part-of"    = "friend-on-campus"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  depends_on = [aws_eks_cluster.main]
}

resource "kubernetes_role_v1" "kafbat_port_forward" {
  metadata {
    name      = "kafbat-port-forward"
    namespace = kubernetes_namespace_v1.runtime.metadata[0].name
  }

  rule {
    api_groups = [""]
    resources  = ["pods"]
    verbs      = ["get", "list"]
  }

  # Deployment pod names change on rollout, so Kubernetes cannot restrict this subresource to a
  # stable kafka-ui resourceName. The role remains namespace-scoped and grants no exec or mutation.
  rule {
    api_groups = [""]
    resources  = ["pods/portforward"]
    verbs      = ["create"]
  }

  rule {
    api_groups     = [""]
    resources      = ["services"]
    resource_names = ["kafka-ui"]
    verbs          = ["get"]
  }
}

resource "kubernetes_role_binding_v1" "kafbat_port_forward" {
  metadata {
    name      = "kafbat-port-forward"
    namespace = kubernetes_namespace_v1.runtime.metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.kafbat_port_forward.metadata[0].name
  }

  subject {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Group"
    name      = "foc-kafka-viewers"
  }
}

# EKS Auto Mode provisions nodes in response to ordinary workload pods. A newly created cluster's
# managed add-on pods can otherwise remain pending without triggering the first node, which makes
# Terraform wait until its add-on timeout. This tiny, inert workload establishes initial capacity
# before Terraform waits for Metrics Server and CloudWatch Observability.
resource "kubernetes_namespace_v1" "capacity_bootstrap" {
  metadata {
    name = "foc-capacity-bootstrap"
  }

  depends_on = [aws_eks_cluster.main]
}

resource "kubernetes_deployment_v1" "capacity_bootstrap" {
  metadata {
    name      = "capacity-bootstrap"
    namespace = kubernetes_namespace_v1.capacity_bootstrap.metadata[0].name
    labels    = { app = "capacity-bootstrap" }
  }

  spec {
    replicas                  = 1
    progress_deadline_seconds = 1200

    selector {
      match_labels = { app = "capacity-bootstrap" }
    }

    template {
      metadata {
        labels = { app = "capacity-bootstrap" }
      }

      spec {
        node_selector = {
          "eks.amazonaws.com/compute-type" = "auto"
        }

        container {
          name  = "pause"
          image = "registry.k8s.io/pause:3.10.1"

          resources {
            requests = {
              cpu    = "5m"
              memory = "8Mi"
            }
            limits = {
              cpu    = "10m"
              memory = "16Mi"
            }
          }
        }
      }
    }
  }

  wait_for_rollout = true

  timeouts {
    create = "20m"
  }
}

resource "aws_eks_addon" "metrics_server" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "metrics-server"

  depends_on = [kubernetes_deployment_v1.capacity_bootstrap]
}

resource "aws_iam_openid_connect_provider" "eks" {
  url            = local.eks_oidc_issuer
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "cloudwatch_irsa_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.eks_oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.eks_oidc_provider}:sub"
      values   = ["system:serviceaccount:amazon-cloudwatch:cloudwatch-agent"]
    }
  }
}

resource "aws_iam_role" "cloudwatch" {
  name               = "${local.name_prefix}-cloudwatch-observability"
  assume_role_policy = data.aws_iam_policy_document.cloudwatch_irsa_assume.json
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_eks_addon" "cloudwatch" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "amazon-cloudwatch-observability"
  service_account_role_arn = aws_iam_role.cloudwatch.arn
  configuration_values = jsonencode({
    applicationSignals = { enabled = false }
  })

  depends_on = [
    aws_iam_role_policy_attachment.cloudwatch_agent,
    kubernetes_deployment_v1.capacity_bootstrap
  ]
}

data "aws_iam_policy_document" "external_secrets_irsa_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.eks_oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.eks_oidc_provider}:sub"
      values   = ["system:serviceaccount:external-secrets:external-secrets"]
    }
  }
}

resource "aws_iam_role" "external_secrets" {
  name               = "${local.name_prefix}-external-secrets"
  assume_role_policy = data.aws_iam_policy_document.external_secrets_irsa_assume.json
}

data "aws_iam_policy_document" "external_secrets" {
  statement {
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:foc/${var.environment}/*",
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:rds!db-*"
    ]
  }
}

resource "aws_iam_role_policy" "external_secrets" {
  name   = "read-runtime-secrets"
  role   = aws_iam_role.external_secrets.id
  policy = data.aws_iam_policy_document.external_secrets.json
}
