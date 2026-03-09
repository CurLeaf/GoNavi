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
