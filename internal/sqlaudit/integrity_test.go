package sqlaudit

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "audit", "sql_audit.db"))
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil && !errors.Is(err, ErrClosed) {
			t.Errorf("Close returned error: %v", err)
		}
	})
	return store
}

func sampleEvent(id string, timestamp int64) Event {
	return Event{
		ID:                    id,
		Timestamp:             timestamp,
		EventType:             "query",
		Status:                "success",
		ConnectionID:          "conn-main",
		ConnectionFingerprint: "postgres://admin:raw-secret@db.example/app",
		DBType:                "mysql",
		Database:              "analytics",
		QueryID:               "query-1",
		Source:                "query_editor",
		BoundaryMode:          BoundaryModeDriverAPI,
		SQLText:               "SELECT * FROM users WHERE id = 42 AND token = 'raw-token'",
		DurationMs:            25,
		RowsReturned:          1,
	}
}

func TestVerifyIntegrityContextStopsBeforeScanWhenCanceled(t *testing.T) {
	store := openTestStore(t)
	if err := store.Append(sampleEvent("canceled-integrity", time.Now().UnixMilli())); err != nil {
		t.Fatalf("Append returned error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	report, err := store.VerifyIntegrityContext(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("VerifyIntegrityContext error = %v, want context.Canceled", err)
	}
	if report.CheckedRecords != 0 {
		t.Fatalf("canceled verification checked %d records, want 0", report.CheckedRecords)
	}
}

func TestVerifyIntegrityCompletesWhenContextIsNotCanceled(t *testing.T) {
	store := openTestStore(t)
	if err := store.Append(sampleEvent("valid-integrity", time.Now().UnixMilli())); err != nil {
		t.Fatalf("Append returned error: %v", err)
	}

	report, err := store.VerifyIntegrity()
	if err != nil {
		t.Fatalf("VerifyIntegrity returned error: %v", err)
	}
	if !report.Valid {
		t.Fatalf("VerifyIntegrity report = %#v, want valid chain", report)
	}
	if report.CheckedRecords != 1 {
		t.Fatalf("VerifyIntegrity checked %d records, want 1", report.CheckedRecords)
	}
}

type cancelDuringSecondNextRows struct {
	cancel    context.CancelFunc
	nextCalls int
	scans     int
}

func (r *cancelDuringSecondNextRows) Next() bool {
	switch r.nextCalls {
	case 0:
		r.nextCalls++
		return true
	case 1:
		r.nextCalls++
		r.cancel()
		return true
	default:
		return false
	}
}

func (r *cancelDuringSecondNextRows) Scan(dest ...any) error {
	if len(dest) != 28 {
		return errors.New("unexpected scan destination count")
	}
	r.scans++
	event := sampleEvent("canceled-integrity", 1)
	event.Sequence = 1
	event.PrevHash = ""
	event.Hash, _ = calculateEventHash(event)
	values := []any{
		event.Sequence, event.ID, event.Timestamp, event.EventType, event.Status,
		event.ConnectionID, event.ConnectionFingerprint, event.DBType, event.Database,
		event.QueryID, event.TransactionID, event.Source, event.BoundaryMode,
		event.CommitMode, event.SQLText, boolToInt(event.SQLRedacted), event.SQLFingerprint,
		event.StatementIndex, event.StatementCount, event.ExecutedCount, event.FailedIndex,
		boolToInt(event.OutcomeUnknown), event.DurationMs, event.RowsAffected, event.RowsReturned,
		event.Error, event.PrevHash, event.Hash,
	}
	for index := range dest {
		switch target := dest[index].(type) {
		case *int64:
			*target = values[index].(int64)
		case *string:
			*target = values[index].(string)
		case *int:
			*target = values[index].(int)
		default:
			return errors.New("unexpected scan destination type")
		}
	}
	return nil
}

func (r *cancelDuringSecondNextRows) Err() error   { return nil }
func (r *cancelDuringSecondNextRows) Close() error { return nil }

func TestVerifyIntegrityContextStopsDuringScanWhenCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rows := &cancelDuringSecondNextRows{cancel: cancel}

	report, err := verifyIntegrityRows(ctx, rows, newIntegrityReport())
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("verifyIntegrityRows error = %v, want context.Canceled", err)
	}
	if report.CheckedRecords != 1 {
		t.Fatalf("canceled verification checked %d records, want 1", report.CheckedRecords)
	}
	if rows.scans != 1 || rows.nextCalls != 2 {
		t.Fatalf("scan progressed after cancellation: scans=%d nextCalls=%d", rows.scans, rows.nextCalls)
	}
}
