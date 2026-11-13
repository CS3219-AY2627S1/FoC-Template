{{/* Labels on everything the chart creates. The selector only uses app.kubernetes.io/name. */}}
{{- define "relay.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: relay
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- end }}

{{/* Image of one of our services: prefix + name + tag, unless the service names its own image or tag. */}}
{{- define "relay.image" -}}
{{- $repository := .svc.image | default (printf "%s%s" .root.Values.images.prefix .name) -}}
{{- printf "%s:%s" $repository (.svc.tag | default .root.Values.images.tag) -}}
{{- end }}

{{/* Restarts the pods when the chart's Secret changes, otherwise they keep the old values. */}}
{{- define "relay.secretChecksum" -}}
{{- if .Values.secrets.create -}}
checksum/secrets: {{ toJson .Values.secrets.values | sha256sum }}
{{- end -}}
{{- end }}
