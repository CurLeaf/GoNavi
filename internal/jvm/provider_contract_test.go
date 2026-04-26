package jvm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestJMXProviderTestConnectionReturnsErrorWhenHostMissing(t *testing.T) {
	provider := NewJMXProvider()

	err := provider.TestConnection(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			JMX: connection.JVMJMXConfig{
				Port: 9010,
			},
		},
	})

	if err == nil {
		t.Fatal("expected error when jmx host is missing")
	}
	if !strings.Contains(err.Error(), "jmx host is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestJMXProviderTestConnectionReturnsErrorWhenPortInvalid(t *testing.T) {
	provider := NewJMXProvider()

	err := provider.TestConnection(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			JMX: connection.JVMJMXConfig{
				Port: -1,
			},
		},
	})

	if err == nil {
		t.Fatal("expected error when jmx port is invalid")
	}
	if !strings.Contains(err.Error(), "jmx port is invalid") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHTTPProviderTestConnectionReturnsErrorWhenBaseURLMissing(t *testing.T) {
	provider := NewHTTPProvider()

	err := provider.TestConnection(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			Endpoint: connection.JVMEndpointConfig{
				BaseURL: "",
			},
		},
	})

	if err == nil {
		t.Fatal("expected error when endpoint baseURL is missing")
	}
	if !strings.Contains(err.Error(), "endpoint baseURL is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHTTPProviderTestConnectionReturnsErrorWhenBaseURLInvalid(t *testing.T) {
	provider := NewHTTPProvider()

	err := provider.TestConnection(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			Endpoint: connection.JVMEndpointConfig{
				BaseURL: "://bad-url",
			},
		},
	})

	if err == nil {
		t.Fatal("expected error when endpoint baseURL is invalid")
	}
	if !strings.Contains(err.Error(), "endpoint baseURL is invalid") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHTTPProviderProbeStripsBaseURLQueryAndFragment(t *testing.T) {
	provider := NewHTTPProvider()
	seen := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.URL.RequestURI()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	err := provider.TestConnection(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			Endpoint: connection.JVMEndpointConfig{
				BaseURL: server.URL + "/gonavi/jvm?api_key=secret-token#debug",
			},
		},
	})

	if err != nil {
		t.Fatalf("expected probe to succeed, got %v", err)
	}
	if got := <-seen; got != "/gonavi/jvm" {
		t.Fatalf("expected query and fragment to be stripped, got %q", got)
	}
}

func TestAgentProviderTestConnectionReturnsErrorWhenBaseURLMissing(t *testing.T) {
	provider := NewAgentProvider()

	err := provider.TestConnection(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			Agent: connection.JVMAgentConfig{
				BaseURL: "",
			},
		},
	})

	if err == nil {
		t.Fatal("expected error when agent baseURL is missing")
	}
	if !strings.Contains(err.Error(), "agent baseURL is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAgentProviderTestConnectionReturnsErrorWhenBaseURLInvalid(t *testing.T) {
	provider := NewAgentProvider()

	err := provider.TestConnection(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			Agent: connection.JVMAgentConfig{
				BaseURL: "://bad-url",
			},
		},
	})

	if err == nil {
		t.Fatal("expected error when agent baseURL is invalid")
	}
	if !strings.Contains(err.Error(), "agent baseURL is invalid") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestJMXProviderListResourcesReturnsErrorWhenParentPathInvalid(t *testing.T) {
	provider := NewJMXProvider()

	_, err := provider.ListResources(context.Background(), connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			JMX: connection.JVMJMXConfig{
				Port: 9010,
			},
		},
	}, "bad-path")
	if err == nil {
		t.Fatal("expected invalid parent path error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "parent resource path") {
		t.Fatalf("unexpected error: %v", err)
	}
}
