# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/nonprod/bootstrap), drafted and edited with Claude Code.
# Reviewed by Don Lee

# The cluster comes from ../aws (separate state, ADR-0002): apply that first.
data "terraform_remote_state" "aws" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "nonprod/aws/terraform.tfstate"
    region = var.region
  }
}

provider "aws" {
  region = var.region
}

# A short-lived token for whoever runs Terraform (an EKS access entry admin).
data "aws_eks_cluster_auth" "this" {
  name = data.terraform_remote_state.aws.outputs.cluster_name
}

provider "helm" {
  kubernetes = {
    host                   = data.terraform_remote_state.aws.outputs.cluster_endpoint
    cluster_ca_certificate = base64decode(data.terraform_remote_state.aws.outputs.cluster_ca_data)
    token                  = data.aws_eks_cluster_auth.this.token
  }
}
