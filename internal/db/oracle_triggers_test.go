package db

import (
	"database/sql/driver"
	"slices"
	"strings"
	"testing"
)

func TestOracleGetTriggersUsesDBMSMetadataDDL(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	triggerListQuery := buildOracleTriggersQuery("H2", "T_MEMCARD_CASH")
	triggerDDLQuery := `SELECT DBMS_METADATA.GET_DDL('TRIGGER', 'TR_T_MEMCARD_CASH', 'H2') as ddl FROM DUAL`
	metadataDDL := `CREATE OR REPLACE TRIGGER "H2"."TR_T_MEMCARD_CASH"
BEFORE INSERT ON "H2"."T_MEMCARD_CASH"
BEGIN
  NULL;
END;`

	state.mu.Lock()
	state.queryResults[triggerListQuery] = oracleRecordingQueryResult{
		columns: []string{"OWNER", "TABLE_OWNER", "TABLE_NAME", "TRIGGER_NAME", "TRIGGER_TYPE", "TRIGGERING_EVENT", "WHEN_CLAUSE", "TRIGGER_BODY"},
		rows: [][]driver.Value{
			{"H2", "H2", "T_MEMCARD_CASH", "TR_T_MEMCARD_CASH", "BEFORE EACH ROW", "INSERT", nil, "SOURCE HIDDEN"},
		},
	}
	state.queryResults[triggerDDLQuery] = oracleRecordingQueryResult{
		columns: []string{"DDL"},
		rows: [][]driver.Value{
			{metadataDDL},
		},
	}
	state.mu.Unlock()

	oracleDB := &OracleDB{conn: dbConn}
	triggers, err := oracleDB.GetTriggers("H2", "T_MEMCARD_CASH")
	if err != nil {
		t.Fatalf("GetTriggers 返回错误: %v", err)
	}
	if len(triggers) != 1 {
		t.Fatalf("期望返回 1 个触发器，实际 %#v", triggers)
	}
	if !strings.Contains(triggers[0].Statement, `CREATE OR REPLACE TRIGGER "H2"."TR_T_MEMCARD_CASH"`) {
		t.Fatalf("期望返回 DBMS_METADATA 完整 DDL，实际: %s", triggers[0].Statement)
	}
	if strings.Contains(triggers[0].Statement, "SOURCE HIDDEN") {
		t.Fatalf("触发器语句不应继续返回 SOURCE HIDDEN: %s", triggers[0].Statement)
	}
	if queries := state.snapshotQueries(); !slices.Contains(queries, triggerDDLQuery) {
		t.Fatalf("期望查询 DBMS_METADATA 获取触发器 DDL，实际 queries=%v", queries)
	}
}

func TestOracleGetTriggersRebuildsDDLFromTriggerBodyWhenMetadataDDLIsEmpty(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	triggerListQuery := buildOracleTriggersQuery("H2", "T_MEMCARD_CASH")
	triggerDDLQuery := `SELECT DBMS_METADATA.GET_DDL('TRIGGER', 'TR_T_MEMCARD_CASH', 'H2') as ddl FROM DUAL`

	state.mu.Lock()
	state.queryResults[triggerListQuery] = oracleRecordingQueryResult{
		columns: []string{"OWNER", "TABLE_OWNER", "TABLE_NAME", "TRIGGER_NAME", "TRIGGER_TYPE", "TRIGGERING_EVENT", "WHEN_CLAUSE", "TRIGGER_BODY"},
		rows: [][]driver.Value{
			{"H2", "H2", "T_MEMCARD_CASH", "TR_T_MEMCARD_CASH", "BEFORE EACH ROW", "INSERT OR UPDATE", "NEW.ID IS NOT NULL", "BEGIN\n  :NEW.UPDATED_AT := SYSDATE;\nEND;"},
		},
	}
	state.queryResults[triggerDDLQuery] = oracleRecordingQueryResult{
		columns: []string{"DDL"},
		rows:    [][]driver.Value{},
	}
	state.mu.Unlock()

	oracleDB := &OracleDB{conn: dbConn}
	triggers, err := oracleDB.GetTriggers("H2", "T_MEMCARD_CASH")
	if err != nil {
		t.Fatalf("GetTriggers 返回错误: %v", err)
	}
	if len(triggers) != 1 {
		t.Fatalf("期望返回 1 个触发器，实际 %#v", triggers)
	}

	statement := triggers[0].Statement
	for _, want := range []string{
		`CREATE OR REPLACE TRIGGER "H2"."TR_T_MEMCARD_CASH"`,
		`BEFORE INSERT OR UPDATE ON "H2"."T_MEMCARD_CASH"`,
		`FOR EACH ROW`,
		`WHEN (NEW.ID IS NOT NULL)`,
		`:NEW.UPDATED_AT := SYSDATE;`,
	} {
		if !strings.Contains(statement, want) {
			t.Fatalf("期望重建后的触发器 DDL 包含 %q，实际: %s", want, statement)
		}
	}
	if strings.Contains(statement, "SOURCE HIDDEN") {
		t.Fatalf("触发器语句不应继续返回 SOURCE HIDDEN: %s", statement)
	}
}
