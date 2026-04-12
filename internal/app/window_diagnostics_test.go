package app

import "testing"

func TestShouldInstallMacNativeWindowDiagnosticsDefaultsDisabled(t *testing.T) {
	t.Setenv("GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS", "")

	if shouldInstallMacNativeWindowDiagnostics() {
		t.Fatal("expected mac native window diagnostics to stay disabled by default")
	}
}

func TestShouldInstallMacNativeWindowDiagnosticsHonorsEnvOptIn(t *testing.T) {
	t.Setenv("GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS", "1")

	if !shouldInstallMacNativeWindowDiagnostics() {
		t.Fatal("expected mac native window diagnostics to enable when explicitly opted in")
	}

	t.Setenv("GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS", "true")
	if !shouldInstallMacNativeWindowDiagnostics() {
		t.Fatal("expected mac native window diagnostics to accept true as opt-in value")
	}

	t.Setenv("GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS", "0")
	if shouldInstallMacNativeWindowDiagnostics() {
		t.Fatal("expected mac native window diagnostics to stay disabled for non-opt-in values")
	}
}

func TestShouldInstallMacNativeWindowDiagnosticsIgnoresCaseAndWhitespace(t *testing.T) {
	t.Setenv("GONAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS", " TRUE ")

	if !shouldInstallMacNativeWindowDiagnostics() {
		t.Fatal("expected helper to trim and lowercase opt-in values")
	}
}
