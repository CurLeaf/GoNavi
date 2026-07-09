//go:build !windows

package app

import (
	"os/exec"
	"syscall"
)

// configureDetachedUpdateCommand 让安装脚本脱离主进程会话，避免 Quit/Exit 后脚本被连带结束。
func configureDetachedUpdateCommand(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
}
