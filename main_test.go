package main

import (
	"testing"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
)

func TestIsLowMemoryMode(t *testing.T) {
	tests := []struct {
		name string
		env  string
		want bool
	}{
		{name: "disabled by default", env: "", want: false},
		{name: "enabled with one", env: "1", want: true},
		{name: "enabled with true", env: "true", want: true},
		{name: "enabled with yes and whitespace", env: " yes ", want: true},
		{name: "disabled with false", env: "false", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GONAVI_LOW_MEMORY_MODE", tt.env)
			if got := isLowMemoryMode(); got != tt.want {
				t.Fatalf("isLowMemoryMode() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestShouldRunMCPServerMode(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want bool
	}{
		{name: "empty", args: nil, want: false},
		{name: "mcp-server", args: []string{"mcp-server"}, want: true},
		{name: "flag style", args: []string{"--mcp-server"}, want: true},
		{name: "mcp-server http mode", args: []string{"mcp-server", "http"}, want: true},
		{name: "mcp-server remote config", args: []string{"mcp-server", "remote-config"}, want: true},
		{name: "unknown", args: []string{"serve"}, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldRunMCPServerMode(tc.args); got != tc.want {
				t.Fatalf("shouldRunMCPServerMode(%v) = %v, want %v", tc.args, got, tc.want)
			}
		})
	}
}

func TestBuildMacApplicationMenu(t *testing.T) {
	called := 0
	appMenu := buildMacApplicationMenu(func() {
		called++
	}, true)

	if appMenu == nil {
		t.Fatal("buildMacApplicationMenu() returned nil")
	}
	if len(appMenu.Items) != 3 {
		t.Fatalf("expected 3 top-level menu items, got %d", len(appMenu.Items))
	}
	if appMenu.Items[0].Role != menu.AppMenuRole {
		t.Fatalf("first top-level menu role = %v, want %v", appMenu.Items[0].Role, menu.AppMenuRole)
	}
	if appMenu.Items[1].Role != menu.EditMenuRole {
		t.Fatalf("second top-level menu role = %v, want %v", appMenu.Items[1].Role, menu.EditMenuRole)
	}

	queryEditorMenu := appMenu.Items[2]
	if queryEditorMenu.Label != "SQL" {
		t.Fatalf("query editor menu label = %q, want %q", queryEditorMenu.Label, "SQL")
	}
	if queryEditorMenu.SubMenu == nil || len(queryEditorMenu.SubMenu.Items) != 1 {
		t.Fatalf("query editor submenu items = %d, want 1", len(queryEditorMenu.SubMenu.Items))
	}

	copyCurrentLineItem := queryEditorMenu.SubMenu.Items[0]
	if copyCurrentLineItem.Label != "Copy Current Line" {
		t.Fatalf("menu item label = %q, want %q", copyCurrentLineItem.Label, "Copy Current Line")
	}
	if copyCurrentLineItem.Accelerator == nil {
		t.Fatal("menu item accelerator is nil")
	}
	if copyCurrentLineItem.Accelerator.Key != "e" {
		t.Fatalf("menu item accelerator key = %q, want %q", copyCurrentLineItem.Accelerator.Key, "e")
	}
	if len(copyCurrentLineItem.Accelerator.Modifiers) != 1 || copyCurrentLineItem.Accelerator.Modifiers[0] != keys.CmdOrCtrlKey {
		t.Fatalf("menu item modifiers = %v, want [%v]", copyCurrentLineItem.Accelerator.Modifiers, keys.CmdOrCtrlKey)
	}

	copyCurrentLineItem.Click(&menu.CallbackData{MenuItem: copyCurrentLineItem})
	if called != 1 {
		t.Fatalf("native select-current-line callback called %d times, want 1", called)
	}
}
