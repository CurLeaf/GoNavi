package app

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestReadImportedConnectionConfigFileRejectsOversizedFiles(t *testing.T) {
	for _, ext := range []string{connectionPackageExtension, ".json"} {
		t.Run(ext, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "connections"+ext)

			file, err := os.Create(path)
			if err != nil {
				t.Fatalf("Create returned error: %v", err)
			}
			if err := file.Truncate(connectionImportMaxFileBytes + 1); err != nil {
				file.Close()
				t.Fatalf("Truncate returned error: %v", err)
			}
			if err := file.Close(); err != nil {
				t.Fatalf("Close returned error: %v", err)
			}

			_, err = readImportedConnectionConfigFile(path)
			if !errors.Is(err, errConnectionImportFileTooLarge) {
				t.Fatalf("oversized import file should return errConnectionImportFileTooLarge, got: %v", err)
			}
		})
	}
}

func TestBuildImportPreviewCSVStreamKeepsFirstFiveRows(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "users.csv")
	var builder strings.Builder
	builder.WriteString("id,name\n")
	for i := 1; i <= 7; i++ {
		builder.WriteString(fmt.Sprintf("%d,user_%d\n", i, i))
	}
	if err := os.WriteFile(path, []byte(builder.String()), 0o600); err != nil {
		t.Fatalf("write csv: %v", err)
	}

	preview, err := buildImportPreview(path, 5)
	if err != nil {
		t.Fatalf("buildImportPreview returned error: %v", err)
	}

	if !reflect.DeepEqual(preview.Columns, []string{"id", "name"}) {
		t.Fatalf("unexpected columns: %#v", preview.Columns)
	}
	if preview.TotalRows != 7 {
		t.Fatalf("expected 7 rows, got %d", preview.TotalRows)
	}
	if len(preview.PreviewRows) != 5 {
		t.Fatalf("expected 5 preview rows, got %d", len(preview.PreviewRows))
	}
	if got := preview.PreviewRows[0]["name"]; got != "user_1" {
		t.Fatalf("expected first preview row name user_1, got %#v", got)
	}
	if got := preview.PreviewRows[4]["id"]; got != "5" {
		t.Fatalf("expected fifth preview row id 5, got %#v", got)
	}
}

func TestBuildImportRowFromValuesPreservesPositionsWhenHeaderContainsBlankColumns(t *testing.T) {
	row := buildImportRowFromValues([]string{"id", "", "name"}, []string{"1", "ignored", "alice"})
	if got := row["id"]; got != "1" {
		t.Fatalf("expected id to stay aligned, got %#v", got)
	}
	if got := row["name"]; got != "alice" {
		t.Fatalf("expected name to stay aligned, got %#v", got)
	}
	if _, ok := row[""]; ok {
		t.Fatal("blank header column should not be written into row map")
	}
}

type fakeImportRowWriter struct {
	columns          []string
	batchCalls       int
	singleCalls      int
	batchSizes       []int
	batchErr         error
	singleErrByRowID map[interface{}]error
}

func (w *fakeImportRowWriter) SetColumns(columns []string) {
	w.columns = append([]string(nil), columns...)
}

func (w *fakeImportRowWriter) ApplyBatch(rows []map[string]interface{}) error {
	w.batchCalls++
	w.batchSizes = append(w.batchSizes, len(rows))
	return w.batchErr
}

func (w *fakeImportRowWriter) ApplyOne(row map[string]interface{}) error {
	w.singleCalls++
	if err, ok := w.singleErrByRowID[row["id"]]; ok {
		return err
	}
	return nil
}

func (w *fakeImportRowWriter) BatchEnabled() bool {
	return true
}

func TestImportBatchConsumerUsesBatchWriterInConfiguredBatches(t *testing.T) {
	writer := &fakeImportRowWriter{}
	consumer := newImportBatchConsumer(writer, 1000, 1201, true, nil)
	if err := consumer.SetColumns([]string{"id"}); err != nil {
		t.Fatalf("SetColumns returned error: %v", err)
	}
	for i := 1; i <= 1201; i++ {
		if err := consumer.ConsumeRow(map[string]interface{}{"id": i}); err != nil {
			t.Fatalf("ConsumeRow(%d) returned error: %v", i, err)
		}
	}
	if err := consumer.Flush(); err != nil {
		t.Fatalf("Flush returned error: %v", err)
	}

	if writer.batchCalls != 2 {
		t.Fatalf("expected 2 batch calls, got %d", writer.batchCalls)
	}
	if !reflect.DeepEqual(writer.batchSizes, []int{1000, 201}) {
		t.Fatalf("unexpected batch sizes: %#v", writer.batchSizes)
	}
	result := consumer.Result()
	if result.Success != 1201 || result.Failed != 0 || result.Total != 1201 {
		t.Fatalf("unexpected result: %#v", result)
	}
	if writer.singleCalls != 0 {
		t.Fatalf("expected no single-row fallback, got %d calls", writer.singleCalls)
	}
}

func TestImportBatchConsumerFallsBackToSingleRowsWhenBatchFails(t *testing.T) {
	writer := &fakeImportRowWriter{
		batchErr: fmt.Errorf("batch failed"),
		singleErrByRowID: map[interface{}]error{
			2: fmt.Errorf("duplicate key"),
		},
	}
	consumer := newImportBatchConsumer(writer, 1000, 3, true, nil)
	if err := consumer.SetColumns([]string{"id"}); err != nil {
		t.Fatalf("SetColumns returned error: %v", err)
	}
	for i := 1; i <= 3; i++ {
		if err := consumer.ConsumeRow(map[string]interface{}{"id": i}); err != nil {
			t.Fatalf("ConsumeRow(%d) returned error: %v", i, err)
		}
	}
	if err := consumer.Flush(); err != nil {
		t.Fatalf("Flush returned error: %v", err)
	}

	result := consumer.Result()
	if result.Success != 2 || result.Failed != 1 || result.Total != 3 {
		t.Fatalf("unexpected result: %#v", result)
	}
	if writer.batchCalls != 1 {
		t.Fatalf("expected 1 batch call, got %d", writer.batchCalls)
	}
	if writer.singleCalls != 3 {
		t.Fatalf("expected 3 single-row fallback calls, got %d", writer.singleCalls)
	}
	if len(result.ErrorLogs) != 1 || result.ErrorLogs[0] != "Row 2: duplicate key" {
		t.Fatalf("unexpected error logs: %#v", result.ErrorLogs)
	}
}
