package resultdiff

import (
	"testing"
)

func TestComputeDiffBasic(t *testing.T) {
	left := []map[string]interface{}{
		{"id": 1, "name": "a", "score": 10},
		{"id": 2, "name": "b", "score": 20},
		{"id": 3, "name": "c", "score": 30},
	}
	right := []map[string]interface{}{
		{"id": 2, "name": "b", "score": 21}, // changed
		{"id": 3, "name": "c", "score": 30}, // same
		{"id": 4, "name": "d", "score": 40}, // added
	}
	// id=1 removed

	summary, rows, err := ComputeDiff(left, []string{"id", "name", "score"}, right, []string{"id", "name", "score"},
		[]string{"id"}, nil, nil, CompareOptions{}, false)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Added != 1 || summary.Removed != 1 || summary.Changed != 1 || summary.Same != 1 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if summary.Unmatched != 0 {
		t.Fatalf("unexpected unmatched: %d", summary.Unmatched)
	}
	if summary.ChangedColumnFreq["score"] != 1 {
		t.Fatalf("expected score freq 1, got %+v", summary.ChangedColumnFreq)
	}
	// same 默认不进 rows
	var kinds []DiffKind
	for _, r := range rows {
		kinds = append(kinds, r.Kind)
	}
	if len(rows) != 3 {
		t.Fatalf("expected 3 non-same rows, got %d kinds=%v", len(rows), kinds)
	}
}

func TestComputeDiffCompositeKey(t *testing.T) {
	left := []map[string]interface{}{
		{"a": 1, "b": "x", "v": 1},
		{"a": 1, "b": "y", "v": 2},
	}
	right := []map[string]interface{}{
		{"a": 1, "b": "x", "v": 9},
		{"a": 1, "b": "y", "v": 2},
	}
	summary, rows, err := ComputeDiff(left, nil, right, nil, []string{"a", "b"}, nil, nil, CompareOptions{}, true)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Changed != 1 || summary.Same != 1 {
		t.Fatalf("summary=%+v", summary)
	}
	page := FilterPage(rows, []string{"changed"}, "", 0, 10, false)
	if page.Total != 1 {
		t.Fatalf("changed page total=%d", page.Total)
	}
	if len(page.Rows[0].ChangedFields) != 1 || page.Rows[0].ChangedFields[0].Name != "v" {
		t.Fatalf("changed fields=%+v", page.Rows[0].ChangedFields)
	}
}

func TestComputeDiffNullKeyUnmatched(t *testing.T) {
	left := []map[string]interface{}{
		{"id": nil, "v": 1},
		{"id": 1, "v": 2},
	}
	right := []map[string]interface{}{
		{"id": 1, "v": 2},
	}
	summary, _, err := ComputeDiff(left, nil, right, nil, []string{"id"}, nil, nil, CompareOptions{}, false)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Unmatched != 1 || summary.Same != 1 {
		t.Fatalf("summary=%+v", summary)
	}
}

func TestComputeDiffColumnSets(t *testing.T) {
	left := []map[string]interface{}{{"id": 1, "onlyL": 1, "common": "a"}}
	right := []map[string]interface{}{{"id": 1, "onlyR": 2, "common": "b"}}
	summary, rows, err := ComputeDiff(left, []string{"id", "onlyL", "common"}, right, []string{"id", "onlyR", "common"},
		[]string{"id"}, nil, nil, CompareOptions{}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.LeftOnlyColumns) != 1 || summary.LeftOnlyColumns[0] != "onlyL" {
		t.Fatalf("leftOnly=%v", summary.LeftOnlyColumns)
	}
	if len(summary.RightOnlyColumns) != 1 || summary.RightOnlyColumns[0] != "onlyR" {
		t.Fatalf("rightOnly=%v", summary.RightOnlyColumns)
	}
	if summary.Changed != 1 {
		t.Fatalf("expected changed on common, summary=%+v", summary)
	}
	foundCommon := false
	for _, ch := range rows[0].ChangedFields {
		if ch.Name == "common" {
			foundCommon = true
		}
	}
	if !foundCommon {
		t.Fatalf("expected common in changedFields: %+v", rows[0].ChangedFields)
	}
}

func TestFilterPageKindsAndColumn(t *testing.T) {
	all := []DiffRow{
		{Kind: DiffKindChanged, ChangedFields: []FieldChange{{Name: "score"}}},
		{Kind: DiffKindChanged, ChangedFields: []FieldChange{{Name: "name"}}},
		{Kind: DiffKindAdded},
		{Kind: DiffKindSame},
	}
	page := FilterPage(all, nil, "", 0, 10, false)
	if page.Total != 3 {
		t.Fatalf("default exclude same total=%d", page.Total)
	}
	page = FilterPage(all, []string{"changed"}, "score", 0, 10, false)
	if page.Total != 1 {
		t.Fatalf("filter changed+score total=%d", page.Total)
	}
}

func TestSessionUploadAndCompute(t *testing.T) {
	m := NewManager(0)
	s := m.Create(StartRequest{KeyColumns: []string{"id"}, MaxRowsPerSide: 100})
	if err := s.AppendRows("left", []string{"id", "v"}, []map[string]interface{}{{"id": 1, "v": 1}}, true); err != nil {
		t.Fatal(err)
	}
	if err := s.AppendRows("right", []string{"id", "v"}, []map[string]interface{}{{"id": 1, "v": 2}}, true); err != nil {
		t.Fatal(err)
	}
	summary, err := s.Compute()
	if err != nil {
		t.Fatal(err)
	}
	if summary.Changed != 1 {
		t.Fatalf("summary=%+v", summary)
	}
	page, err := s.Page(PageRequest{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 || page.Rows[0].Kind != DiffKindChanged {
		t.Fatalf("page=%+v", page)
	}
	m.Close(s.ID)
	if _, err := m.Get(s.ID); err == nil {
		t.Fatal("expected closed job not found")
	}
}

func TestMaxRowsGuard(t *testing.T) {
	m := NewManager(0)
	s := m.Create(StartRequest{KeyColumns: []string{"id"}, MaxRowsPerSide: 2})
	err := s.AppendRows("left", []string{"id"}, []map[string]interface{}{
		{"id": 1}, {"id": 2}, {"id": 3},
	}, true)
	if err == nil {
		t.Fatal("expected max rows error")
	}
}

func TestKeyColumnsRequired(t *testing.T) {
	_, _, err := ComputeDiff(nil, nil, nil, nil, nil, nil, nil, CompareOptions{}, false)
	if err == nil {
		t.Fatal("expected error")
	}
}
