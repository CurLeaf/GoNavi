package app

import (
	"os"
	"runtime"
	"runtime/debug"
	"strings"
	"sync/atomic"
	"time"

	"GoNavi-Wails/internal/logger"
)

const (
	fileTransferMemoryTrimRowsThreshold     int64 = 100000
	fileTransferMemoryTrimFileSizeThreshold int64 = 64 * 1024 * 1024
	fileTransferMemoryTrimMinInterval             = 3 * time.Second
)

var (
	fileTransferMemoryTrimRunning atomic.Bool
	fileTransferMemoryTrimLastAt  atomic.Int64

	runFileTransferMemoryTrimAsync = func(fn func()) {
		go fn()
	}
	fileTransferMemoryTrimFn = func() {
		runtime.GC()
		debug.FreeOSMemory()
	}
)

func maybeReleaseFileTransferMemory(reason string, rows int64, filePath string) {
	if !shouldReleaseFileTransferMemory(rows, filePath) {
		return
	}
	if !fileTransferMemoryTrimRunning.CompareAndSwap(false, true) {
		return
	}

	runFileTransferMemoryTrimAsync(func() {
		defer fileTransferMemoryTrimRunning.Store(false)

		if delay := nextFileTransferMemoryTrimDelay(); delay > 0 {
			time.Sleep(delay)
		}

		logger.Infof("大文件导入导出任务结束，尝试回收进程内存：reason=%s rows=%d file=%s", strings.TrimSpace(reason), rows, strings.TrimSpace(filePath))
		fileTransferMemoryTrimFn()
		fileTransferMemoryTrimLastAt.Store(time.Now().UnixNano())
	})
}

func shouldReleaseFileTransferMemory(rows int64, filePath string) bool {
	if rows >= fileTransferMemoryTrimRowsThreshold {
		return true
	}
	filePath = strings.TrimSpace(filePath)
	if filePath == "" {
		return false
	}
	info, err := os.Stat(filePath)
	if err != nil {
		return false
	}
	return info.Size() >= fileTransferMemoryTrimFileSizeThreshold
}

func nextFileTransferMemoryTrimDelay() time.Duration {
	lastUnixNano := fileTransferMemoryTrimLastAt.Load()
	if lastUnixNano <= 0 {
		return 0
	}
	elapsed := time.Since(time.Unix(0, lastUnixNano))
	if elapsed >= fileTransferMemoryTrimMinInterval {
		return 0
	}
	return fileTransferMemoryTrimMinInterval - elapsed
}
