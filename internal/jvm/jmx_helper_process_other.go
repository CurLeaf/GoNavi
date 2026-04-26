//go:build !windows

package jvm

import "os/exec"

func configureJMXHelperCommand(_ *exec.Cmd) {
}
