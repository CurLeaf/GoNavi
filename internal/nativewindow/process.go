package nativewindow

import (
	"os"
	"os/exec"
)

type processSpec struct {
	Executable string
	Env        []string
}

type childProcess interface {
	PID() int
	Wait() error
	Kill() error
}

type processStarter interface {
	Start(processSpec) (childProcess, error)
}

type execProcessStarter struct{}

func (execProcessStarter) Start(spec processSpec) (childProcess, error) {
	command := exec.Command(spec.Executable, DetachedWindowArgument)
	command.Env = spec.Env
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		return nil, err
	}
	return &execChildProcess{command: command}, nil
}

type execChildProcess struct {
	command *exec.Cmd
}

func (p *execChildProcess) PID() int {
	if p == nil || p.command == nil || p.command.Process == nil {
		return 0
	}
	return p.command.Process.Pid
}

func (p *execChildProcess) Wait() error {
	if p == nil || p.command == nil {
		return nil
	}
	return p.command.Wait()
}

func (p *execChildProcess) Kill() error {
	if p == nil || p.command == nil || p.command.Process == nil {
		return nil
	}
	return p.command.Process.Kill()
}
