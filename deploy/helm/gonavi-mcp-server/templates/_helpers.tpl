{{- define "gonavi-mcp-server.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "gonavi-mcp-server.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "gonavi-mcp-server.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "gonavi-mcp-server.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "gonavi-mcp-server.labels" -}}
helm.sh/chart: {{ include "gonavi-mcp-server.chart" . }}
app.kubernetes.io/name: {{ include "gonavi-mcp-server.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "gonavi-mcp-server.selectorLabels" -}}
app.kubernetes.io/name: {{ include "gonavi-mcp-server.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "gonavi-mcp-server.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride -}}
{{- end -}}

{{- define "gonavi-mcp-server.secretName" -}}
{{- if .Values.secret.name -}}
{{- .Values.secret.name -}}
{{- else -}}
{{- include "gonavi-mcp-server.fullname" . -}}
{{- end -}}
{{- end -}}

{{- define "gonavi-mcp-server.serviceName" -}}
{{- include "gonavi-mcp-server.fullname" . -}}
{{- end -}}
