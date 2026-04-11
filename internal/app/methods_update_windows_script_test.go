package app

import (
	"os/exec"
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
		{"rename-before-replace strategy", `move /Y "%TARGET%" "%TARGET_OLD%"`},
		{"copy after rename", `copy /Y "%SOURCE_EXE%" "%TARGET%"`},
		{"restore on copy failure", `move /Y "%TARGET_OLD%" "%TARGET%"`},
		{"direct move fallback", `call :log rename strategy failed, trying direct move`},
		{"exponential backoff tier 1", `if !RETRY! GEQ 3 set /a WAIT=2`},
		{"exponential backoff tier 2", `if !RETRY! GEQ 6 set /a WAIT=3`},
		{"exponential backoff tier 3", `if !RETRY! GEQ 9 set /a WAIT=5`},
		{"retry limit 15", `if !RETRY! LSS 15`},
		{"cleanup old file", `del /F /Q "%TARGET_OLD%"`},
	}
	for _, fix := range win10Fixes {
		if !strings.Contains(script, fix.token) {
			t.Errorf("Win10 fix missing [%s]: expected token: %s", fix.desc, fix.token)
		}
	}
}

func TestBuildWindowsScriptUsesCRLFLineEndings(t *testing.T) {
	script := buildWindowsScript(
		`C:\tmp\GoNavi-v0.5.0-windows-amd64.exe`,
		`C:\Program Files\GoNavi\GoNavi.exe`,
		`C:\Program Files\GoNavi\.gonavi-update-windows-v0.5.0`,
		`C:\Program Files\GoNavi\logs\update-install.log`,
		99999,
	)

	if !strings.Contains(script, "\r\n") {
		t.Fatalf("windows update script should use CRLF line endings")
	}
	if strings.Contains(script, "@echo off\nsetlocal") {
		t.Fatalf("windows update script should not contain LF-only line endings")
	}
}

func TestBuildWindowsScriptUsesDelayedErrorlevelInsideBlocks(t *testing.T) {
	script := buildWindowsScript(
		`C:\tmp\GoNavi-v0.5.0-windows-amd64.zip`,
		`C:\Program Files\GoNavi\GoNavi.exe`,
		`C:\Program Files\GoNavi\.gonavi-update-windows-v0.5.0`,
		`C:\Program Files\GoNavi\logs\update-install.log`,
		99999,
	)

	for _, token := range []string{
		`if !ERRORLEVEL! NEQ 0 (`,
		`powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%TARGET%'" >> "%LOG_FILE%" 2>&1`,
		`set "TARGET_OLD=%TARGET%.old"`,
	} {
		if !strings.Contains(script, token) {
			t.Fatalf("windows update script missing token: %s\nscript:\n%s", token, script)
		}
	}
}

func TestBuildWindowsLaunchCommandUsesDirectCall(t *testing.T) {
	cmd := buildWindowsLaunchCommand(`C:\tmp\gonavi-update\update.cmd`)

	if !strings.EqualFold(cmd.Args[0], cmd.Path) && !strings.HasSuffix(strings.ToLower(cmd.Path), `\cmd.exe`) {
		t.Fatalf("unexpected command path: %s", cmd.Path)
	}

	want := []string{"cmd.exe", "/D", "/C", "call", `C:\tmp\gonavi-update\update.cmd`}
	if len(cmd.Args) != len(want) {
		t.Fatalf("unexpected arg length: got %d want %d, args=%v", len(cmd.Args), len(want), cmd.Args)
	}
	for i := range want {
		if cmd.Args[i] != want[i] {
			t.Fatalf("unexpected arg[%d]: got %q want %q", i, cmd.Args[i], want[i])
		}
	}
}

var _ = exec.ErrNotFound
