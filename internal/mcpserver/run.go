package mcpserver

import (
	"context"
	"crypto/subtle"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	defaultStreamableHTTPAddr = "127.0.0.1:8765"
	defaultStreamableHTTPPath = "/mcp"
)

// HTTPServerOptions 描述远程 Streamable HTTP MCP 入口。
type HTTPServerOptions struct {
	Addr         string
	Path         string
	Token        string
	JSONResponse bool
	SchemaOnly   bool
}

// RunAppStdioServer 启动基于真实 GoNavi App 的 stdio MCP server。
func RunAppStdioServer(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}

	backend := NewAppBackend(ctx)
	defer backend.Close(ctx)

	return RunStdioServer(ctx, backend)
}

// RunStdioServer 使用指定 backend 启动 stdio MCP server。
func RunStdioServer(ctx context.Context, backend Backend) error {
	if ctx == nil {
		ctx = context.Background()
	}

	server := NewServer(backend)
	return server.Run(ctx, &mcp.StdioTransport{})
}

// RunAppStreamableHTTPServer 启动基于真实 GoNavi App 的 Streamable HTTP MCP server。
func RunAppStreamableHTTPServer(ctx context.Context, options HTTPServerOptions) error {
	if ctx == nil {
		ctx = context.Background()
	}

	backend := NewAppBackend(ctx)
	defer backend.Close(ctx)

	return RunStreamableHTTPServer(ctx, backend, options)
}

// RunStreamableHTTPServer 使用指定 backend 启动带 bearer token 的 Streamable HTTP MCP server。
func RunStreamableHTTPServer(ctx context.Context, backend Backend, options HTTPServerOptions) error {
	if ctx == nil {
		ctx = context.Background()
	}

	normalized, err := normalizeHTTPServerOptions(options)
	if err != nil {
		return err
	}

	server := NewServerWithOptions(backend, ServerOptions{SchemaOnly: normalized.SchemaOnly})
	streamableHandler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, &mcp.StreamableHTTPOptions{
		JSONResponse:   normalized.JSONResponse,
		SessionTimeout: 30 * time.Minute,
	})

	mux := http.NewServeMux()
	mux.Handle(normalized.Path, bearerTokenAuthHandler(normalized.Token, streamableHandler))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = io.WriteString(w, "ok")
	})

	httpServer := &http.Server{
		Addr:              normalized.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}

// ParseHTTPServerOptions 解析 http 模式参数，并支持环境变量兜底。
func ParseHTTPServerOptions(args []string) (HTTPServerOptions, error) {
	defaultAddr := strings.TrimSpace(os.Getenv("GONAVI_MCP_HTTP_ADDR"))
	if defaultAddr == "" {
		defaultAddr = defaultStreamableHTTPAddr
	}
	defaultPath := strings.TrimSpace(os.Getenv("GONAVI_MCP_HTTP_PATH"))
	if defaultPath == "" {
		defaultPath = defaultStreamableHTTPPath
	}

	options := HTTPServerOptions{
		Addr:         defaultAddr,
		Path:         defaultPath,
		Token:        strings.TrimSpace(os.Getenv("GONAVI_MCP_HTTP_TOKEN")),
		JSONResponse: true,
		SchemaOnly:   parseBoolEnvDefault("GONAVI_MCP_SCHEMA_ONLY", false),
	}
	fs := flag.NewFlagSet("gonavi-mcp-server http", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.StringVar(&options.Addr, "addr", options.Addr, "HTTP listen address, for example 127.0.0.1:8765")
	fs.StringVar(&options.Path, "path", options.Path, "HTTP MCP path")
	fs.StringVar(&options.Token, "token", options.Token, "bearer token required by remote MCP clients")
	fs.BoolVar(&options.JSONResponse, "json-response", options.JSONResponse, "return application/json streamable responses when possible")
	fs.BoolVar(&options.SchemaOnly, "schema-only", options.SchemaOnly, "only expose schema inspection tools and omit execute_sql")
	if err := fs.Parse(args); err != nil {
		return HTTPServerOptions{}, err
	}
	if fs.NArg() > 0 {
		return HTTPServerOptions{}, fmt.Errorf("未知 http 参数: %s", strings.Join(fs.Args(), " "))
	}
	return options, nil
}

func parseBoolEnvDefault(name string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func normalizeHTTPServerOptions(options HTTPServerOptions) (HTTPServerOptions, error) {
	options.Addr = strings.TrimSpace(options.Addr)
	if options.Addr == "" {
		options.Addr = defaultStreamableHTTPAddr
	}
	options.Path = strings.TrimSpace(options.Path)
	if options.Path == "" {
		options.Path = defaultStreamableHTTPPath
	}
	if !strings.HasPrefix(options.Path, "/") {
		options.Path = "/" + options.Path
	}
	options.Token = strings.TrimSpace(options.Token)
	if options.Token == "" {
		return HTTPServerOptions{}, errors.New("远程 MCP HTTP 模式必须设置 bearer token，可使用 --token 或 GONAVI_MCP_HTTP_TOKEN")
	}
	return options, nil
}

func bearerTokenAuthHandler(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if !hasBearerToken(req, token) {
			w.Header().Set("WWW-Authenticate", `Bearer realm="GoNavi MCP"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, req)
	})
}

func hasBearerToken(req *http.Request, token string) bool {
	if req == nil {
		return false
	}
	expected := strings.TrimSpace(token)
	if expected == "" {
		return false
	}
	header := strings.TrimSpace(req.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return false
	}
	actual := strings.TrimSpace(header[len("bearer "):])
	if actual == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) == 1
}
