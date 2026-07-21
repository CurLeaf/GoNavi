package nativewindow

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDetachedChildQueuesFocusUntilFrontendReadyHandshake(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)

	shows := 0
	focuses := 0
	control.showWindow = func(context.Context) { shows++ }
	control.focusWindow = func(context.Context) { focuses++ }

	control.markDOMReady(ctx)
	if result := control.Focus(); !result.Success {
		t.Fatalf("pre-ready Focus result = %#v", result)
	}
	if shows != 0 || focuses != 0 {
		t.Fatalf("pre-ready presentation = show %d focus %d, want 0/0", shows, focuses)
	}

	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("ready Action result = %#v", result)
	}
	if shows != 1 || focuses != 1 {
		t.Fatalf("ready presentation = show %d focus %d, want 1/1", shows, focuses)
	}

	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("repeated ready Action result = %#v", result)
	}
	if shows != 1 || focuses != 1 {
		t.Fatalf("repeated ready presentation = show %d focus %d, want 1/1", shows, focuses)
	}
}

func TestDetachedChildShowsAfterReadyAndFocusesWithoutShowingAgain(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)

	shows := 0
	focuses := 0
	control.showWindow = func(context.Context) { shows++ }
	control.focusWindow = func(context.Context) { focuses++ }

	control.markDOMReady(ctx)
	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("ready Action result = %#v", result)
	}
	if shows != 1 || focuses != 0 {
		t.Fatalf("ready presentation = show %d focus %d, want 1/0", shows, focuses)
	}

	if result := control.Focus(); !result.Success {
		t.Fatalf("post-ready Focus result = %#v", result)
	}
	if shows != 1 || focuses != 1 {
		t.Fatalf("post-ready presentation = show %d focus %d, want 1/1", shows, focuses)
	}

	if result := control.Focus(); !result.Success {
		t.Fatalf("later Focus result = %#v", result)
	}
	if shows != 1 || focuses != 2 {
		t.Fatalf("later presentation = show %d focus %d, want 1/2", shows, focuses)
	}
}

func TestDetachedChildAcknowledgesFocusOnlyAfterDelayedPresentation(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)

	steps := make([]string, 0, 4)
	control.showWindow = func(context.Context) { steps = append(steps, "show") }
	control.focusWindow = func(context.Context) { steps = append(steps, "focus") }
	bridge.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		switch request.URL.Path {
		case CommandStatePath:
			var acknowledgement commandStateRequest
			if err := json.NewDecoder(request.Body).Decode(&acknowledgement); err != nil {
				return nil, err
			}
			steps = append(steps, "ack-focus")
			if acknowledgement.Action != "ack-focus" || acknowledgement.VisibilityRevision != 7 {
				t.Fatalf("focus acknowledgement = %#v", acknowledgement)
			}
		case ActionPath:
			steps = append(steps, "post-ready")
		}
		return successfulVisibilityResponse(), nil
	})

	if result := control.FocusRevision(7); !result.Success {
		t.Fatalf("pre-ready FocusRevision result = %#v", result)
	}
	if len(steps) != 0 {
		t.Fatalf("pre-ready steps = %#v, want none", steps)
	}
	control.markDOMReady(ctx)
	if len(steps) != 0 {
		t.Fatalf("DOM-ready steps = %#v, want none before frontend presentation", steps)
	}
	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("ready Action result = %#v", result)
	}
	if got := strings.Join(steps, ","); got != "show,focus,ack-focus,post-ready" {
		t.Fatalf("delayed focus sequence = %q", got)
	}
}

func TestDetachedChildFailedFocusAcknowledgementLeavesParentPendingForRetry(t *testing.T) {
	manager := newHTTPTestManager(t)
	manager.windows["ai-chat"] = &windowEntry{
		info:                 WindowInfo{ID: "ai-chat", Kind: "ai-chat", Ready: true},
		visibilityRevision:   7,
		pendingFocusRevision: 7,
	}
	bridge := newBridge(ChildOptions{
		ParentURL: "http://127.0.0.1:43119",
		Token:     manager.token,
		ID:        "ai-chat",
		Kind:      "ai-chat",
	})
	control := newControl(bridge)
	ctx := context.Background()
	InitializeControl(control, ctx)
	control.showWindow = func(context.Context) {}
	focuses := 0
	control.focusWindow = func(context.Context) { focuses++ }
	control.markDOMReady(ctx)
	if result := control.markFrontendReady(); !result.Success {
		t.Fatalf("markFrontendReady result = %#v", result)
	}

	failAcknowledgement := true
	bridge.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if failAcknowledgement {
			return nil, errors.New("temporary parent connection failure")
		}
		request.RemoteAddr = "127.0.0.1:51003"
		recorder := httptest.NewRecorder()
		manager.authenticatedHandler().ServeHTTP(recorder, request)
		return recorder.Result(), nil
	})

	if result := control.FocusRevision(7); !result.Success {
		t.Fatalf("FocusRevision with failed acknowledgement = %#v", result)
	}
	manager.mu.RLock()
	pendingAfterFailure := manager.windows["ai-chat"].pendingFocusRevision
	manager.mu.RUnlock()
	if pendingAfterFailure != 7 {
		t.Fatalf("pending focus after failed acknowledgement = %d, want 7", pendingAfterFailure)
	}

	failAcknowledgement = false
	if result := control.FocusRevision(7); !result.Success {
		t.Fatalf("FocusRevision retry result = %#v", result)
	}
	manager.mu.RLock()
	pendingAfterRetry := manager.windows["ai-chat"].pendingFocusRevision
	manager.mu.RUnlock()
	if pendingAfterRetry != 0 || focuses != 2 {
		t.Fatalf("retry state = pending %d focuses %d, want 0/2", pendingAfterRetry, focuses)
	}
}

func TestDetachedChildIgnoresLateHideAfterNewerFocus(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)

	shows := 0
	hides := 0
	focuses := 0
	control.showWindow = func(context.Context) { shows++ }
	control.hideWindow = func(context.Context) { hides++ }
	control.focusWindow = func(context.Context) { focuses++ }
	control.markDOMReady(ctx)
	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("ready Action result = %#v", result)
	}

	if result := control.Hide(1); !result.Success || result.VisibilityRevision != 1 {
		t.Fatalf("Hide result = %#v", result)
	}
	if hides != 1 {
		t.Fatalf("hides after revision 1 = %d, want 1", hides)
	}
	if result := control.FocusRevision(2); !result.Success || result.VisibilityRevision != 2 {
		t.Fatalf("FocusRevision result = %#v", result)
	}
	if shows != 2 || focuses != 1 {
		t.Fatalf("presentation after focus = show %d focus %d, want 2/1", shows, focuses)
	}

	lateHide := control.Hide(1)
	if !lateHide.Success || lateHide.VisibilityRevision != 2 ||
		!strings.Contains(lateHide.Message, "stale") {
		t.Fatalf("late Hide result = %#v", lateHide)
	}
	if hides != 1 {
		t.Fatalf("late hide reached native window: hides = %d, want 1", hides)
	}
	control.mu.RLock()
	visible := control.visible
	revision := control.visibilityRevision
	control.mu.RUnlock()
	if !visible || revision != 2 {
		t.Fatalf("final visibility state = visible %v revision %d", visible, revision)
	}
}

func TestDetachedChildPresentsBeforePaintReadyWithoutShowingTwice(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)
	control.markDOMReady(ctx)

	shows := 0
	control.showWindow = func(context.Context) { shows++ }
	if result := control.Present(); !result.Success {
		t.Fatalf("Present result = %#v", result)
	}
	if shows != 1 {
		t.Fatalf("present shows = %d, want 1", shows)
	}

	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("ready Action result = %#v", result)
	}
	if shows != 1 {
		t.Fatalf("post-ready shows = %d, want 1", shows)
	}
}

func TestDetachedChildPresentConsumesQueuedFocus(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)

	shows := 0
	focuses := 0
	control.showWindow = func(context.Context) { shows++ }
	control.focusWindow = func(context.Context) { focuses++ }
	control.markDOMReady(ctx)

	if result := control.Focus(); !result.Success {
		t.Fatalf("pre-present Focus result = %#v", result)
	}
	if shows != 0 || focuses != 0 {
		t.Fatalf("queued focus presentation = show %d focus %d, want 0/0", shows, focuses)
	}
	if result := control.Present(); !result.Success {
		t.Fatalf("Present result = %#v", result)
	}
	if shows != 1 || focuses != 1 {
		t.Fatalf("presented queued focus = show %d focus %d, want 1/1", shows, focuses)
	}

	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("ready Action result = %#v", result)
	}
	if shows != 1 || focuses != 1 {
		t.Fatalf("post-ready presentation = show %d focus %d, want 1/1", shows, focuses)
	}
	if result := control.Focus(); !result.Success {
		t.Fatalf("post-ready Focus result = %#v", result)
	}
	if shows != 1 || focuses != 2 {
		t.Fatalf("repeated focus presentation = show %d focus %d, want 1/2", shows, focuses)
	}
}

func TestDetachedChildWaitsForDOMReadyEvenAfterFrontendHandshake(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)

	shows := 0
	focuses := 0
	posts := 0
	control.showWindow = func(context.Context) { shows++ }
	control.focusWindow = func(context.Context) { focuses++ }
	bridge.client.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		posts++
		return successfulVisibilityResponse(), nil
	})

	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); result.Success {
		t.Fatalf("pre-DOM ready Action result = %#v, want failure", result)
	}
	if result := control.Focus(); !result.Success {
		t.Fatalf("pre-DOM Focus result = %#v", result)
	}
	if shows != 0 || focuses != 0 || posts != 0 {
		t.Fatalf("pre-DOM state = show %d focus %d post %d, want 0/0/0", shows, focuses, posts)
	}

	control.markDOMReady(ctx)
	if shows != 0 || focuses != 0 || posts != 0 {
		t.Fatalf("DOM-ready state before retry = show %d focus %d post %d, want 0/0/0", shows, focuses, posts)
	}
	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("retried ready Action result = %#v", result)
	}
	if shows != 1 || focuses != 1 {
		t.Fatalf("DOM-ready presentation = show %d focus %d, want 1/1", shows, focuses)
	}
	if posts != 1 {
		t.Fatalf("parent ready posts = %d, want 1", posts)
	}
}

func TestDetachedChildShowsBeforePostingParentReady(t *testing.T) {
	bridge, control := newVisibilityTestChild()
	ctx := context.Background()
	InitializeControl(control, ctx)
	control.markDOMReady(ctx)

	steps := make([]string, 0, 2)
	control.showWindow = func(context.Context) {
		steps = append(steps, "show")
	}
	bridge.client.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		steps = append(steps, "post-parent-ready")
		return successfulVisibilityResponse(), nil
	})

	if result := bridge.Action("ready", map[string]any{"id": "window-1"}); !result.Success {
		t.Fatalf("ready Action result = %#v", result)
	}
	if got := strings.Join(steps, ","); got != "show,post-parent-ready" {
		t.Fatalf("ready sequence = %q, want show,post-parent-ready", got)
	}
}

func newVisibilityTestChild() (*Bridge, *Control) {
	bridge := newBridge(ChildOptions{
		ParentURL: "http://127.0.0.1:43119",
		Token:     "test-token",
		ID:        "window-1",
		Kind:      "workbench",
	})
	bridge.client.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		return successfulVisibilityResponse(), nil
	})
	control := newControl(bridge)
	bridge.setReadyHandler(control.markFrontendReady)
	return bridge, control
}

func successfulVisibilityResponse() *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"success":true,"id":"window-1"}`)),
		Header:     make(http.Header),
	}
}
