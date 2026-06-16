package aiservice

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/internal/logger"
)

const (
	defaultMCPHTTPAddr = "127.0.0.1:8765"
	defaultMCPHTTPPath = "/mcp"
)

type mcpHTTPServerRuntime struct {
	process  mcpHTTPProcess
	status   ai.MCPHTTPServerStatus
	stopping bool
}

type mcpHTTPProcessStartOptions struct {
	Addr       string
	Path       string
	Token      string
	SchemaOnly bool
}

type mcpHTTPProcess interface {
	Done() <-chan struct{}
	Stop(context.Context) error
	Wait() error
}

var (
	startMCPHTTPProcess = startMCPHTTPCommandProcess
	waitMCPHTTPHealth   = waitMCPHTTPHealthEndpoint
)

// AIGetMCPHTTPServerStatus 返回客户端内置 HTTP MCP 服务状态。
func (s *Service) AIGetMCPHTTPServerStatus() ai.MCPHTTPServerStatus {
	s.mcpHTTPMu.Lock()
	defer s.mcpHTTPMu.Unlock()

	if s.mcpHTTP != nil {
		status := s.mcpHTTP.status
		status.Running = true
		return status
	}
	if strings.TrimSpace(s.mcpHTTPLast.Addr) != "" {
		return s.mcpHTTPLast
	}
	return defaultMCPHTTPServerStatus()
}

// AIStartMCPHTTPServer 从客户端内启动 GoNavi Streamable HTTP MCP 服务。
func (s *Service) AIStartMCPHTTPServer(options ai.MCPHTTPServerOptions) (ai.MCPHTTPServerStatus, error) {
	s.mcpHTTPMu.Lock()
	if s.mcpHTTP != nil {
		status := s.mcpHTTP.status
		status.Running = true
		s.mcpHTTPMu.Unlock()
		return status, nil
	}
	s.mcpHTTPMu.Unlock()

	startOptions, token, err := normalizeInAppMCPHTTPOptions(options)
	if err != nil {
		return defaultMCPHTTPServerStatus(), err
	}

	ctx := s.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	process, err := startMCPHTTPProcess(ctx, startOptions)
	if err != nil {
		status := stoppedMCPHTTPStatus(statusFromMCPHTTPOptions(startOptions, token), fmt.Sprintf("GoNavi MCP HTTP 服务启动失败：%v", err))
		return status, err
	}

	status := statusFromMCPHTTPOptions(startOptions, token)
	if err := waitForMCPHTTPReady(ctx, process, status); err != nil {
		_ = process.Stop(context.Background())
		stopped := stoppedMCPHTTPStatus(status, fmt.Sprintf("GoNavi MCP HTTP 服务启动失败：%v", err))
		return stopped, err
	}

	runtime := &mcpHTTPServerRuntime{process: process, status: status}

	s.mcpHTTPMu.Lock()
	if s.mcpHTTP != nil {
		existing := s.mcpHTTP.status
		existing.Running = true
		s.mcpHTTPMu.Unlock()
		_ = process.Stop(context.Background())
		return existing, nil
	}
	s.mcpHTTP = runtime
	s.mcpHTTPLast = status
	s.mcpHTTPMu.Unlock()

	logger.Infof("客户端启动 GoNavi MCP HTTP 服务：addr=%s path=%s schemaOnly=%v", status.Addr, status.Path, status.SchemaOnly)
	go s.watchMCPHTTPServer(runtime)
	return status, nil
}

// AIStopMCPHTTPServer 停止客户端内启动的 GoNavi Streamable HTTP MCP 服务。
func (s *Service) AIStopMCPHTTPServer() (ai.MCPHTTPServerStatus, error) {
	return s.stopMCPHTTPServer(context.Background(), "GoNavi MCP HTTP 服务已停止")
}

func (s *Service) stopMCPHTTPServer(ctx context.Context, message string) (ai.MCPHTTPServerStatus, error) {
	s.mcpHTTPMu.Lock()
	runtime := s.mcpHTTP
	if runtime == nil {
		status := s.mcpHTTPLast
		if strings.TrimSpace(status.Addr) == "" {
			status = defaultMCPHTTPServerStatus()
		}
		status.Running = false
		if strings.TrimSpace(status.Token) != "" {
			status.AuthorizationHeader = "Bearer " + strings.TrimSpace(status.Token)
		}
		status.Message = "GoNavi MCP HTTP 服务未启动"
		s.mcpHTTPLast = status
		s.mcpHTTPMu.Unlock()
		return status, nil
	}
	runtime.stopping = true
	s.mcpHTTPMu.Unlock()

	if ctx == nil {
		ctx = context.Background()
	}
	err := runtime.process.Stop(ctx)
	status := stoppedMCPHTTPStatus(runtime.status, message)
	if err != nil {
		status.Message = fmt.Sprintf("GoNavi MCP HTTP 服务停止失败：%v", err)
	}

	s.mcpHTTPMu.Lock()
	if s.mcpHTTP == runtime {
		s.mcpHTTP = nil
		s.mcpHTTPLast = status
	}
	s.mcpHTTPMu.Unlock()

	if err == nil {
		logger.Infof("客户端停止 GoNavi MCP HTTP 服务：addr=%s path=%s", status.Addr, status.Path)
	}
	return status, err
}

// Shutdown 释放 AI Service 中的运行时资源。
func (s *Service) Shutdown() {
	ctx := context.Background()
	_, _ = s.stopMCPHTTPServer(ctx, "应用关闭，GoNavi MCP HTTP 服务已停止")
}

func (s *Service) watchMCPHTTPServer(runtime *mcpHTTPServerRuntime) {
	err := runtime.process.Wait()

	s.mcpHTTPMu.Lock()
	defer s.mcpHTTPMu.Unlock()
	if s.mcpHTTP != runtime {
		return
	}

	message := "GoNavi MCP HTTP 服务已停止"
	if err != nil && !runtime.stopping {
		message = fmt.Sprintf("GoNavi MCP HTTP 服务异常退出：%v", err)
		logger.Error(err, "GoNavi MCP HTTP 服务异常退出：addr=%s path=%s", runtime.status.Addr, runtime.status.Path)
	}
	s.mcpHTTP = nil
	s.mcpHTTPLast = stoppedMCPHTTPStatus(runtime.status, message)
}

func normalizeInAppMCPHTTPOptions(options ai.MCPHTTPServerOptions) (mcpHTTPProcessStartOptions, string, error) {
	addr := strings.TrimSpace(options.Addr)
	if addr == "" {
		addr = defaultMCPHTTPAddr
	}
	path := strings.TrimSpace(options.Path)
	if path == "" {
		path = defaultMCPHTTPPath
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	token := strings.TrimSpace(options.Token)
	if token == "" {
		generated, err := generateMCPHTTPToken()
		if err != nil {
			return mcpHTTPProcessStartOptions{}, "", err
		}
		token = generated
	}

	return mcpHTTPProcessStartOptions{
		Addr:       addr,
		Path:       path,
		Token:      token,
		SchemaOnly: true,
	}, token, nil
}

func startMCPHTTPCommandProcess(ctx context.Context, options mcpHTTPProcessStartOptions) (mcpHTTPProcess, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("定位当前 GoNavi 可执行文件失败: %w", err)
	}
	if ctx == nil {
		ctx = context.Background()
	}
	processCtx, cancel := context.WithCancel(ctx)
	args := []string{"mcp-server", "http", "--addr", options.Addr, "--path", options.Path}
	if options.SchemaOnly {
		args = append(args, "--schema-only")
	}
	cmd := exec.CommandContext(processCtx, executable, args...)
	cmd.Env = append(os.Environ(), "GONAVI_MCP_HTTP_TOKEN="+options.Token)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	process := &mcpHTTPCommandProcess{
		cancel: cancel,
		cmd:    cmd,
		done:   make(chan struct{}),
	}
	go process.wait()
	return process, nil
}

type mcpHTTPCommandProcess struct {
	cancel context.CancelFunc
	cmd    *exec.Cmd
	done   chan struct{}
	mu     sync.Mutex
	err    error
}

func (p *mcpHTTPCommandProcess) Done() <-chan struct{} {
	return p.done
}

func (p *mcpHTTPCommandProcess) Stop(ctx context.Context) error {
	if p == nil {
		return nil
	}
	select {
	case <-p.done:
		return p.waitErr()
	default:
	}
	if p.cancel != nil {
		p.cancel()
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-p.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (p *mcpHTTPCommandProcess) Wait() error {
	if p == nil {
		return nil
	}
	<-p.done
	return p.waitErr()
}

func (p *mcpHTTPCommandProcess) wait() {
	err := p.cmd.Wait()
	p.mu.Lock()
	p.err = err
	p.mu.Unlock()
	close(p.done)
}

func (p *mcpHTTPCommandProcess) waitErr() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.err
}

func waitForMCPHTTPReady(ctx context.Context, process mcpHTTPProcess, status ai.MCPHTTPServerStatus) error {
	readyCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	healthErrCh := make(chan error, 1)
	go func() {
		healthErrCh <- waitMCPHTTPHealth(readyCtx, buildMCPHTTPURL(status.Addr, "/healthz"))
	}()

	select {
	case err := <-healthErrCh:
		return err
	case <-process.Done():
		if err := process.Wait(); err != nil {
			return err
		}
		return fmt.Errorf("MCP HTTP 子进程已退出")
	case <-readyCtx.Done():
		return readyCtx.Err()
	}
}

func waitMCPHTTPHealthEndpoint(ctx context.Context, healthURL string) error {
	client := http.Client{Timeout: 300 * time.Millisecond}
	var lastErr error
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
		if err != nil {
			return err
		}
		resp, err := client.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
			lastErr = fmt.Errorf("healthz 返回 HTTP %d", resp.StatusCode)
		} else {
			lastErr = err
		}

		select {
		case <-ctx.Done():
			if lastErr != nil {
				return lastErr
			}
			return ctx.Err()
		case <-time.After(120 * time.Millisecond):
		}
	}
}

func statusFromMCPHTTPOptions(options mcpHTTPProcessStartOptions, token string) ai.MCPHTTPServerStatus {
	return ai.MCPHTTPServerStatus{
		Running:             true,
		Addr:                options.Addr,
		Path:                options.Path,
		URL:                 buildMCPHTTPURL(options.Addr, options.Path),
		SchemaOnly:          true,
		Token:               token,
		AuthorizationHeader: "Bearer " + token,
		StartedAt:           time.Now().UnixMilli(),
		Message:             "GoNavi MCP HTTP 服务已启动",
	}
}

func generateMCPHTTPToken() (string, error) {
	var bytes [24]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("生成 MCP HTTP Token 失败: %w", err)
	}
	return "gnv_" + base64.RawURLEncoding.EncodeToString(bytes[:]), nil
}

func defaultMCPHTTPServerStatus() ai.MCPHTTPServerStatus {
	return ai.MCPHTTPServerStatus{
		Running:    false,
		Addr:       defaultMCPHTTPAddr,
		Path:       defaultMCPHTTPPath,
		URL:        buildMCPHTTPURL(defaultMCPHTTPAddr, defaultMCPHTTPPath),
		SchemaOnly: true,
		Message:    "GoNavi MCP HTTP 服务未启动",
	}
}

func stoppedMCPHTTPStatus(status ai.MCPHTTPServerStatus, message string) ai.MCPHTTPServerStatus {
	status.Running = false
	if strings.TrimSpace(status.Token) != "" {
		status.AuthorizationHeader = "Bearer " + strings.TrimSpace(status.Token)
	}
	status.Message = message
	return status
}

func buildMCPHTTPURL(addr string, path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		path = defaultMCPHTTPPath
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	host, port, err := net.SplitHostPort(strings.TrimSpace(addr))
	if err != nil {
		return "http://" + strings.TrimSpace(addr) + path
	}
	host = strings.Trim(host, "[]")
	if host == "" || host == "::" || host == "0.0.0.0" {
		host = "127.0.0.1"
	}
	return "http://" + net.JoinHostPort(host, port) + path
}
