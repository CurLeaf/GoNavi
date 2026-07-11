package db

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestCollectDamengDatabaseNames_UsesCurrentSchemaFallback(t *testing.T) {
	t.Parallel()

	got, err := collectDamengDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		switch query {
		case damengDatabaseQueries[0]:
			return []map[string]interface{}{{"DATABASE_NAME": "APP_SCHEMA"}}, nil, nil
		case damengDatabaseQueries[1]:
			return []map[string]interface{}{{"DATABASE_NAME": "app_schema"}}, nil, nil
		default:
			return nil, nil, errors.New("permission denied")
		}
	})
	if err != nil {
		t.Fatalf("collectDamengDatabaseNames 返回错误: %v", err)
	}

	want := []string{"APP_SCHEMA"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected database names, got=%v want=%v", got, want)
	}
}

func TestCollectDamengDatabaseNames_CollectsOwnersWhenVisible(t *testing.T) {
	t.Parallel()

	got, err := collectDamengDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		switch query {
		case damengDatabaseQueries[0], damengDatabaseQueries[1], damengDatabaseQueries[2], damengDatabaseQueries[3], damengDatabaseQueries[4], damengDatabaseQueries[5]:
			return []map[string]interface{}{}, nil, nil
		case damengDatabaseQueries[6]:
			return []map[string]interface{}{{"OWNER": "BIZ"}, {"OWNER": "audit"}}, nil, nil
		case damengDatabaseQueries[7]:
			return []map[string]interface{}{{"OWNER": "BIZ"}}, nil, nil
		default:
			return nil, nil, nil
		}
	})
	if err != nil {
		t.Fatalf("collectDamengDatabaseNames 返回错误: %v", err)
	}

	want := []string{"audit", "BIZ"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected database names, got=%v want=%v", got, want)
	}
}

func TestCollectDamengDatabaseNames_ReturnsErrorWhenNoNameResolved(t *testing.T) {
	t.Parallel()

	expectErr := errors.New("last query failed")
	got, err := collectDamengDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		if query == damengDatabaseQueries[len(damengDatabaseQueries)-1] {
			return nil, nil, expectErr
		}
		return nil, nil, errors.New("permission denied")
	})
	if err == nil {
		t.Fatalf("期望返回错误，实际 got=%v", got)
	}
	if !errors.Is(err, expectErr) {
		t.Fatalf("错误不符合预期: %v", err)
	}
}

// TestCollectDamengDatabaseNames_IncludesSYSDBA 验证 SYSDBA（达梦默认管理员 schema）
// 不会被系统 schema 过滤排除。
func TestCollectDamengDatabaseNames_IncludesSYSDBA(t *testing.T) {
	t.Parallel()

	got, err := collectDamengDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		switch query {
		case damengDatabaseQueries[0]:
			// 查询 0 返回 SYSDBA（之前会被排除，修复后应该返回）
			return []map[string]interface{}{{"DATABASE_NAME": "SYSDBA"}}, nil, nil
		default:
			return nil, nil, errors.New("permission denied")
		}
	})
	if err != nil {
		t.Fatalf("collectDamengDatabaseNames 返回错误: %v", err)
	}

	want := []string{"SYSDBA"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("SYSDBA 应该包含在结果中, got=%v want=%v", got, want)
	}
}

// TestCollectDamengDatabaseNames_FallbackToCurrentUser 验证当所有查询都失败时
// 兜底查询 SELECT USER FROM DUAL 能返回当前用户作为 schema。
func TestCollectDamengDatabaseNames_FallbackToCurrentUser(t *testing.T) {
	t.Parallel()

	lastQuery := damengDatabaseQueries[len(damengDatabaseQueries)-1]
	got, err := collectDamengDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		if query == lastQuery {
			return []map[string]interface{}{{"DATABASE_NAME": "SYSDBA"}}, nil, nil
		}
		// 前面所有查询要么返回空要么报错
		return []map[string]interface{}{}, nil, nil
	})
	if err != nil {
		t.Fatalf("collectDamengDatabaseNames 返回错误: %v", err)
	}

	want := []string{"SYSDBA"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("兜底查询应该返回当前用户, got=%v want=%v", got, want)
	}
}

func TestBuildDamengColumnsQuery_IncludesColumnCommentsJoin(t *testing.T) {
	t.Parallel()

	userQuery := buildDamengColumnsQuery("", "orders")
	if !strings.Contains(userQuery, "user_col_comments") {
		t.Fatalf("expected user query to join user_col_comments, got: %s", userQuery)
	}
	if !strings.Contains(userQuery, "cc.comments AS col_comment") {
		t.Fatalf("expected user query to select column comments as col_comment, got: %s", userQuery)
	}
	if strings.Contains(strings.ToLower(userQuery), " as comment") {
		t.Fatalf("dameng forbids AS comment alias (reserved word), got: %s", userQuery)
	}

	allQuery := buildDamengColumnsQuery("app", "orders")
	if !strings.Contains(allQuery, "all_col_comments") {
		t.Fatalf("expected schema query to join all_col_comments, got: %s", allQuery)
	}
	if !strings.Contains(allQuery, "cc.comments AS col_comment") {
		t.Fatalf("expected schema query to select column comments as col_comment, got: %s", allQuery)
	}
	if strings.Contains(strings.ToLower(allQuery), " as comment") {
		t.Fatalf("dameng forbids AS comment alias (reserved word), got: %s", allQuery)
	}
}

func TestBuildDamengColumnDefinitions_MapsComment(t *testing.T) {
	t.Parallel()

	columns := buildDamengColumnDefinitions([]map[string]interface{}{
		{
			"COLUMN_NAME":  "ID",
			"DATA_TYPE":    "NUMBER",
			"NULLABLE":     "N",
			"COLUMN_KEY":   "PRI",
			"COL_COMMENT":  "主键",
		},
	})

	if len(columns) != 1 {
		t.Fatalf("expected one column, got=%d", len(columns))
	}
	if columns[0].Comment != "主键" {
		t.Fatalf("expected comment to be mapped, got=%q", columns[0].Comment)
	}
}
