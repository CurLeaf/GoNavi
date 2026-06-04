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

func TestSplitSQLStatements_PostgresCreateFunctionDollarQuoting(t *testing.T) {
	input := `CREATE OR REPLACE FUNCTION refresh_stats() RETURNS void AS $$
BEGIN
    PERFORM refresh_now();
END;
$$ LANGUAGE plpgsql;
SELECT 2;`
	got := splitSQLStatements(input)
	want := []string{
		`CREATE OR REPLACE FUNCTION refresh_stats() RETURNS void AS $$
BEGIN
    PERFORM refresh_now();
END;
$$ LANGUAGE plpgsql`,
		"SELECT 2",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %#v, want %#v", input, got, want)
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

func TestSplitSQLStatements_SQLEscapedQuote(t *testing.T) {
	input := "SELECT 'it''s a test'; SELECT 2"
	got := splitSQLStatements(input)
	want := []string{"SELECT 'it''s a test'", "SELECT 2"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_SQLEscapedQuoteMultiple(t *testing.T) {
	input := "INSERT INTO t VALUES ('O''Brien', 'it''s OK'); SELECT 1"
	got := splitSQLStatements(input)
	want := []string{"INSERT INTO t VALUES ('O''Brien', 'it''s OK')", "SELECT 1"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %v, want %v", input, got, want)
	}
}

func TestSplitSQLStatements_OracleAnonymousBlock(t *testing.T) {
	input := `BEGIN
    INSERT INTO tmp_disable_trigger (table_name) VALUES ('t_memcard_reg');
    UPDATE t_memcard_reg SET CARDLEVEL = 1 WHERE MEMCARDNO = '8032277312';
    DELETE FROM tmp_disable_trigger WHERE table_name = 't_memcard_reg';
END;
SELECT 1 FROM dual;`
	got := splitSQLStatements(input)
	want := []string{
		`BEGIN
    INSERT INTO tmp_disable_trigger (table_name) VALUES ('t_memcard_reg');
    UPDATE t_memcard_reg SET CARDLEVEL = 1 WHERE MEMCARDNO = '8032277312';
    DELETE FROM tmp_disable_trigger WHERE table_name = 't_memcard_reg';
END;`,
		"SELECT 1 FROM dual",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %#v, want %#v", input, got, want)
	}
}

func TestSplitSQLStatements_OracleDeclareBlock(t *testing.T) {
	input := `DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM t_memcard_reg;
    UPDATE t_memcard_reg SET CARDLEVEL = v_count WHERE MEMCARDNO = '8032277312';
END;
SELECT 1 FROM dual;`
	got := splitSQLStatements(input)
	want := []string{
		`DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM t_memcard_reg;
    UPDATE t_memcard_reg SET CARDLEVEL = v_count WHERE MEMCARDNO = '8032277312';
END;`,
		"SELECT 1 FROM dual",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %#v, want %#v", input, got, want)
	}
}

func TestSplitSQLStatements_OracleCreateProcedureBlock(t *testing.T) {
	input := `CREATE OR REPLACE PROCEDURE proc_tally2accept(
    p_tallyacceptno IN t_tally_accept_h.acceptno%TYPE,
    out_acceptno OUT t_accept_h.acceptno%TYPE
) IS
    v_busno t_tally_accept_h.busno%TYPE;
    v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM t_tally_accept_h WHERE acceptno = p_tallyacceptno;
    IF v_count > 0 THEN
        out_acceptno := p_tallyacceptno;
    END IF;
END;
SELECT 1 FROM dual;`
	got := splitSQLStatements(input)
	want := []string{
		`CREATE OR REPLACE PROCEDURE proc_tally2accept(
    p_tallyacceptno IN t_tally_accept_h.acceptno%TYPE,
    out_acceptno OUT t_accept_h.acceptno%TYPE
) IS
    v_busno t_tally_accept_h.busno%TYPE;
    v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM t_tally_accept_h WHERE acceptno = p_tallyacceptno;
    IF v_count > 0 THEN
        out_acceptno := p_tallyacceptno;
    END IF;
END;`,
		"SELECT 1 FROM dual",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %#v, want %#v", input, got, want)
	}
}

func TestSplitSQLStatements_TransactionBeginStillSplits(t *testing.T) {
	input := "BEGIN; UPDATE accounts SET balance = balance - 1 WHERE id = 1; COMMIT;"
	got := splitSQLStatements(input)
	want := []string{
		"BEGIN",
		"UPDATE accounts SET balance = balance - 1 WHERE id = 1",
		"COMMIT",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitSQLStatements(%q) = %#v, want %#v", input, got, want)
	}
}
