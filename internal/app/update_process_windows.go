//go:build windows

package app

import "os/exec"

// Windows 安装脚本已通过 configureWindowsUpdateCommand 做 CREATE_NO_WINDOW 等隔离。
func configureDetachedUpdateCommand(cmd *exec.Cmd) {
	configureWindowsUpdateCommand(cmd)
}
