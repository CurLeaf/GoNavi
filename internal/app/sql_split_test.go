package app

import (
	"reflect"
	"testing"
)

func TestSplitSQLStatements_BasicSplit(t *testing.T) {
	input := "SELECT 1; SELECT 2; SELECT 3"
	got := splitSQLStatements(input)
	want := []string{"SELECT 1", "SELECT 2", "SELECT 3"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_QuotedSemicolon(t *testing.T) {
	input := `SELECT 'hello;world'; SELECT 2`
	got := splitSQLStatements(input)
	want := []string{`SELECT 'hello;world'`, "SELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_LineComment(t *testing.T) {
	input := "SELECT 1; -- this is a comment;\nSELECT 2"
	got := splitSQLStatements(input)
	want := []string{"SELECT 1", "-- this is a comment;\nSELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_BlockComment(t *testing.T) {
	input := "SELECT /* ; */ 1; SELECT 2"
	got := splitSQLStatements(input)
	want := []string{"SELECT /* ; */ 1", "SELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_EmptyInput(t *testing.T) {
	got := splitSQLStatements("")
	if len(got) != 0 {
		t.Errorf("splitSQLStatements(\"\") = %v, want empty slice", got)
	}
}

func TestSplitSQLStatements_SingleStatement(t *testing.T) {
	input := "SELECT * FROM users WHERE id = 1"
	got := splitSQLStatements(input)
	want := []string{"SELECT * FROM users WHERE id = 1"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_DollarQuoting(t *testing.T) {
	input := "SELECT $tag$hello;world$tag$; SELECT 2"
	got := splitSQLStatements(input)
	want := []string{"SELECT $tag$hello;world$tag$", "SELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_FullWidthSemicolon(t *testing.T) {
	input := "SELECT 1；SELECT 2"
	got := splitSQLStatements(input)
	want := []string{"SELECT 1", "SELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_Backtick(t *testing.T) {
	input := "SELECT `col;name` FROM t; SELECT 2"
	got := splitSQLStatements(input)
	want := []string{"SELECT `col;name` FROM t", "SELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_TrailingSemicolon(t *testing.T) {
	input := "SELECT 1; SELECT 2;"
	got := splitSQLStatements(input)
	want := []string{"SELECT 1", "SELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}
