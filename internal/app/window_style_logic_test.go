package app

import "testing"

func TestResolveMacNativeWindowControlStateEnabled(t *testing.T) {
	state := resolveMacNativeWindowControlState(true)

	if !state.ShowNativeButtons {
		t.Fatal("expected native buttons to be visible when enabled")
	}
	if !state.UseTitledWindow || !state.UseFullSizeContent {
		t.Fatal("expected enabled state to request titled full-size content window")
	}
	if !state.HideWindowTitle || !state.TransparentTitlebar {
		t.Fatal("expected enabled state to hide title and use transparent titlebar")
	}
	if !state.AllowNativeFullscreen {
		t.Fatal("expected enabled state to allow native fullscreen")
	}
}

func TestResolveMacNativeWindowControlStateDisabled(t *testing.T) {
	state := resolveMacNativeWindowControlState(false)

	if state.ShowNativeButtons {
		t.Fatal("expected native buttons to be hidden when disabled")
	}
	if state.UseTitledWindow || state.UseFullSizeContent {
		t.Fatal("expected disabled state to avoid titled/full-size content window")
	}
	if state.HideWindowTitle || state.TransparentTitlebar {
		t.Fatal("expected disabled state to keep title visibility and opaque titlebar")
	}
	if state.AllowNativeFullscreen {
		t.Fatal("expected disabled state to avoid native fullscreen behavior")
	}
}

func TestShouldApplyMacNativeWindowStyleAcceptsMainWailsWindow(t *testing.T) {
	tests := []macWindowIdentity{
		{ClassName: "WailsWindow", DelegateClassName: "WindowDelegate", Title: "GoNavi"},
		{ClassName: "WailsWindow", DelegateClassName: "", Title: ""},
		{ClassName: "", DelegateClassName: "WindowDelegate", Title: ""},
		{ClassName: "", DelegateClassName: "", Title: "GoNavi"},
	}

	for _, tt := range tests {
		if !shouldApplyMacNativeWindowStyle(tt) {
			t.Fatalf("expected window identity %+v to be treated as main app window", tt)
		}
	}
}

func TestShouldApplyMacNativeWindowStyleRejectsSystemAuxiliaryWindows(t *testing.T) {
	tests := []macWindowIdentity{
		{ClassName: "TUINSWindow", DelegateClassName: "TUINSWindow", Title: ""},
		{ClassName: "NSToolbarFullScreenWindow", DelegateClassName: "", Title: ""},
		{ClassName: "_NSFullScreenTransitionOverlayWindow", DelegateClassName: "", Title: ""},
		{ClassName: "NSPanel", DelegateClassName: "", Title: ""},
	}

	for _, tt := range tests {
		if shouldApplyMacNativeWindowStyle(tt) {
			t.Fatalf("expected window identity %+v to be rejected as auxiliary/system window", tt)
		}
	}
}
