# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# EKS: the Kubernetes control plane (run by AWS) plus a group of worker nodes (EC2 instances) in the
# private subnets.
#
#   aws_eks_cluster      control plane: API server, etcd, scheduler. AWS runs it across AZs. ~USD 0.10/hour.
#   aws_eks_node_group   EC2 instances that run the pods. AWS handles creating, updating and draining them.
#   aws_eks_addon        AWS-managed cluster components: networking, DNS, disks, metrics.
#
# Like vpc.tf, this uses plain resources so each piece is visible. The terraform-aws-modules/eks
# module wraps the same resources.
#
# Pods get AWS permissions through IRSA (IAM Roles for Service Accounts): see irsa.tf.
# The newer EKS Pod Identity is blocked in this account: the NUS sandbox's organization-wide
# policy (SCP) explicitly denies eks-auth:AssumeRoleForPodIdentity.

# --- Shared IAM trust policies ---------------------------------------------------------------------
# A "trust policy" says WHO may use a role; the attached policies say WHAT the role can do.

data "aws_iam_policy_document" "eks_cluster_assume" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"] # the EKS control plane
    }
  }
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"] # the worker node instances
    }
  }
}

# --- Control plane ---------------------------------------------------------------------------------
resource "aws_iam_role" "eks_cluster" {
  name               = "${local.cluster_name}-eks-cluster"
  assume_role_policy = data.aws_iam_policy_document.eks_cluster_assume.json
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# EKS writes control plane logs here. Creating the group ourselves sets a retention period;
# otherwise EKS creates it with "never expire" and the logs cost money forever.
resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${local.cluster_name}/cluster"
  retention_in_days = 7
}

resource "aws_eks_cluster" "main" {
  name     = local.cluster_name
  version  = var.kubernetes_version
  role_arn = aws_iam_role.eks_cluster.arn

  vpc_config {
    # The control plane places its network interfaces here, so it can reach the nodes
    subnet_ids = aws_subnet.private[*].id

    # Nodes talk to the API server inside the VPC; you (kubectl on your laptop) use the public
    # endpoint. Public access still requires AWS credentials. Narrow the CIDRs to lock it down further.
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.cluster_public_access_cidrs
  }

  access_config {
    # Who may use kubectl is managed through EKS "access entries" (an AWS API), not the old
    # aws-auth ConfigMap inside the cluster
    authentication_mode = "API"

    # Whoever creates the cluster (your SSO role) becomes cluster admin. Teammates signing in
    # with the same SSO role get the same access; other roles go in var.cluster_admin_role_arns.
    bootstrap_cluster_creator_admin_permissions = true
  }

  # Don't let EKS install unmanaged default copies of vpc-cni, coredns and kube-proxy; they are
  # installed below as managed add-ons instead, so Terraform controls their versions and settings
  bootstrap_self_managed_addons = false

  enabled_cluster_log_types = var.cluster_log_types

  upgrade_policy {
    # When a Kubernetes version leaves standard support, EKS charges "extended support" at
    # ~USD 0.60/hour (6x). STANDARD makes EKS upgrade the cluster instead of charging that.
    support_type = "STANDARD"
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster,
    aws_cloudwatch_log_group.eks,
  ]
}

# Extra admins (e.g. a teammate's different SSO role, or a CI role later)
resource "aws_eks_access_entry" "admins" {
  for_each = toset(var.cluster_admin_role_arns)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
}

resource "aws_eks_access_policy_association" "admins" {
  for_each = toset(var.cluster_admin_role_arns)

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = each.value
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.admins]
}

# --- Add-ons ---------------------------------------------------------------------------------------
locals {
  # Node-level components (DaemonSets). Installed BEFORE the nodes, because a node can't become
  # Ready without pod networking (vpc-cni) and service routing (kube-proxy).
  addons_before_nodes = {
    "vpc-cni" = jsonencode({
      enableNetworkPolicy = "true" # enforce the NetworkPolicies in k8s/ (otherwise silently ignored)
    })
    "kube-proxy" = null
    # (no eks-pod-identity-agent: Pod Identity is blocked in this account, so it would do nothing)
  }

  # Components that run as ordinary pods (Deployments), so they need nodes to exist first.
  # Installing them earlier makes Terraform wait until it times out.
  addons_after_nodes = {
    coredns          = null # cluster DNS: "user-service" -> pod IPs
    "metrics-server" = null # CPU/memory numbers for `kubectl top` and the HPAs
  }
}

# Look up the newest add-on version that works with this Kubernetes version
data "aws_eks_addon_version" "this" {
  for_each = merge(local.addons_before_nodes, local.addons_after_nodes, { "aws-ebs-csi-driver" = null })

  addon_name         = each.key
  kubernetes_version = aws_eks_cluster.main.version
  most_recent        = true
}

resource "aws_eks_addon" "before_nodes" {
  for_each = local.addons_before_nodes

  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = each.key
  addon_version               = data.aws_eks_addon_version.this[each.key].version
  configuration_values        = each.value
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "after_nodes" {
  for_each = local.addons_after_nodes

  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = each.key
  addon_version               = data.aws_eks_addon_version.this[each.key].version
  configuration_values        = each.value
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]
}

# EBS CSI driver: creates the EBS disks for Kafka's PersistentVolumeClaims. Its controller calls the
# EC2 API, so it gets its own IAM role (IRSA, see irsa.tf).
resource "aws_iam_role" "ebs_csi" {
  name               = "${local.cluster_name}-ebs-csi"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume["ebs_csi"].json
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "aws-ebs-csi-driver"
  addon_version               = data.aws_eks_addon_version.this["aws-ebs-csi-driver"].version
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  # EKS adds the IRSA annotation (eks.amazonaws.com/role-arn) to the driver's ServiceAccount
  service_account_role_arn = aws_iam_role.ebs_csi.arn

  depends_on = [
    aws_eks_node_group.main,
    aws_iam_role_policy_attachment.ebs_csi,
  ]
}

# --- Worker nodes ----------------------------------------------------------------------------------
resource "aws_iam_role" "eks_node" {
  name               = "${local.cluster_name}-eks-node"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "eks_node" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",          # join the cluster
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",               # vpc-cni: give pods VPC IP addresses
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly", # pull images from ECR
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",       # shell into a node via SSM (no SSH keys)
  ])

  role       = aws_iam_role.eks_node.name
  policy_arn = each.value
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "default"
  node_role_arn   = aws_iam_role.eks_node.arn
  subnet_ids      = aws_subnet.private[*].id # both AZs; AWS spreads the nodes across them

  ami_type       = "AL2023_x86_64_STANDARD" # Amazon Linux 2023, EKS-optimized
  capacity_type  = var.node_capacity_type
  instance_types = var.node_instance_types
  disk_size      = 30 # GiB per node, for container images

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  update_config {
    max_unavailable = 1 # during node upgrades, replace one node at a time (PodDisruptionBudgets apply)
  }

  labels = {
    "campuscouriers/node-group" = "default"
  }

  lifecycle {
    # A node autoscaler (later step) changes the node count; don't let the next apply undo that
    ignore_changes = [scaling_config[0].desired_size]
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_node,
    aws_eks_addon.before_nodes,
  ]
}
