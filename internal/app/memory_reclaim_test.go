package app

import (
	"os"
	"testing"
)

func TestShouldReleaseFileTransferMemory_UsesRowsThreshold(t *testing.T) {
	if !shouldReleaseFileTransferMemory(fileTransferMemoryTrimRowsThreshold, "") {
		t.Fatal("达到行数阈值时应触发内存回收")
	}
	if shouldReleaseFileTransferMemory(fileTransferMemoryTrimRowsThreshold-1, "") {
		t.Fatal("未达到行数阈值时不应仅凭行数触发内存回收")
	}
}

func TestShouldReleaseFileTransferMemory_UsesFileSizeThreshold(t *testing.T) {
	f, err := os.CreateTemp("", "gonavi-memory-trim-*.bin")
	if err != nil {
		t.Fatalf("创建临时文件失败: %v", err)
	}
	defer os.Remove(f.Name())
	defer f.Close()

	if err := f.Truncate(fileTransferMemoryTrimFileSizeThreshold); err != nil {
		t.Fatalf("设置临时文件大小失败: %v", err)
	}

	if !shouldReleaseFileTransferMemory(0, f.Name()) {
		t.Fatal("达到文件大小阈值时应触发内存回收")
	}
}

func TestMaybeReleaseFileTransferMemory_TriggersTrimForLargeJobs(t *testing.T) {
	originalAsync := runFileTransferMemoryTrimAsync
	originalTrim := fileTransferMemoryTrimFn
	t.Cleanup(func() {
		runFileTransferMemoryTrimAsync = originalAsync
		fileTransferMemoryTrimFn = originalTrim
		fileTransferMemoryTrimRunning.Store(false)
		fileTransferMemoryTrimLastAt.Store(0)
	})

	fileTransferMemoryTrimRunning.Store(false)
	fileTransferMemoryTrimLastAt.Store(0)

	triggered := 0
	runFileTransferMemoryTrimAsync = func(fn func()) {
		fn()
	}
	fileTransferMemoryTrimFn = func() {
		triggered++
	}

	maybeReleaseFileTransferMemory("test-large-job", fileTransferMemoryTrimRowsThreshold, "")

	if triggered != 1 {
		t.Fatalf("大任务完成后应触发一次内存回收，got=%d", triggered)
	}
}

func TestMaybeReleaseFileTransferMemory_SkipsSmallJobs(t *testing.T) {
	originalAsync := runFileTransferMemoryTrimAsync
	originalTrim := fileTransferMemoryTrimFn
	t.Cleanup(func() {
		runFileTransferMemoryTrimAsync = originalAsync
		fileTransferMemoryTrimFn = originalTrim
		fileTransferMemoryTrimRunning.Store(false)
		fileTransferMemoryTrimLastAt.Store(0)
	})

	fileTransferMemoryTrimRunning.Store(false)
	fileTransferMemoryTrimLastAt.Store(0)

	triggered := 0
	runFileTransferMemoryTrimAsync = func(fn func()) {
		fn()
	}
	fileTransferMemoryTrimFn = func() {
		triggered++
	}

	maybeReleaseFileTransferMemory("test-small-job", 10, "")

	if triggered != 0 {
		t.Fatalf("小任务不应触发内存回收，got=%d", triggered)
	}
}
