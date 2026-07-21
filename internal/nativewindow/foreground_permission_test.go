package nativewindow

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestBridgeAllowsParentForegroundImmediatelyBeforeOpeningAISettings(t *testing.T) {
	bridge := newBridge(ChildOptions{
		ParentURL: "http://127.0.0.1:43119",
		Token:     "test-token",
		ID:        "ai-chat",
		Kind:      "ai-chat",
	})
	steps := make([]string, 0, 2)
	bridge.allowParentForeground = func() error {
		steps = append(steps, "allow-parent-foreground")
		return nil
	}
	bridge.client.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		steps = append(steps, "post-action")
		return successfulForegroundActionResponse(), nil
	})

	if result := bridge.Action("open-ai-settings", map[string]any{"id": "ai-chat"}); !result.Success {
		t.Fatalf("open-ai-settings result = %#v", result)
	}
	if got := strings.Join(steps, ","); got != "allow-parent-foreground,post-action" {
		t.Fatalf("open-ai-settings sequence = %q", got)
	}
}

func TestBridgeStillOpensAISettingsWhenForegroundPermissionFails(t *testing.T) {
	bridge := newBridge(ChildOptions{ParentURL: "http://127.0.0.1:43119", ID: "ai-chat", Kind: "ai-chat"})
	bridge.allowParentForeground = func() error {
		return errors.New("permission denied")
	}
	posts := 0
	bridge.client.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		posts++
		return successfulForegroundActionResponse(), nil
	})

	if result := bridge.Action("open-ai-settings", nil); !result.Success {
		t.Fatalf("open-ai-settings result = %#v", result)
	}
	if posts != 1 {
		t.Fatalf("parent action posts = %d, want 1", posts)
	}
}

func TestBridgeDoesNotGrantForegroundForOtherActions(t *testing.T) {
	bridge := newBridge(ChildOptions{ParentURL: "http://127.0.0.1:43119", ID: "ai-chat", Kind: "ai-chat"})
	grants := 0
	bridge.allowParentForeground = func() error {
		grants++
		return nil
	}
	bridge.client.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		return successfulForegroundActionResponse(), nil
	})

	for _, action := range []string{"sync", "attach", "close", "host-event"} {
		if result := bridge.Action(action, nil); !result.Success {
			t.Fatalf("%s result = %#v", action, result)
		}
	}
	if grants != 0 {
		t.Fatalf("foreground grants = %d, want 0", grants)
	}
}

func successfulForegroundActionResponse() *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(`{"success":true,"id":"ai-chat"}`)),
		Header:     make(http.Header),
	}
}
