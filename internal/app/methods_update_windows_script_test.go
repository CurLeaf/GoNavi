package app

import (
	"strings"
	"testing"
)

func TestBuildWindowsScriptKeepsBatchForSyntax(t *testing.T) {
	script := buildWindowsScript(
		`C:\tmp\GoNavi-v0.4.0-windows-amd64.zip`,
		`C:\Program Files\GoNavi\GoNavi.exe`,
		`C:\Program Files\GoNavi\.gonavi-update-windows-v0.4.0`,
		`C:\Program Files\GoNavi\logs\update-install.log`,
		13579,
	)

	mustContain := []string{
		`for %%I in ("%TARGET%") do set "TARGET_NAME=%%~nxI"`,
		`for %%I in ("%SOURCE%") do set "SOURCE_EXT=%%~xI"`,
		`for /R "%EXTRACT_DIR%" %%F in (*.exe) do (`,
		`set "SOURCE_EXE=%%~fF"`,
	}
	for _, want := range mustContain {
		if !strings.Contains(script, want) {
			t.Fatalf("windows update script missing required token: %s\nscript:\n%s", want, script)
		}
	}

	mustNotContain := []string{
		`for %I in ("%TARGET%") do set "TARGET_NAME=%~nxI"`,
		`for %I in ("%SOURCE%") do set "SOURCE_EXT=%~xI"`,
		`for /R "%EXTRACT_DIR%" %F in (*.exe) do (`,
		`set "SOURCE_EXE=%~fF"`,
	}
	for _, bad := range mustNotContain {
		if strings.Contains(script, bad) {
			t.Fatalf("windows update script contains invalid batch syntax: %s\nscript:\n%s", bad, script)
		}
	}
}
