//go:build gonavi_full_drivers || gonavi_sqlserver_driver || gonavi_kingbase_driver || gonavi_highgo_driver || gonavi_vastbase_driver

package db

import "testing"

func TestBatchWriteDriverCoverage(t *testing.T) {
	t.Run("sqlserver", func(t *testing.T) {
		var driver BatchWriteExecer = (*SqlServerDB)(nil)
		if driver == nil {
			t.Fatal("expected SqlServerDB to implement BatchWriteExecer")
		}
	})

	t.Run("kingbase", func(t *testing.T) {
		var driver BatchWriteExecer = (*KingbaseDB)(nil)
		if driver == nil {
			t.Fatal("expected KingbaseDB to implement BatchWriteExecer")
		}
	})

	t.Run("highgo", func(t *testing.T) {
		var driver BatchWriteExecer = (*HighGoDB)(nil)
		if driver == nil {
			t.Fatal("expected HighGoDB to implement BatchWriteExecer")
		}
	})

	t.Run("vastbase", func(t *testing.T) {
		var driver BatchWriteExecer = (*VastbaseDB)(nil)
		if driver == nil {
			t.Fatal("expected VastbaseDB to implement BatchWriteExecer")
		}
	})
}
