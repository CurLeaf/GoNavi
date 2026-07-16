package nativewindow

import (
	"strings"
)

const (
	// DetachedWindowArgument selects the native detached-window child mode.
	DetachedWindowArgument = "--detached-window"

	HeaderToken    = "X-GoNavi-Detached-Token"
	HeaderWindowID = "X-GoNavi-Detached-Window-ID"

	BootstrapPath = "/__gonavi/detached/bootstrap"
	ActionPath    = "/__gonavi/detached/action"
	ControlPath   = "/__gonavi/detached/control"
	RuntimePath   = "/__gonavi/detached-runtime.js"
	InvokePath    = "/__gonavi/api/invoke"
	EventsPath    = "/__gonavi/events"

	MainEventName    = "gonavi:native-detached-event"
	CommandEventName = "gonavi:native-detached-command"

	ExitReasonRequested      = "requested"
	ExitReasonWindowClosed   = "window-closed"
	ExitReasonAttached       = "attached"
	ExitReasonParentShutdown = "parent-shutdown"
	ExitReasonProcessError   = "process-error"
)

const (
	defaultWindowWidth  = 1080
	defaultWindowHeight = 720
	// Detached query results can be substantially larger than ordinary RPC
	// payloads. Keep one shared ceiling for child actions and parent responses.
	maxDetachedJSONBytes int64 = 512 << 20
)

// OpenRequest describes one independently movable native window. X and Y use
// virtual-desktop coordinates and deliberately allow negative values.
type OpenRequest struct {
	ID      string `json:"id,omitempty"`
	Kind    string `json:"kind"`
	Title   string `json:"title"`
	Payload any    `json:"payload,omitempty"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
}

// WindowInfo is the serialisable view of a registered child process.
type WindowInfo struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	PID       int    `json:"pid,omitempty"`
	OpenedAt  int64  `json:"openedAt"`
	Ready     bool   `json:"ready"`
	CloseSent bool   `json:"closeSent"`
}

// Bootstrap is fetched by the child after Wails has installed its native
// runtime and bindings.
type Bootstrap struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Title   string `json:"title"`
	Payload any    `json:"payload,omitempty"`
}

// OperationResult is returned by the Wails-bound Manager commands.
type OperationResult struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	ID      string `json:"id,omitempty"`
}

// Event is emitted to the main Wails window. Action mirrors the detached HTTP
// action protocol so the frontend can use one reducer for child messages and
// process-exit notifications.
type Event struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Action  string `json:"action"`
	Payload any    `json:"payload,omitempty"`
}

type actionRequest struct {
	Action  string `json:"action"`
	Payload any    `json:"payload,omitempty"`
}

type controlRequest struct {
	Action  string      `json:"action"`
	ID      string      `json:"id,omitempty"`
	Request OpenRequest `json:"request,omitempty"`
}

type childCommand struct {
	ID     string `json:"id"`
	Action string `json:"action"`
}

func normalizeOpenRequest(request OpenRequest) OpenRequest {
	request.Kind = strings.TrimSpace(request.Kind)
	request.Title = strings.TrimSpace(request.Title)
	if request.Kind == "" {
		request.Kind = "workbench"
	}
	if request.Title == "" {
		request.Title = "GoNavi"
	}
	if request.Width <= 0 {
		request.Width = defaultWindowWidth
	}
	if request.Height <= 0 {
		request.Height = defaultWindowHeight
	}
	return request
}
