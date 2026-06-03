package app

import "testing"

func TestSanitizeSQLForPgLike_FixesBrokenDoubleDoubleQuotes(t *testing.T) {
	in := `SELECT * FROM ""ldf_server"".""t_user"" LIMIT 1`
	out := sanitizeSQLForPgLike("kingbase", in)
	want := `SELECT * FROM "ldf_server"."t_user" LIMIT 1`
	if out != want {
		t.Fatalf("unexpected sanitize output:\nIN:   %s\nOUT:  %s\nWANT: %s", in, out, want)
	}
}

func TestSanitizeSQLForPgLike_KingbaseAliasFixesBrokenDoubleDoubleQuotes(t *testing.T) {
	in := `SELECT * FROM ""ldf_server"".""t_user"" LIMIT 1`
	out := sanitizeSQLForPgLike("kingbase8", in)
	want := `SELECT * FROM "ldf_server"."t_user" LIMIT 1`
	if out != want {
		t.Fatalf("unexpected sanitize output:\nIN:   %s\nOUT:  %s\nWANT: %s", in, out, want)
	}
}

func TestSanitizeSQLForPgLike_FixesBrokenDoubleDoubleQuotes_WithExtraQuotes(t *testing.T) {
	in := `SELECT * FROM ""ldf_server""".""t_user"" LIMIT 1`
	out := sanitizeSQLForPgLike("kingbase", in)
	want := `SELECT * FROM "ldf_server"."t_user" LIMIT 1`
	if out != want {
		t.Fatalf("unexpected sanitize output:\nIN:   %s\nOUT:  %s\nWANT: %s", in, out, want)
	}
}

func TestSanitizeSQLForPgLike_FixesBrokenDoubleDoubleQuotes_WithQuadQuotes(t *testing.T) {
	in := `SELECT * FROM """"ldf_server"""".""t_user"" LIMIT 1`
	out := sanitizeSQLForPgLike("kingbase", in)
	want := `SELECT * FROM "ldf_server"."t_user" LIMIT 1`
	if out != want {
		t.Fatalf("unexpected sanitize output:\nIN:   %s\nOUT:  %s\nWANT: %s", in, out, want)
	}
}

func TestSanitizeSQLForPgLike_DoesNotTouchEscapedQuotesInsideIdentifier(t *testing.T) {
	in := `SELECT "a""b" FROM "t""x"`
	out := sanitizeSQLForPgLike("postgres", in)
	if out != in {
		t.Fatalf("should keep valid escaped quotes inside identifier:\nIN:  %s\nOUT: %s", in, out)
	}
}

func TestSanitizeSQLForPgLike_DoesNotTouchDollarQuotedStrings(t *testing.T) {
	in := "SELECT $$\"\"ldf_server\"\"$$, \"\"ldf_server\"\""
	out := sanitizeSQLForPgLike("postgres", in)
	want := "SELECT $$\"\"ldf_server\"\"$$, \"ldf_server\""
	if out != want {
		t.Fatalf("unexpected sanitize output for dollar quoted string:\nIN:   %s\nOUT:  %s\nWANT: %s", in, out, want)
	}
}

func TestSanitizeSQLForPgLike_DoesNotModifyOtherDBTypes(t *testing.T) {
	in := `SELECT * FROM ""ldf_server""`
	out := sanitizeSQLForPgLike("mysql", in)
	if out != in {
		t.Fatalf("non-PG-like db should not be sanitized:\nIN:  %s\nOUT: %s", in, out)
	}
}

func TestIsReadOnlySQLQuery_DoesNotTreatExecAsReadOnly(t *testing.T) {
	if isReadOnlySQLQuery("sqlserver", "EXEC sp_who2") {
		t.Fatal("EXEC should not be treated as read-only SQL")
	}
}

func TestIsBatchableWriteSQLStatement_OnlyMatchesRealWriteStatements(t *testing.T) {
	if !isBatchableWriteSQLStatement("mysql", "INSERT INTO demo(id) VALUES (1)") {
		t.Fatal("expected INSERT to be treated as batchable write")
	}
	if isBatchableWriteSQLStatement("sqlserver", "EXEC sp_who2") {
		t.Fatal("EXEC should not be treated as batchable write")
	}
	if isBatchableWriteSQLStatement("sqlserver", "SET STATISTICS IO ON") {
		t.Fatal("SET STATISTICS should not be treated as batchable write")
	}
}

func TestShouldTryQueryResultFirst_TreatsSQLServerSetAsQueryFirst(t *testing.T) {
	if !shouldTryQueryResultFirst("sqlserver", "SET STATISTICS IO ON") {
		t.Fatal("expected SQL Server SET STATISTICS to try query-first for notice capture")
	}
	if shouldTryQueryResultFirst("mysql", "SET sql_mode = ''") {
		t.Fatal("non-SQLServer SET should not force query-first")
	}
}

func TestShouldTryQueryResultFirst_TreatsSQLServerSystemCommandsAsQueryFirst(t *testing.T) {
	if !shouldTryQueryResultFirst("sqlserver", "sp_who2") {
		t.Fatal("expected bare SQL Server system procedure to try query-first")
	}
	if !shouldTryQueryResultFirst("sqlserver", "DBCC INPUTBUFFER(52)") {
		t.Fatal("expected SQL Server DBCC command to try query-first")
	}
	if shouldTryQueryResultFirst("mysql", "sp_who2") {
		t.Fatal("non-SQLServer system procedure name should not force query-first")
	}
}
