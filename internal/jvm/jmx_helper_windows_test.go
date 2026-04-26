//go:build windows

package jvm

import (
	"os/exec"
	"testing"
)

func TestConfigureJMXHelperCommandHidesWindowOnWindows(t *testing.T) {
	cmd := exec.Command("java")

	configureJMXHelperCommand(cmd)

	if cmd.SysProcAttr == nil || !cmd.SysProcAttr.HideWindow {
		t.Fatalf("expected JMX helper command to hide Windows console window, got %#v", cmd.SysProcAttr)
	}
}
