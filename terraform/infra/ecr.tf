# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-09 to 2026-11-10
# Scope (AI-26): Generated Terraform, Kubernetes manifests and scripts for the AWS resources I specified.
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

# ECR: private container registries, one repository per service.
#
#   scripts/build-and-push.ps1 ──docker push──> 596601390706.dkr.ecr.ap-southeast-1.amazonaws.com/campuscouriers/user-service:<git sha>
#                                                        │
#   EKS nodes pull from here (node role: AmazonEC2ContainerRegistryPullOnly), image layers via the S3 endpoint
#
# Images are tagged with the git commit they were built from, and tags are IMMUTABLE: a tag can never
# be overwritten, so "user-service:3f2a91c" always means exactly the same image. That makes every
# deploy traceable and every rollback exact (unlike "latest", which changes under you).

locals {
  ecr_services = ["user-service", "supplier-service", "credit-service", "order-service", "notification-service", "chat-service", "ai-errand-assistant-service", "rag-service"]
}

resource "aws_ecr_repository" "service" {
  for_each = toset(local.ecr_services)

  name                 = "${var.project}/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true # free basic scan for known vulnerabilities (CVEs) in OS packages
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  # Allow `terraform destroy` to delete a repository that still holds images. Fine while every image
  # can be rebuilt from git; remove it once the registry is the only copy of something you need.
  force_delete = true
}

# Housekeeping, so storage (USD 0.10/GB-month) doesn't grow forever
resource "aws_ecr_lifecycle_policy" "service" {
  for_each = aws_ecr_repository.service

  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Delete untagged images (leftovers from interrupted pushes) after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the 15 most recent images (older ones can be rebuilt from git)"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 15
        }
        action = { type = "expire" }
      },
    ]
  })
}
