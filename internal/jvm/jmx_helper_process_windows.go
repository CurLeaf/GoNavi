//go:build windows

package jvm

import (
	"os/exec"
	"syscall"
)

func configureJMXHelperCommand(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
