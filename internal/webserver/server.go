package webserver

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path"
	"reflect"
	"strings"
	"sync"
	"time"

	aiservice "GoNavi-Wails/internal/ai/service"
	appcore "GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/uievents"
)

const (
	defaultWebServerAddr = "127.0.0.1:34116"
	internalRoutePrefix  = "/__gonavi"
)

var errorType = reflect.TypeOf((*error)(nil)).Elem()

type Options struct {
	Addr string
}

type invokeRequest struct {
	Namespace string            `json:"namespace"`
	Receiver  string            `json:"receiver"`
	Method    string            `json:"method"`
	Args      []json.RawMessage `json:"args"`
}

type invokeResponse struct {
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

type eventMessage struct {
	Name string `json:"name"`
	Args []any  `json:"args,omitempty"`
}

type eventHub struct {
	mu          sync.RWMutex
	subscribers map[chan eventMessage]struct{}
}

func newEventHub() *eventHub {
	return &eventHub{subscribers: make(map[chan eventMessage]struct{})}
}

func (h *eventHub) Emit(name string, args ...any) {
	if h == nil || strings.TrimSpace(name) == "" {
		return
	}
	msg := eventMessage{Name: name, Args: args}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subscribers {
		select {
		case ch <- msg:
		default:
		}
	}
}

func (h *eventHub) subscribe() chan eventMessage {
	ch := make(chan eventMessage, 128)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *eventHub) unsubscribe(ch chan eventMessage) {
	if ch == nil {
		return
	}
	h.mu.Lock()
	if _, ok := h.subscribers[ch]; ok {
		delete(h.subscribers, ch)
		close(ch)
	}
	h.mu.Unlock()
}

type methodInvoker struct {
	targets map[string]reflect.Value
}

func newMethodInvoker(app *appcore.App, ai *aiservice.Service) *methodInvoker {
	return &methodInvoker{
		targets: map[string]reflect.Value{
			"app.app":           reflect.ValueOf(app),
			"app":               reflect.ValueOf(app),
			"aiservice.service": reflect.ValueOf(ai),
			"aiservice":         reflect.ValueOf(ai),
		},
	}
}

func (i *methodInvoker) Invoke(req invokeRequest) (any, error) {
	if i == nil {
		return nil, fmt.Errorf("web invoker is not initialized")
	}
	namespace := strings.ToLower(strings.TrimSpace(req.Namespace))
	receiver := strings.ToLower(strings.TrimSpace(req.Receiver))
	methodName := strings.TrimSpace(req.Method)
	if namespace == "" || methodName == "" {
		return nil, fmt.Errorf("invalid invoke request")
	}

	key := namespace
	if receiver != "" {
		key = namespace + "." + receiver
	}
	target, ok := i.targets[key]
	if !ok {
		return nil, fmt.Errorf("unsupported invoke target: %s.%s", namespace, receiver)
	}

	method := target.MethodByName(methodName)
	if !method.IsValid() {
		return nil, fmt.Errorf("unsupported method: %s.%s.%s", namespace, receiver, methodName)
	}

	methodType := method.Type()
	if methodType.IsVariadic() {
		return nil, fmt.Errorf("variadic methods are not supported: %s", methodName)
	}
	if methodType.NumIn() != len(req.Args) {
		return nil, fmt.Errorf("invalid argument count for %s: want %d got %d", methodName, methodType.NumIn(), len(req.Args))
	}

	callArgs := make([]reflect.Value, 0, len(req.Args))
	for index, raw := range req.Args {
		argValue, err := decodeArgument(raw, methodType.In(index))
		if err != nil {
			return nil, fmt.Errorf("decode argument %d for %s failed: %w", index, methodName, err)
		}
		callArgs = append(callArgs, argValue)
	}

	results := method.Call(callArgs)
	return unpackResults(results)
}

func decodeArgument(raw json.RawMessage, targetType reflect.Type) (reflect.Value, error) {
	holder := reflect.New(targetType)
	if len(raw) == 0 {
		return holder.Elem(), nil
	}
	if err := json.Unmarshal(raw, holder.Interface()); err != nil {
		return reflect.Value{}, err
	}
	return holder.Elem(), nil
}

func unpackResults(results []reflect.Value) (any, error) {
	if len(results) == 0 {
		return nil, nil
	}

	last := results[len(results)-1]
	if last.IsValid() && last.Type().Implements(errorType) {
		if !last.IsNil() {
			return nil, last.Interface().(error)
		}
		results = results[:len(results)-1]
	}

	switch len(results) {
	case 0:
		return nil, nil
	case 1:
		return results[0].Interface(), nil
	default:
		unpacked := make([]any, len(results))
		for index := range results {
			unpacked[index] = results[index].Interface()
		}
		return unpacked, nil
	}
}

type Server struct {
	options Options
	assets  fs.FS
	app     *appcore.App
	ai      *aiservice.Service
	auth    *webAuthManager
	events  *eventHub
	invoker *methodInvoker
}

func ParseOptions(args []string) (Options, error) {
	options := Options{
		Addr: defaultWebServerAddr,
	}
	if envAddr := strings.TrimSpace(os.Getenv("GONAVI_WEB_ADDR")); envAddr != "" {
		options.Addr = envAddr
	}
	fs := flag.NewFlagSet("gonavi web-server", flag.ContinueOnError)
	fs.SetOutput(ioDiscard{})
	fs.StringVar(&options.Addr, "addr", options.Addr, "web server listen address, for example 127.0.0.1:34116")
	if err := fs.Parse(args); err != nil {
		return Options{}, err
	}
	if fs.NArg() > 0 {
		return Options{}, fmt.Errorf("unknown web-server arguments: %s", strings.Join(fs.Args(), " "))
	}
	return options, nil
}

func Run(ctx context.Context, assetFS fs.FS, args []string) error {
	options, err := ParseOptions(args)
	if err != nil {
		return err
	}
	server, err := New(ctx, assetFS, options)
	if err != nil {
		return err
	}
	return server.Run(ctx)
}

func New(ctx context.Context, assetFS fs.FS, options Options) (*Server, error) {
	if assetFS == nil {
		return nil, fmt.Errorf("web assets are unavailable")
	}
	frontendFS, err := fs.Sub(assetFS, "frontend/dist")
	if err != nil {
		return nil, fmt.Errorf("resolve frontend dist assets failed: %w", err)
	}

	events := newEventHub()
	lifecycleCtx := uievents.WithEmitter(ctx, events)

	app := appcore.NewApp()
	appcore.InitializeLifecycle(app, lifecycleCtx)
	ai := aiservice.NewService()
	aiservice.InitializeLifecycle(ai, lifecycleCtx)
	auth, err := newWebAuthManager("")
	if err != nil {
		return nil, fmt.Errorf("initialize web auth failed: %w", err)
	}

	return &Server{
		options: options,
		assets:  frontendFS,
		app:     app,
		ai:      ai,
		auth:    auth,
		events:  events,
		invoker: newMethodInvoker(app, ai),
	}, nil
}

func (s *Server) Run(ctx context.Context) error {
	if s == nil {
		return fmt.Errorf("web server is not initialized")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	defer s.ai.Shutdown()
	defer s.app.Shutdown()

	httpServer := &http.Server{
		Addr:              s.options.Addr,
		Handler:           s.routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	listener, err := net.Listen("tcp", s.options.Addr)
	if err != nil {
		return err
	}
	logger.Infof("GoNavi Web Server 启动：addr=%s", listener.Addr().String())

	errCh := make(chan error, 1)
	go func() {
		errCh <- httpServer.Serve(listener)
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
		shutdownErr := httpServer.Shutdown(shutdownCtx)
		serveErr := <-errCh
		if shutdownErr != nil && !errors.Is(shutdownErr, http.ErrServerClosed) {
			return shutdownErr
		}
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			return serveErr
		}
		return nil
	}
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(internalRoutePrefix+"/auth/status", s.handleAuthStatus)
	mux.HandleFunc(internalRoutePrefix+"/auth/setup/bootstrap", s.handleSetupBootstrap)
	mux.HandleFunc(internalRoutePrefix+"/auth/setup/complete", s.handleSetupComplete)
	mux.HandleFunc(internalRoutePrefix+"/auth/login", s.handleLogin)
	mux.HandleFunc(internalRoutePrefix+"/auth/logout", s.handleLogout)
	mux.Handle(internalRoutePrefix+"/auth/settings", s.requireWebAuth(http.HandlerFunc(s.handleAuthSettings)))
	mux.Handle(internalRoutePrefix+"/auth/settings/password", s.requireWebAuth(http.HandlerFunc(s.handleAuthPasswordChange)))
	mux.Handle(internalRoutePrefix+"/api/invoke", s.requireWebAuth(http.HandlerFunc(s.handleInvoke)))
	mux.Handle(internalRoutePrefix+"/events", s.requireWebAuth(http.HandlerFunc(s.handleEvents)))
	mux.Handle(internalRoutePrefix+"/web-runtime.js", s.requireWebAuth(http.HandlerFunc(s.handleRuntimeBridge)))
	mux.HandleFunc(internalRoutePrefix+"/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/login", s.handleLoginPage)
	mux.HandleFunc("/setup", s.handleSetupPage)
	fileServer := http.FileServer(http.FS(s.assets))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, internalRoutePrefix+"/") {
			http.NotFound(w, r)
			return
		}
		status := s.auth.Status(func() string {
			sessionID, _ := readSessionCookie(r)
			return sessionID
		}())
		if !status.Configured {
			http.Redirect(w, r, buildAuthRedirectURL("/setup", r.URL.RequestURI()), http.StatusSeeOther)
			return
		}
		if !status.Authenticated {
			clearSessionCookie(w, r)
			http.Redirect(w, r, buildAuthRedirectURL("/login", r.URL.RequestURI()), http.StatusSeeOther)
			return
		}
		if s.shouldServeIndex(r.URL.Path) {
			s.serveIndex(w, r)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
	return withSecurityHeaders(mux)
}

func (s *Server) shouldServeIndex(requestPath string) bool {
	cleaned := strings.TrimPrefix(path.Clean("/"+requestPath), "/")
	if cleaned == "" || cleaned == "." {
		return true
	}
	if strings.Contains(path.Base(cleaned), ".") {
		file, err := s.assets.Open(cleaned)
		if err != nil {
			return false
		}
		defer file.Close()
		info, err := file.Stat()
		return err == nil && info.IsDir()
	}
	return true
}

func (s *Server) serveIndex(w http.ResponseWriter, r *http.Request) {
	payload, err := fs.ReadFile(s.assets, "index.html")
	if err != nil {
		http.Error(w, "frontend index is unavailable", http.StatusInternalServerError)
		return
	}
	html := injectRuntimeBridge(string(payload))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	http.ServeContent(w, r, "index.html", time.Time{}, strings.NewReader(html))
}

func injectRuntimeBridge(indexHTML string) string {
	if strings.Contains(indexHTML, internalRoutePrefix+"/web-runtime.js") {
		return indexHTML
	}
	scriptTag := fmt.Sprintf(`<script src="%s/web-runtime.js"></script>`, internalRoutePrefix)
	if strings.Contains(indexHTML, "</head>") {
		return strings.Replace(indexHTML, "</head>", scriptTag+"\n</head>", 1)
	}
	return scriptTag + "\n" + indexHTML
}

func (s *Server) handleInvoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	defer r.Body.Close()

	var request invokeRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		s.writeInvokeResponse(w, http.StatusBadRequest, invokeResponse{Error: err.Error()})
		return
	}
	result, err := s.invoker.Invoke(request)
	if err != nil {
		s.writeInvokeResponse(w, http.StatusBadRequest, invokeResponse{Error: err.Error()})
		return
	}
	s.writeInvokeResponse(w, http.StatusOK, invokeResponse{Result: result})
}

func (s *Server) writeInvokeResponse(w http.ResponseWriter, status int, response invokeResponse) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(response)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := s.events.subscribe()
	defer s.events.unsubscribe(ch)

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	_, _ = w.Write([]byte(": connected\n\n"))
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			_, _ = w.Write([]byte(": ping\n\n"))
			flusher.Flush()
		case msg, ok := <-ch:
			if !ok {
				return
			}
			payload, err := json.Marshal(msg)
			if err != nil {
				continue
			}
			_, _ = fmt.Fprintf(w, "event: gonavi\ndata: %s\n\n", payload)
			flusher.Flush()
		}
	}
}

func (s *Server) handleRuntimeBridge(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	_, _ = w.Write([]byte(runtimeBridgeScript()))
}

type ioDiscard struct{}

func (ioDiscard) Write(p []byte) (int, error) {
	return len(p), nil
}
