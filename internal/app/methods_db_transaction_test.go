package app

import "testing"

func TestShouldUseManagedSQLTransaction_UnsupportedTypesUsePlainExecution(t *testing.T) {
	t.Parallel()

	cases := []struct {
		dbType string
		query  string
	}{
		{dbType: "trino", query: "UPDATE hive.default.orders SET status = 'done'"},
		{dbType: "tdengine", query: "INSERT INTO meters(ts, current) VALUES (NOW, 10.2)"},
		{dbType: "clickhouse", query: `INSERT INTO events FORMAT JSONEachRow {"id":1}`},
		{dbType: "iotdb", query: "INSERT INTO root.ln.wf01.wt01(timestamp,status) VALUES(1,true)"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.dbType, func(t *testing.T) {
			t.Parallel()
			if shouldUseManagedSQLTransaction(tc.dbType, tc.query) {
				t.Fatalf("expected %s DML to skip SQL editor managed transactions", tc.dbType)
			}
			if shouldUseManagedSQLTransaction(tc.dbType, "BEGIN; "+tc.query+"; COMMIT;") {
				t.Fatalf("expected %s explicit transactions to stay unmanaged", tc.dbType)
			}
		})
	}
}

func TestShouldUseManagedSQLTransaction_OracleAnonymousBlockWithDMLUsesManagedTransaction(t *testing.T) {
	t.Parallel()

	query := `BEGIN
    UPDATE users SET name = 'new' WHERE id = 1;
    DELETE FROM audit_logs WHERE user_id = 1;
END;`
	if !shouldUseManagedSQLTransaction("oracle", query) {
		t.Fatal("expected Oracle anonymous block with DML to use SQL editor managed transaction")
	}
}

func TestShouldUseManagedSQLTransaction_OracleReadOnlyAnonymousBlockStaysUnmanaged(t *testing.T) {
	t.Parallel()

	query := `BEGIN
    NULL;
END;`
	if shouldUseManagedSQLTransaction("oracle", query) {
		t.Fatal("expected Oracle read-only anonymous block to stay unmanaged")
	}
}
