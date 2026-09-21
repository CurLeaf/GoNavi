package app

import (
	"fmt"
)

// windowsUpdateProcess 是一次待关闭的 GoNavi 进程快照。
type windowsUpdateProcess struct {
	PID        uint32
	Executable string
}

func otherWindowsUpdateProcessIDs(processes []windowsUpdateProcess) []uint32 {
	result := make([]uint32, 0, len(processes))
	for _, process := range processes {
		result = append(result, process.PID)
	}
	return result
}

// closeOtherWindowsUpdateInstancesForInstall 关闭同一安装目录下的其它 GoNavi
// 进程，避免替换磁盘上的文件时被占用。返回被请求关闭的 PID。
func closeOtherWindowsUpdateInstancesForInstall(targetPaths []string, currentPID int) ([]uint32, error) {
	instances, err := findOtherWindowsUpdateInstances(targetPaths, currentPID)
	if err != nil {
		return nil, err
	}
	pids := otherWindowsUpdateProcessIDs(instances)
	if len(instances) == 0 {
		return pids, nil
	}
	if err := closeWindowsUpdateInstances(instances); err != nil {
		return pids, err
	}
	remaining, err := findOtherWindowsUpdateInstances(targetPaths, currentPID)
	if err != nil {
		return pids, err
	}
	if len(remaining) > 0 {
		return pids, fmt.Errorf("GoNavi processes still running after close: %v", otherWindowsUpdateProcessIDs(remaining))
	}
	return pids, nil
}
