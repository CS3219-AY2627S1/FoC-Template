{{- /*
AI Assistance Disclosure
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-19
Scope: Helm chart foc-gateway, drafted and edited with Claude Code.
Reviewed by Don Lee
*/ -}}
{{- define "foc-gateway.envoyServiceName" -}}
{{- .Values.envoyServiceName | default (printf "envoy-%s" .Release.Namespace) -}}
{{- end }}

{{- define "foc-gateway.envoyServiceAccountName" -}}
{{- .Values.envoyServiceAccountName | default (printf "envoy-%s" .Release.Namespace) -}}
{{- end }}
