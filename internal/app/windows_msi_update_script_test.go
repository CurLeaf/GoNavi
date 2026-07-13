package app

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildWindowsMSIUpdatePowerShellScriptInstallsRelaunchesAndCleans(t *testing.T) {
	script := buildWindowsMSIUpdatePowerShellScript()
	mustContain := []string{
		`while (Get-Process -Id $HostProcessId -ErrorAction SilentlyContinue)`,
		`Start-Process -FilePath $MSIExecPath -Verb RunAs`,
		`'INSTALLFOLDER=' + (Quote-NativeArgument $TargetDir)`,
		`'/passive'`,
		`'/norestart'`,
		`'/L*v'`,
		`$InstallerExitCode -notin @(0, 1641, 3010)`,
		`Start-Process -FilePath $Target -WorkingDirectory $TargetDir`,
		`Remove-UpdateArtifact $Source`,
		`MSI package retained for manual install`,
		`previous application relaunched after MSI failure`,
	}
	for _, token := range mustContain {
		if !strings.Contains(script, token) {
			t.Fatalf("MSI updater missing %q\n%s", token, script)
		}
	}
	if strings.Index(script, `Remove-UpdateArtifact $Source`) < strings.Index(script, `Start-Process -FilePath $Target -WorkingDirectory $TargetDir`) {
		t.Fatalf("MSI package must be removed only after relaunch\n%s", script)
	}
	for _, r := range script {
		if r > 0x7f {
			t.Fatalf("MSI updater must remain ASCII-only, found %q", r)
		}
	}
}

func TestBuildWindowsMSILaunchCommandPreservesPathsInEnvironment(t *testing.T) {
	context := windowsMSIUpdateLaunchContext{
		SourcePath:  `C:\Users\tester\AppData\Local\GoNavi 100%\GoNavi-Installer.msi`,
		TargetPath:  `D:\software ! 100% & portable\GoNavi.exe`,
		StagedDir:   `C:\Users\tester\AppData\Local\GoNavi 100%\stage`,
		LogPath:     `C:\Users\tester\AppData\Local\GoNavi 100%\stage\update.log`,
		MSILogPath:  `C:\Users\tester\AppData\Local\GoNavi 100%\stage\msi.log`,
		MSIExecPath: `C:\Windows\System32\msiexec.exe`,
		PID:         12345,
	}
	cmd := buildWindowsMSILaunchCommand(filepath.Join(context.StagedDir, "update-msi.ps1"), context)
	want := map[string]string{
		"GONAVI_UPDATE_SOURCE":       context.SourcePath,
		"GONAVI_UPDATE_TARGET":       context.TargetPath,
		"GONAVI_UPDATE_STAGED_DIR":   context.StagedDir,
		"GONAVI_UPDATE_LOG_PATH":     context.LogPath,
		"GONAVI_UPDATE_MSI_LOG_PATH": context.MSILogPath,
		"GONAVI_UPDATE_MSIEXEC_PATH": context.MSIExecPath,
		"GONAVI_UPDATE_PID":          "12345",
	}
	got := make(map[string]string, len(want))
	for _, item := range cmd.Env {
		name, value, ok := strings.Cut(item, "=")
		if ok {
			if _, exists := want[name]; exists {
				got[name] = value
			}
		}
	}
	for name, value := range want {
		if got[name] != value {
			t.Fatalf("environment %s = %q, want %q", name, got[name], value)
		}
	}
}

func TestResolveWindowsMSIExecPathPrefersExplicitOverride(t *testing.T) {
	values := map[string]string{
		"GONAVI_UPDATE_MSIEXEC_PATH": `D:\\tools\\fake-msiexec.exe`,
		"SystemRoot":                 `C:\\Windows`,
	}
	got := resolveWindowsMSIExecPath(func(name string) string { return values[name] })
	if got != values["GONAVI_UPDATE_MSIEXEC_PATH"] {
		t.Fatalf("msiexec path = %q, want override %q", got, values["GONAVI_UPDATE_MSIEXEC_PATH"])
	}
	delete(values, "GONAVI_UPDATE_MSIEXEC_PATH")
	wantSystem := filepath.Join(values["SystemRoot"], "System32", "msiexec.exe")
	if got := resolveWindowsMSIExecPath(func(name string) string { return values[name] }); got != wantSystem {
		t.Fatalf("msiexec path = %q, want SystemRoot path %q", got, wantSystem)
	}
}
