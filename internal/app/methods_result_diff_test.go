package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/resultdiff"
)

func TestResultDiffStartWithEmbeddedRows(t *testing.T) {
	a := NewApp()
	req := ResultDiffStartRequest{
		Database: "db",
		Left: resultdiff.DatasetSpec{
			Mode:    resultdiff.DatasetModeRows,
			Columns: []string{"id", "name"},
			Rows: []map[string]interface{}{
				{"id": 1, "name": "a"},
				{"id": 2, "name": "b"},
			},
		},
		Right: resultdiff.DatasetSpec{
			Mode:    resultdiff.DatasetModeRows,
			Columns: []string{"id", "name"},
			Rows: []map[string]interface{}{
				{"id": 2, "name": "b2"},
				{"id": 3, "name": "c"},
			},
		},
		KeyColumns: []string{"id"},
	}
	res := a.ResultDiffStart(req)
	if !res.Success {
		t.Fatalf("ResultDiffStart failed: %s", res.Message)
	}
	start, ok := res.Data.(resultdiff.StartResult)
	if !ok {
		t.Fatalf("unexpected data type %T", res.Data)
	}
	if start.Summary.Added != 1 || start.Summary.Removed != 1 || start.Summary.Changed != 1 {
		t.Fatalf("summary=%+v", start.Summary)
	}

	page := a.ResultDiffPage(resultdiff.PageRequest{JobID: start.JobID, Limit: 10})
	if !page.Success {
		t.Fatalf("page failed: %s", page.Message)
	}
	pageData, ok := page.Data.(resultdiff.PageResult)
	if !ok {
		t.Fatalf("page data type %T", page.Data)
	}
	if pageData.Total != 3 {
		t.Fatalf("expected 3 diff rows, got %d", pageData.Total)
	}

	closeRes := a.ResultDiffClose(start.JobID)
	if !closeRes.Success {
		t.Fatalf("close failed: %s", closeRes.Message)
	}
}

func TestResultDiffStartRequiresKeys(t *testing.T) {
	a := NewApp()
	res := a.ResultDiffStart(ResultDiffStartRequest{
		Left:  resultdiff.DatasetSpec{Mode: resultdiff.DatasetModeRows},
		Right: resultdiff.DatasetSpec{Mode: resultdiff.DatasetModeRows},
	})
	if res.Success {
		t.Fatal("expected failure without keys")
	}
}

func TestResultDiffUploadThenCompute(t *testing.T) {
	a := NewApp()
	start := a.ResultDiffStart(ResultDiffStartRequest{
		KeyColumns: []string{"id"},
		Left:       resultdiff.DatasetSpec{Mode: resultdiff.DatasetModeRows, Columns: []string{"id", "v"}},
		Right:      resultdiff.DatasetSpec{Mode: resultdiff.DatasetModeRows, Columns: []string{"id", "v"}},
	})
	if !start.Success {
		t.Fatalf("start: %s", start.Message)
	}
	startData := start.Data.(resultdiff.StartResult)
	jobID := startData.JobID

	upL := a.ResultDiffUploadChunk(resultdiff.UploadChunkRequest{
		JobID: jobID, Side: "left", Columns: []string{"id", "v"},
		Rows: []map[string]interface{}{{"id": 1, "v": 1}}, Done: true,
	})
	if !upL.Success {
		t.Fatalf("upload left: %s", upL.Message)
	}
	upR := a.ResultDiffUploadChunk(resultdiff.UploadChunkRequest{
		JobID: jobID, Side: "right", Columns: []string{"id", "v"},
		Rows: []map[string]interface{}{{"id": 1, "v": 2}}, Done: true,
	})
	if !upR.Success {
		t.Fatalf("upload right: %s", upR.Message)
	}
	comp := a.ResultDiffCompute(jobID)
	if !comp.Success {
		t.Fatalf("compute: %s", comp.Message)
	}
	result := comp.Data.(resultdiff.StartResult)
	if result.Summary.Changed != 1 {
		t.Fatalf("summary=%+v", result.Summary)
	}
	_ = a.ResultDiffClose(jobID)
}

func TestExtractQueryRows(t *testing.T) {
	rows, cols, err := extractQueryRows(connection.QueryResult{
		Success: true,
		Data:    []map[string]interface{}{{"a": 1}},
		Fields:  []string{"a"},
	})
	if err != nil || len(rows) != 1 || cols[0] != "a" {
		t.Fatalf("rows=%v cols=%v err=%v", rows, cols, err)
	}
}
