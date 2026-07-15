//go:build windows

package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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

func TestFindOtherWindowsUpdateInstancesMatchesExecutablePath(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable returned error: %v", err)
	}

	instances, err := findOtherWindowsUpdateInstances([]string{executable}, -1)
	if err != nil {
		t.Fatalf("findOtherWindowsUpdateInstances returned error: %v", err)
	}
	for _, instance := range instances {
		if instance.PID == uint32(os.Getpid()) {
			return
		}
	}
	t.Fatalf("expected current executable process %d to be detected, got %#v", os.Getpid(), instances)
}

func TestInstallUpdateAndRestartBlocksWhenAnotherTargetInstanceIsRunning(t *testing.T) {
	dir := t.TempDir()
	currentTarget := filepath.Join(dir, "GoNavi-dev-old-Windows-Amd64-Portable.exe")
	newTarget := filepath.Join(dir, "GoNavi-dev-new-Windows-Amd64-Portable.exe")
	if err := os.WriteFile(newTarget, []byte("12345678"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	app := NewApp()
	app.SetLanguage("en-US")
	app.updateState.staged = &stagedUpdate{
		Channel:      updateChannelDev,
		Version:      "dev-new",
		AssetName:    filepath.Base(newTarget),
		FilePath:     newTarget,
		StagedDir:    filepath.Join(dir, ".gonavi-update-windows-dev-new"),
		InstallMode:  updateInstallModePortable,
		PackageType:  updatePackageTypePortable,
		AutoRelaunch: true,
	}

	originalResolveInstallTarget := updateResolveInstallTarget
	originalFindOtherInstances := updateFindOtherWindowsInstances
	originalLaunchInstallScript := updateLaunchInstallScript
	t.Cleanup(func() {
		updateResolveInstallTarget = originalResolveInstallTarget
		updateFindOtherWindowsInstances = originalFindOtherInstances
		updateLaunchInstallScript = originalLaunchInstallScript
	})
	updateResolveInstallTarget = func() string { return currentTarget }

	var checkedTargets []string
	updateFindOtherWindowsInstances = func(targets []string, currentPID int) ([]windowsUpdateProcess, error) {
		checkedTargets = append([]string(nil), targets...)
		if currentPID != os.Getpid() {
			t.Fatalf("current PID = %d, want %d", currentPID, os.Getpid())
		}
		return []windowsUpdateProcess{{PID: 4321, Executable: newTarget}}, nil
	}
	launched := false
	updateLaunchInstallScript = func(*stagedUpdate) error {
		launched = true
		return nil
	}

	result := app.InstallUpdateAndRestart()
	if result.Success {
		t.Fatalf("expected another running instance to block update, got %#v", result)
	}
	if launched {
		t.Fatal("update launcher must not start while another target instance is running")
	}
	if len(checkedTargets) != 2 || checkedTargets[0] != currentTarget || checkedTargets[1] != newTarget {
		t.Fatalf("checked targets = %#v, want current and final target", checkedTargets)
	}
	if !strings.Contains(result.Message, "GoNavi instance") {
		t.Fatalf("expected actionable other-instance message, got %q", result.Message)
	}
}
