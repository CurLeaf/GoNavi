package jvm

import (
	"context"
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
				Port: 0,
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

func TestJMXProviderListResourcesReturnsNotImplementedError(t *testing.T) {
	provider := NewJMXProvider()

	_, err := provider.ListResources(context.Background(), connection.ConnectionConfig{}, "")
	if err == nil {
		t.Fatal("expected not implemented error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "does not implement") {
		t.Fatalf("unexpected error: %v", err)
	}
}
