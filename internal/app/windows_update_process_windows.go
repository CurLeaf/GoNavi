//go:build windows

package app

import (
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const windowsCreateNoWindow = 0x08000000

func configureWindowsUpdateCommand(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windowsCreateNoWindow,
	}
}

func findOtherWindowsUpdateInstances(targetPaths []string, currentPID int) ([]windowsUpdateProcess, error) {
	targets := make(map[string]struct{}, len(targetPaths)*2)
	for _, targetPath := range targetPaths {
		addWindowsUpdateComparablePath(targets, targetPath)
	}
	if len(targets) == 0 {
		return nil, nil
	}

	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("enumerate running processes: %w", err)
	}
	defer windows.CloseHandle(snapshot)

	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	if err := windows.Process32First(snapshot, &entry); err != nil {
		if errors.Is(err, windows.ERROR_NO_MORE_FILES) {
			return nil, nil
		}
		return nil, fmt.Errorf("read running processes: %w", err)
	}

	result := make([]windowsUpdateProcess, 0, 2)
	for {
		pid := entry.ProcessID
		if pid != 0 && int(pid) != currentPID {
			if executable, ok := queryWindowsProcessExecutable(pid); ok && windowsUpdatePathMatches(targets, executable) {
				result = append(result, windowsUpdateProcess{PID: pid, Executable: executable})
			}
		}

		if err := windows.Process32Next(snapshot, &entry); err != nil {
			if errors.Is(err, windows.ERROR_NO_MORE_FILES) {
				break
			}
			return nil, fmt.Errorf("read running processes: %w", err)
		}
	}
	return result, nil
}

func queryWindowsProcessExecutable(pid uint32) (string, bool) {
	process, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return "", false
	}
	defer windows.CloseHandle(process)

	buffer := make([]uint16, windows.MAX_LONG_PATH)
	size := uint32(len(buffer))
	if err := windows.QueryFullProcessImageName(process, 0, &buffer[0], &size); err != nil || size == 0 {
		return "", false
	}
	return windows.UTF16ToString(buffer[:size]), true
}

func windowsUpdatePathMatches(targets map[string]struct{}, executable string) bool {
	paths := make(map[string]struct{}, 2)
	addWindowsUpdateComparablePath(paths, executable)
	for path := range paths {
		if _, ok := targets[path]; ok {
			return true
		}
	}
	return false
}

func addWindowsUpdateComparablePath(paths map[string]struct{}, path string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	path = strings.TrimPrefix(path, `\\?\`)
	if absolute, err := filepath.Abs(path); err == nil {
		path = absolute
	}
	path = strings.ToLower(filepath.Clean(path))
	paths[path] = struct{}{}

	if evaluated, err := filepath.EvalSymlinks(path); err == nil {
		paths[strings.ToLower(filepath.Clean(evaluated))] = struct{}{}
	}
}
