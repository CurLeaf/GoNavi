//go:build darwin || dragonfly || freebsd || linux || netbsd || openbsd

package app

import (
	"errors"
	"os"

	"golang.org/x/sys/unix"
)

type queryHistoryFileLock struct {
	file *os.File
}

func acquireQueryHistoryFileLock(path string) (*queryHistoryFileLock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := unix.Flock(int(file.Fd()), unix.LOCK_EX); err != nil {
		_ = file.Close()
		return nil, err
	}
	_ = file.Chmod(0o600)
	return &queryHistoryFileLock{file: file}, nil
}

func (lock *queryHistoryFileLock) Close() error {
	if lock == nil || lock.file == nil {
		return nil
	}
	unlockErr := unix.Flock(int(lock.file.Fd()), unix.LOCK_UN)
	closeErr := lock.file.Close()
	lock.file = nil
	return errors.Join(unlockErr, closeErr)
}
