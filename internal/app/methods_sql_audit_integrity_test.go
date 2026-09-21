package app

import (
	"context"
	"strings"
	"testing"
	"time"

	"GoNavi-Wails/internal/secretstore"
	"GoNavi-Wails/internal/sqlaudit"
)

func newSQLAuditIntegrityTestApp(t *testing.T) *App {
	t.Helper()
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()
	return app
}

func TestVerifySQLAuditIntegrityUsesBackgroundContext(t *testing.T) {
	app := newSQLAuditIntegrityTestApp(t)
	err := app.withSQLAuditStore(false, func(store *sqlaudit.Store) error {
		return store.Append(sqlaudit.Event{
			Timestamp: time.Now().UnixMilli(),
			EventType: "query",
			Status:    "success",
			QueryID:   "query-integrity",
			Source:    "query_editor",
			SQLText:   "SELECT 1",
		})
	})
	if err != nil {
		t.Fatalf("Append returned error: %v", err)
	}

	result := app.VerifySQLAuditIntegrity()
	if !result.Success {
		t.Fatalf("VerifySQLAuditIntegrity failed: %s", result.Message)
	}
	report, ok := result.Data.(sqlaudit.IntegrityReport)
	if !ok {
		t.Fatalf("VerifySQLAuditIntegrity data type = %T, want IntegrityReport", result.Data)
	}
	if !report.Valid || report.CheckedRecords != 1 {
		t.Fatalf("VerifySQLAuditIntegrity report = %#v, want valid chain with 1 record", report)
	}
}

func TestVerifySQLAuditIntegrityStopsWhenContextCanceled(t *testing.T) {
	app := newSQLAuditIntegrityTestApp(t)
	err := app.withSQLAuditStore(false, func(store *sqlaudit.Store) error {
		return store.Append(sqlaudit.Event{
			Timestamp: time.Now().UnixMilli(),
			EventType: "query",
			Status:    "success",
			QueryID:   "query-canceled",
			Source:    "query_editor",
			SQLText:   "SELECT 1",
		})
	})
	if err != nil {
		t.Fatalf("Append returned error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result := app.verifySQLAuditIntegrity(ctx)
	if result.Success {
		t.Fatal("verifySQLAuditIntegrity unexpectedly succeeded after cancellation")
	}
	if !strings.Contains(result.Message, context.Canceled.Error()) {
		t.Fatalf("verifySQLAuditIntegrity message = %q, want context canceled", result.Message)
	}
}

func TestWebRPCContextHandlersInjectVerifySQLAuditIntegrity(t *testing.T) {
	found := false
	for _, method := range RequiredIssue1098WebRPCContextMethods() {
		if method == "VerifySQLAuditIntegrity" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("RequiredIssue1098WebRPCContextMethods missing VerifySQLAuditIntegrity")
	}

	handlers := WebRPCContextHandlers(newSQLAuditIntegrityTestApp(t))
	if _, ok := handlers["VerifySQLAuditIntegrity"]; !ok {
		t.Fatal("WebRPCContextHandlers missing VerifySQLAuditIntegrity")
	}
	if len(handlers) != len(RequiredIssue1098WebRPCContextMethods()) {
		t.Fatalf("WebRPCContextHandlers count = %d, want %d", len(handlers), len(RequiredIssue1098WebRPCContextMethods()))
	}
}
