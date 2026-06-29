package app

import (
	"context"
	"testing"
)

func TestApplicationBeforeCloseEmitsPromptOnceUntilCancelled(t *testing.T) {
	originalEmit := emitApplicationBeforeCloseRequest
	originalQuit := quitApplicationRuntime
	t.Cleanup(func() {
		emitApplicationBeforeCloseRequest = originalEmit
		quitApplicationRuntime = originalQuit
	})

	var emitted []string
	emitApplicationBeforeCloseRequest = func(_ context.Context, eventName string, _ ...interface{}) {
		emitted = append(emitted, eventName)
	}
	quitApplicationRuntime = func(context.Context) {}

	app := NewAppWithSecretStore(nil)
	handler := NewBeforeCloseHandler(app)

	if prevent := handler(context.Background()); !prevent {
		t.Fatal("expected first close request to be prevented")
	}
	if len(emitted) != 1 || emitted[0] != applicationBeforeCloseRequestEvent {
		t.Fatalf("expected one before-close event, got %#v", emitted)
	}
	if prevent := handler(context.Background()); !prevent {
		t.Fatal("expected repeated close request to stay prevented while prompt is open")
	}
	if len(emitted) != 1 {
		t.Fatalf("expected no duplicate prompt event, got %#v", emitted)
	}

	result := app.CancelApplicationQuit()
	if !result.Success {
		t.Fatalf("expected cancel quit success, got %#v", result)
	}
	if prevent := handler(context.Background()); !prevent {
		t.Fatal("expected close request after cancellation to be prevented again")
	}
	if len(emitted) != 2 {
		t.Fatalf("expected prompt event after cancellation, got %#v", emitted)
	}
}

func TestForceQuitApplicationAllowsNextCloseRequest(t *testing.T) {
	originalEmit := emitApplicationBeforeCloseRequest
	originalQuit := quitApplicationRuntime
	t.Cleanup(func() {
		emitApplicationBeforeCloseRequest = originalEmit
		quitApplicationRuntime = originalQuit
	})

	emitApplicationBeforeCloseRequest = func(context.Context, string, ...interface{}) {}
	quitCalls := 0
	quitApplicationRuntime = func(context.Context) {
		quitCalls++
	}

	app := NewAppWithSecretStore(nil)
	app.ctx = context.Background()
	if result := app.ForceQuitApplication(); !result.Success {
		t.Fatalf("expected force quit success, got %#v", result)
	}
	if quitCalls != 1 {
		t.Fatalf("expected runtime Quit to be called once, got %d", quitCalls)
	}
	if prevent := NewBeforeCloseHandler(app)(context.Background()); prevent {
		t.Fatal("expected next close request to be allowed after force quit")
	}
}
