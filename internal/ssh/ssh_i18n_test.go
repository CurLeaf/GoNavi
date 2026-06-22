package ssh

import (
	"context"
	"os"
	"strings"
	"testing"
	"unicode"

	"GoNavi-Wails/internal/connection"
)

func TestSSHConnectionFailureWrappersUseEnglish(t *testing.T) {
	t.Cleanup(CloseAllSSHClients)

	config := connection.SSHConfig{
		Host:     "127.0.0.1",
		Port:     1,
		User:     "root",
		Password: "password",
	}

	cases := []struct {
		name string
		run  func() error
	}{
		{
			name: "context dial",
			run: func() error {
				_, err := DialContextThroughSSH(context.Background(), config, "tcp", "127.0.0.1:3306")
				return err
			},
		},
		{
			name: "direct dial",
			run: func() error {
				_, err := DialThroughSSH(config, "tcp", "127.0.0.1:3306")
				return err
			},
		},
		{
			name: "local forwarder",
			run: func() error {
				_, err := NewLocalForwarder(config, "127.0.0.1", 3306)
				return err
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.run()
			if err == nil {
				t.Fatalf("expected SSH connection failure")
			}
			message := err.Error()
			if containsHan(message) {
				t.Fatalf("expected English wrapper without Han characters, got %q", message)
			}
			if !strings.Contains(message, "failed to establish SSH connection") {
				t.Fatalf("expected English SSH connection wrapper, got %q", message)
			}
			if !strings.Contains(message, "127.0.0.1:1") {
				t.Fatalf("expected raw SSH address to stay in detail, got %q", message)
			}
		})
	}
}

func TestSSHSourceDoesNotKeepLegacyChineseErrorWrappers(t *testing.T) {
	source, err := os.ReadFile("ssh.go")
	if err != nil {
		t.Fatalf("read ssh.go: %v", err)
	}
	text := string(source)
	for _, legacy := range []string{
		"fmt.Errorf(\"\u5efa\u7acb SSH \u8fde\u63a5\u5931\u8d25\uff1a%w\", err)",
		"fmt.Errorf(\"\u901a\u8fc7 SSH \u96a7\u9053\u8fde\u63a5\u5230 %s \u5931\u8d25\uff1a%w\", address, err)",
		"fmt.Errorf(\"\u521b\u5efa\u672c\u5730\u76d1\u542c\u5668\u5931\u8d25\uff1a%w\", err)",
	} {
		if strings.Contains(text, legacy) {
			t.Fatalf("legacy Chinese SSH wrapper still exists: %s", legacy)
		}
	}
}

func containsHan(text string) bool {
	for _, r := range text {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}
