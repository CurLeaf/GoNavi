package jvm

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

func DescribeConnectionTestError(cfg connection.ConnectionConfig, err error) string {
	if err == nil {
		return ""
	}

	raw := strings.TrimSpace(err.Error())
	if raw == "" {
		return localizedJVMBackendText("jvm.backend.connection_error.generic", nil)
	}

	switch strings.ToLower(strings.TrimSpace(cfg.JVM.PreferredMode)) {
	case ModeJMX:
		if mapped := describeJMXConnectionError(cfg, raw); mapped != "" {
			return mapped
		}
	case ModeEndpoint:
		if mapped := describeEndpointConnectionError(raw); mapped != "" {
			return mapped
		}
	case ModeAgent:
		if mapped := describeAgentConnectionError(raw); mapped != "" {
			return mapped
		}
	}

	return raw
}

func describeEndpointConnectionError(raw string) string {
	lower := strings.ToLower(raw)

	switch {
	case strings.Contains(lower, "endpoint baseurl is required"):
		return localizedJVMBackendText("jvm.backend.connection_error.endpoint.base_url_required", nil)
	case strings.Contains(lower, "endpoint baseurl is invalid"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.base_url_invalid.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.base_url_invalid.help", nil),
			raw,
		)
	case strings.Contains(lower, "endpoint scheme is unsupported"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.scheme_unsupported.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.scheme_unsupported.help", nil),
			raw,
		)
	case strings.Contains(lower, "unexpected status: 404"), strings.Contains(lower, "request failed: 404"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.not_found.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.not_found.help", nil),
			raw,
		)
	case strings.Contains(lower, "connect: connection refused"), strings.Contains(lower, "connection refused"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.connection_refused.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.connection_refused.help", nil),
			raw,
		)
	case strings.Contains(lower, "401 unauthorized"), strings.Contains(lower, "missing or invalid api key"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.unauthorized.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.unauthorized.help", nil),
			raw,
		)
	case strings.Contains(lower, "403 forbidden"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.forbidden.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.forbidden.help", nil),
			raw,
		)
	case strings.Contains(lower, "timed out"), strings.Contains(lower, "timeout"), strings.Contains(lower, "context deadline exceeded"), strings.Contains(lower, "i/o timeout"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.timeout.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.endpoint.timeout.help", nil),
			raw,
		)
	default:
		return ""
	}
}

func describeAgentConnectionError(raw string) string {
	lower := strings.ToLower(raw)

	switch {
	case strings.Contains(lower, "agent baseurl is required"):
		return localizedJVMBackendText("jvm.backend.connection_error.agent.base_url_required", nil)
	case strings.Contains(lower, "agent baseurl is invalid"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.agent.base_url_invalid.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.agent.base_url_invalid.help", nil),
			raw,
		)
	case strings.Contains(lower, "agent scheme is unsupported"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.agent.scheme_unsupported.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.agent.scheme_unsupported.help", nil),
			raw,
		)
	case strings.Contains(lower, "connect: connection refused"), strings.Contains(lower, "connection refused"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.agent.connection_refused.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.agent.connection_refused.help", nil),
			raw,
		)
	case strings.Contains(lower, "401 unauthorized"), strings.Contains(lower, "missing or invalid api key"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.agent.unauthorized.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.agent.unauthorized.help", nil),
			raw,
		)
	case strings.Contains(lower, "403 forbidden"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.agent.forbidden.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.agent.forbidden.help", nil),
			raw,
		)
	case strings.Contains(lower, "timed out"), strings.Contains(lower, "timeout"), strings.Contains(lower, "context deadline exceeded"), strings.Contains(lower, "i/o timeout"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.agent.timeout.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.agent.timeout.help", nil),
			raw,
		)
	default:
		return ""
	}
}

func describeJMXConnectionError(cfg connection.ConnectionConfig, raw string) string {
	lower := strings.ToLower(raw)
	target := fmt.Sprintf("%s:%d", resolveJMXHost(cfg), resolveJMXPort(cfg))
	targetParams := map[string]any{"target": target}

	switch {
	case strings.Contains(lower, "jmx host is required"):
		return localizedJVMBackendText("jvm.backend.connection_error.jmx.host_required", nil)
	case strings.Contains(lower, "jmx port is invalid"):
		return localizedJVMBackendText("jvm.backend.connection_error.jmx.port_invalid", nil)
	case strings.Contains(lower, `required jmx helper dependency "java" not found`):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.jmx.java_missing.summary", nil),
			localizedJVMBackendText("jvm.backend.connection_error.jmx.java_missing.help", nil),
			raw,
		)
	case strings.Contains(lower, "non-jrmp server at remote endpoint"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.jmx.non_jrmp.summary", targetParams),
			localizedJVMBackendText("jvm.backend.connection_error.jmx.non_jrmp.help", nil),
			raw,
		)
	case strings.Contains(lower, "no such object in table"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.jmx.no_such_object.summary", targetParams),
			localizedJVMBackendText("jvm.backend.connection_error.jmx.no_such_object.help", nil),
			raw,
		)
	case strings.Contains(lower, "connection reset"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.jmx.connection_reset.summary", targetParams),
			localizedJVMBackendText("jvm.backend.connection_error.jmx.connection_reset.help", nil),
			raw,
		)
	case strings.Contains(lower, "connection refused"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.jmx.connection_refused.summary", targetParams),
			localizedJVMBackendText("jvm.backend.connection_error.jmx.connection_refused.help", nil),
			raw,
		)
	case strings.Contains(lower, "authentication failed"), strings.Contains(lower, "securityexception"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.jmx.auth.summary", targetParams),
			localizedJVMBackendText("jvm.backend.connection_error.jmx.auth.help", nil),
			raw,
		)
	case strings.Contains(lower, "timed out"), strings.Contains(lower, "timeout"), strings.Contains(lower, "context deadline exceeded"), strings.Contains(lower, "i/o timeout"):
		return joinConnectionErrorMessage(
			localizedJVMBackendText("jvm.backend.connection_error.jmx.timeout.summary", targetParams),
			localizedJVMBackendText("jvm.backend.connection_error.jmx.timeout.help", nil),
			raw,
		)
	default:
		return ""
	}
}

func joinConnectionErrorMessage(summary string, suggestion string, raw string) string {
	lines := make([]string, 0, 3)
	if trimmed := strings.TrimSpace(summary); trimmed != "" {
		lines = append(lines, trimmed)
	}
	if trimmed := strings.TrimSpace(suggestion); trimmed != "" {
		lines = append(lines, localizedJVMBackendText("jvm.backend.connection_error.suggestion", map[string]any{"detail": trimmed}))
	}
	if trimmed := strings.TrimSpace(raw); trimmed != "" {
		lines = append(lines, localizedJVMBackendText("jvm.backend.connection_error.technical_detail", map[string]any{"detail": trimmed}))
	}
	return strings.Join(lines, "\n")
}
