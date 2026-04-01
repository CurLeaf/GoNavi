package db

import (
	"errors"
	"reflect"
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
