{{- /*
AI Assistance Disclosure
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-19
Scope: Helm chart linkerd-identity, drafted and edited with Claude Code.
Reviewed by Don Lee
*/ -}}
{{- define "linkerd-identity.labels" -}}
app.kubernetes.io/part-of: foc
app.kubernetes.io/component: linkerd-identity
{{- end }}
