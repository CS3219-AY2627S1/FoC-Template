{{- /*
AI Assistance Disclosure
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-01
Scope: Helm chart foc-kafka, drafted and edited with Claude Code.
Reviewed by Don Lee
*/ -}}
{{/* Label that ties a node pool / topic / user to the Kafka cluster. */}}
{{- define "foc-kafka.clusterLabel" -}}
strimzi.io/cluster: {{ .Values.clusterName }}
{{- end }}
