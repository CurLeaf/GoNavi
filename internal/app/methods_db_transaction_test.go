package app

import "testing"

func TestShouldUseManagedSQLTransaction_TrinoAlwaysUsesPlainExecution(t *testing.T) {
	t.Parallel()

	if shouldUseManagedSQLTransaction("trino", "UPDATE hive.default.orders SET status = 'done'") {
		t.Fatal("expected trino DML to skip SQL editor managed transactions")
	}
	if shouldUseManagedSQLTransaction("trino", "BEGIN; UPDATE hive.default.orders SET status = 'done'; COMMIT;") {
		t.Fatal("expected trino explicit transactions to stay unmanaged")
	}
}
