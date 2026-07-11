//go:build windows

package app

import "testing"

func TestBuildWindowsLaunchCommandHidesConsoleWindow(t *testing.T) {
	cmd := buildWindowsLaunchCommand(
		`C:\tmp\gonavi-update\update.ps1`,
		windowsUpdateLaunchContext{StagedDir: `C:\tmp\gonavi-update`},
	)

	if cmd.SysProcAttr == nil {
		t.Fatalf("expected Windows update launcher to configure SysProcAttr")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Fatalf("expected Windows update launcher to hide the console window")
	}
	if cmd.SysProcAttr.CreationFlags&windowsCreateNoWindow == 0 {
		t.Fatalf("expected Windows update launcher to set CREATE_NO_WINDOW, flags=%#x", cmd.SysProcAttr.CreationFlags)
	}
}
