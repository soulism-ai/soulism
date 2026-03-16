{{- define "service.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "service.fullname" -}}
{{- printf "%s" .Chart.Name -}}
{{- end -}}

{{- define "service.labels" -}}
app.kubernetes.io/name: {{ include "service.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
