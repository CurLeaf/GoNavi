package jvm

import (
	"path/filepath"
	"testing"
)

func TestAuditStoreListFiltersAndReturnsLatestFirst(t *testing.T) {
	store := NewAuditStore(filepath.Join(t.TempDir(), "jvm_audit.jsonl"))
	for _, record := range []AuditRecord{
		{Timestamp: 100, ConnectionID: "conn-orders", ProviderMode: ModeJMX, ResourceID: "/cache/orders", Action: "put", Reason: "first", Result: "applied"},
		{Timestamp: 200, ConnectionID: "conn-other", ProviderMode: ModeJMX, ResourceID: "/cache/other", Action: "put", Reason: "other", Result: "applied"},
		{Timestamp: 300, ConnectionID: "conn-orders", ProviderMode: ModeJMX, ResourceID: "/cache/orders", Action: "put", Reason: "latest", Result: "applied"},
	} {
		if err := store.Append(record); err != nil {
			t.Fatalf("Append returned error: %v", err)
		}
	}

	records, err := store.List("conn-orders", 1)
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected one record, got %#v", records)
	}
	if records[0].Timestamp != 300 {
		t.Fatalf("expected latest record first, got %#v", records[0])
	}
}
