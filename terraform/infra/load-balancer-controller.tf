# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# AWS Load Balancer Controller: watches Kubernetes Ingress objects (k8s/app/ingress.yaml) and creates
# and updates a matching Application Load Balancer, its listeners, rules and target groups.
#
#   Ingress applied ──> controller (pods in kube-system) ──> AWS API: create ALB in the public subnets
#                                                            (found through the kubernetes.io/role/elb tag)
#
# Destroying: delete the Ingress (kubectl delete -k k8s) BEFORE `terraform destroy`. The controller
# deletes the ALB only while it is running; an ALB left behind blocks deleting the VPC.

resource "aws_iam_policy" "aws_load_balancer_controller" {
  name        = "${local.cluster_name}-aws-load-balancer-controller"
  description = "Official policy for AWS Load Balancer Controller v3.6.2"
  # Downloaded unchanged from
  # https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.6.2/docs/install/iam_policy.json
  # Re-download it when upgrading the chart below.
  policy = file("${path.module}/policies/aws-load-balancer-controller.json")
}

resource "aws_iam_role" "aws_load_balancer_controller" {
  name               = "${local.cluster_name}-aws-load-balancer-controller"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume["aws_load_balancer_controller"].json
}

resource "aws_iam_role_policy_attachment" "aws_load_balancer_controller" {
  role       = aws_iam_role.aws_load_balancer_controller.name
  policy_arn = aws_iam_policy.aws_load_balancer_controller.arn
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = "3.6.2" # chart version = controller version since v3
  namespace  = "kube-system"

  values = [yamlencode({
    clusterName = aws_eks_cluster.main.name
    # Given explicitly so the controller doesn't have to look them up from the node's metadata
    region = var.aws_region
    vpcId  = aws_vpc.main.id

    replicaCount = 2 # one per AZ; one leader at a time, the other takes over if it dies

    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.aws_load_balancer_controller.arn # IRSA
      }
    }

    # The NUS sandbox blocks AWS Shield and WAF Classic (waf-regional) entirely, and the controller
    # calls both by default. The current WAF API (wafv2) is allowed, so it stays on.
    enableShield = false
    enableWaf    = false
    enableWafv2  = true

    # Off: we only use Ingress. When on, it also takes over every Service of type LoadBalancer.
    enableServiceMutatorWebhook = false
  })]

  depends_on = [
    aws_eks_node_group.main,
    aws_iam_role_policy_attachment.aws_load_balancer_controller,
  ]
}
