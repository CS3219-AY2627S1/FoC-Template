# AI Assistance Disclosure
# Tool: Claude Code (Claude Opus 5.5), date: 2026-10-22
# Scope: Terraform configuration (infra/nonprod/bootstrap), drafted and edited with Claude Code.
# Reviewed by Don Lee

output "argocd_namespace" {
  value = module.argocd.namespace
}

output "login" {
  description = "How to open the Argo CD UI."
  value       = "kubectl -n argocd port-forward svc/argocd-server 8081:80 & kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
}
