package app

import "strings"

const macWindowDiagnosticsEnv = "GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS"

func shouldInstallMacNativeWindowDiagnostics() bool {
	switch strings.ToLower(strings.TrimSpace(getenv(macWindowDiagnosticsEnv))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
