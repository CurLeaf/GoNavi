//go:build !(darwin || dragonfly || freebsd || linux || netbsd || openbsd || windows)

package app

import "os"

type queryHistoryFileLock struct {
	file *os.File
}

func acquireQueryHistoryFileLock(path string) (*queryHistoryFileLock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	return &queryHistoryFileLock{file: file}, nil
}

func (lock *queryHistoryFileLock) Close() error {
	if lock == nil || lock.file == nil {
		return nil
	}
	err := lock.file.Close()
	lock.file = nil
	return err
}
