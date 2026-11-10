# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-01
# Scope: Terraform configuration (infra/modules/argocd), drafted and edited with Claude Code.
# Reviewed by Don Lee

output "namespace" {
  description = "Namespace Argo CD runs in."
  value       = helm_release.argocd.namespace
}

output "app_version" {
  description = "Argo CD version installed by the chart."
  value       = helm_release.argocd.metadata.app_version
}

output "root_app_source" {
  description = "Repo, revision and path the root Application syncs, or null."
  value       = var.root_app == null ? null : "${var.root_app.repo_url}@${var.root_app.revision}:${var.root_app.path}"
}
