package app

// 当前安装形态识别。
//
// Windows 上 GoNavi 有 MSI 与便携包两种安装形态：MSI 会在可执行文件旁放置
// 标记文件。单实例策略（main.go）与任务栏身份迁移（application_icon_windows.go）
// 都依赖这里。

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

const windowsMSIInstallMarker = ".gonavi-msi-install"

type installMode string

const (
	installModeUnknown  installMode = "unknown"
	installModePortable installMode = "portable"
	installModeMSI      installMode = "msi"
)

// IsWindowsMSIInstallExecutable reports whether executablePath belongs to a
// GoNavi MSI installation. The marker is packaged next to the stable MSI exe.
func IsWindowsMSIInstallExecutable(goos string, executablePath string) bool {
	return resolveInstallModeForExecutable(goos, executablePath) == installModeMSI
}

func resolveInstallModeForExecutable(goos string, executablePath string) installMode {
	if !strings.EqualFold(strings.TrimSpace(goos), "windows") {
		return installModeUnknown
	}
	executablePath = strings.TrimSpace(executablePath)
	if executablePath == "" {
		return installModeUnknown
	}
	markerPath := filepath.Join(filepath.Dir(executablePath), windowsMSIInstallMarker)
	info, err := os.Stat(markerPath)
	if err == nil {
		if info.IsDir() {
			return installModeUnknown
		}
		return installModeMSI
	}
	if errors.Is(err, os.ErrNotExist) {
		return installModePortable
	}
	return installModeUnknown
}

// resolveInstallTarget 返回当前可执行文件的绝对路径（已解析软链接）。
func resolveInstallTarget() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exePath = strings.TrimSpace(exePath)
	if exePath == "" {
		return ""
	}
	if resolved, evalErr := filepath.EvalSymlinks(exePath); evalErr == nil {
		if resolved = strings.TrimSpace(resolved); resolved != "" {
			exePath = resolved
		}
	}
	return exePath
}
