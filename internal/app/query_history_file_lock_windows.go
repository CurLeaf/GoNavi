//go:build windows

package app

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

type queryHistoryFileLock struct {
	file       *os.File
	overlapped windows.Overlapped
}

func acquireQueryHistoryFileLock(path string) (*queryHistoryFileLock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	lock := &queryHistoryFileLock{file: file}
	if err := windows.LockFileEx(
		windows.Handle(file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK,
		0,
		1,
		0,
		&lock.overlapped,
	); err != nil {
		_ = file.Close()
		return nil, err
	}
	_ = file.Chmod(0o600)
	return lock, nil
}

func (lock *queryHistoryFileLock) Close() error {
	if lock == nil || lock.file == nil {
		return nil
	}
	unlockErr := windows.UnlockFileEx(
		windows.Handle(lock.file.Fd()),
		0,
		1,
		0,
		&lock.overlapped,
	)
	closeErr := lock.file.Close()
	lock.file = nil
	return errors.Join(unlockErr, closeErr)
}
