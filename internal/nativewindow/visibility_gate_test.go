package nativewindow

import (
	"context"
	"io"
	"net/http"
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
