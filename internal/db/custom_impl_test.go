package db

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestCustomDBConnectReportsUnsupportedODBCDriverName(t *testing.T) {
	db := &CustomDB{}

	err := db.Connect(connection.ConnectionConfig{
		Driver: "InterSystems IRIS ODBC35",
		DSN:    "Driver={InterSystems IRIS ODBC35};Server=127.0.0.1;Port=1972;Database=USER;",
	})
	if err == nil {
		t.Fatal("expected unsupported ODBC driver error, got nil")
	}

	message := err.Error()
	for _, want := range []string{
		"ODBC/JDBC",
		"Go database/sql",
		"暂不支持",
		"InterSystems IRIS",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected error to contain %q, got %q", want, message)
		}
	}
}

func TestCustomDBConnectReportsUnregisteredGoDriver(t *testing.T) {
	db := &CustomDB{}

	err := db.Connect(connection.ConnectionConfig{
		Driver: "not-a-registered-go-driver",
		DSN:    "demo",
	})
	if err == nil {
		t.Fatal("expected unregistered Go driver error, got nil")
	}

	message := err.Error()
	for _, want := range []string{
		"未在 GoNavi 中注册",
		"Go database/sql",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected error to contain %q, got %q", want, message)
		}
	}
}
