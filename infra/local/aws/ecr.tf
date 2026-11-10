# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-01
# Scope: Terraform configuration (infra/local/aws), drafted and edited with Claude Code.
# Reviewed by Don Lee

resource "aws_ecr_repository" "service" {
  for_each = toset(var.services)

  name                 = "foc/${each.value}"
  image_tag_mutability = "MUTABLE" # re-push :dev freely on a laptop
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}

# Images that support local testing but are not FoC services.
resource "aws_ecr_repository" "tool" {
  for_each = toset(var.tools)

  name                 = "foc/${each.value}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }
}
