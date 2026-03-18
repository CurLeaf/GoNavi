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

func TestBuildWindowsScriptWin10Fixes(t *testing.T) {
	script := buildWindowsScript(
		`C:\tmp\GoNavi-v0.5.0-windows-amd64.exe`,
		`C:\Program Files\GoNavi\GoNavi.exe`,
		`C:\Program Files\GoNavi\.gonavi-update-windows-v0.5.0`,
		`C:\Program Files\GoNavi\logs\update-install.log`,
		99999,
	)

	// 验证 Win10 关键修复点
	win10Fixes := []struct {
		desc  string
		token string
	}{
		{"cooldown after process exit", `timeout /t 3 /nobreak >nul`},
		{"cooldown log", `call :log cooldown finished, starting file replace`},
		{"rename-before-replace strategy", `ren "%TARGET%" "%TARGET_NAME%.old"`},
		{"copy after rename", `copy /Y "%SOURCE_EXE%" "%TARGET%"`},
		{"restore on copy failure", `ren "%TARGET_NAME%.old" "%TARGET_NAME%"`},
		{"direct move fallback", `call :log rename strategy failed, trying direct move`},
		{"exponential backoff tier 1", `if !RETRY! GEQ 3 set /a WAIT=2`},
		{"exponential backoff tier 2", `if !RETRY! GEQ 6 set /a WAIT=3`},
		{"exponential backoff tier 3", `if !RETRY! GEQ 9 set /a WAIT=5`},
		{"retry limit 15", `if !RETRY! LSS 15`},
		{"cleanup old file", `del /F /Q "%TARGET%.old"`},
	}
	for _, fix := range win10Fixes {
		if !strings.Contains(script, fix.token) {
			t.Errorf("Win10 fix missing [%s]: expected token: %s", fix.desc, fix.token)
		}
	}
}

