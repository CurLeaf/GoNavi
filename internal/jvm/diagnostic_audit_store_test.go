package jvm

import (
	"path/filepath"
	"testing"
)

func TestDiagnosticAuditStoreAppendAndList(t *testing.T) {
	store := NewDiagnosticAuditStore(filepath.Join(t.TempDir(), "diagnostic_audit.jsonl"))

	err := store.Append(DiagnosticAuditRecord{
		ConnectionID: "conn-orders",
		Transport:    DiagnosticTransportAgentBridge,
		SessionID:    "sess-1",
		CommandID:    "cmd-1",
		Command:      "thread -n 5",
		CommandType:  DiagnosticCommandCategoryObserve,
		RiskLevel:    "low",
		Status:       "completed",
		Reason:       "排查线程堆积",
	})
	if err != nil {
		t.Fatalf("Append returned error: %v", err)
	}

	records, err := store.List("conn-orders", 10)
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %#v", records)
	}
	record := records[0]
	if record.Command != "thread -n 5" || record.Status != "completed" {
		t.Fatalf("unexpected diagnostic audit record: %#v", record)
	}
}
