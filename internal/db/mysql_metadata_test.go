package db

import (
	"errors"
	"reflect"
	"testing"
)

func TestCollectMySQLDatabaseNames_FallsBackToCurrentDatabase(t *testing.T) {
	t.Parallel()

	got, err := collectMySQLDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		switch query {
		case mysqlDatabaseQueries[0]:
			return nil, nil, errors.New("Error 1227 (42000): Access denied; you need (at least one of) the SHOW DATABASES privilege(s) for this operation")
		case mysqlDatabaseQueries[1]:
			return []map[string]interface{}{
				{"Database": "biz_app"},
			}, nil, nil
		default:
			return nil, nil, errors.New("unexpected query")
		}
	})
	if err != nil {
		t.Fatalf("collectMySQLDatabaseNames 返回错误: %v", err)
	}

	want := []string{"biz_app"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected database names, got=%v want=%v", got, want)
	}
}

func TestCollectMySQLDatabaseNames_PrefersShowDatabasesWhenAvailable(t *testing.T) {
	t.Parallel()

	got, err := collectMySQLDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		switch query {
		case mysqlDatabaseQueries[0]:
			return []map[string]interface{}{
				{"Database": "analytics"},
				{"database": "audit"},
			}, nil, nil
		case mysqlDatabaseQueries[1]:
			return []map[string]interface{}{
				{"Database": "should_not_be_used"},
			}, nil, nil
		default:
			return nil, nil, errors.New("unexpected query")
		}
	})
	if err != nil {
		t.Fatalf("collectMySQLDatabaseNames 返回错误: %v", err)
	}

	want := []string{"analytics", "audit"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected database names, got=%v want=%v", got, want)
	}
}

func TestCollectMySQLDatabaseNames_ReturnsOriginalErrorWhenNoDatabaseResolved(t *testing.T) {
	t.Parallel()

	expectErr := errors.New("show databases denied")
	got, err := collectMySQLDatabaseNames(func(query string) ([]map[string]interface{}, []string, error) {
		switch query {
		case mysqlDatabaseQueries[0]:
			return nil, nil, expectErr
		case mysqlDatabaseQueries[1]:
			return []map[string]interface{}{
				{"Database": nil},
			}, nil, nil
		default:
			return nil, nil, errors.New("unexpected query")
		}
	})
	if err == nil {
		t.Fatalf("期望返回错误，实际 got=%v", got)
	}
	if !errors.Is(err, expectErr) {
		t.Fatalf("错误不符合预期: %v", err)
	}
}
