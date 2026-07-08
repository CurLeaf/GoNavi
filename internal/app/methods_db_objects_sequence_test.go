package app

import (
	"strings"
	"testing"
)

func TestBuildObjectSequenceMetadataQueriesOracleUsesWildcardAndObjectFallback(t *testing.T) {
	t.Parallel()

	specs := buildObjectSequenceMetadataQueries("oracle", "sbdev")
	if len(specs) != 2 {
		t.Fatalf("expected 2 Oracle sequence metadata queries, got %d", len(specs))
	}
	if !strings.Contains(specs[0].sql, "SELECT * FROM ALL_SEQUENCES") {
		t.Fatalf("expected ALL_SEQUENCES wildcard query, got %q", specs[0].sql)
	}
	if strings.Contains(specs[0].sql, "LAST_NUMBER") || strings.Contains(specs[0].sql, "ORDER_FLAG") {
		t.Fatalf("query should not enumerate optional sequence columns: %q", specs[0].sql)
	}
	if !strings.Contains(specs[1].sql, "ALL_OBJECTS") || !strings.Contains(specs[1].sql, "OBJECT_TYPE = 'SEQUENCE'") {
		t.Fatalf("expected ALL_OBJECTS fallback query, got %q", specs[1].sql)
	}
}

func TestBuildObjectSequenceMetadataQueriesOracleUserFallbacks(t *testing.T) {
	t.Parallel()

	specs := buildObjectSequenceMetadataQueries("oracle", "")
	if len(specs) != 2 {
		t.Fatalf("expected 2 Oracle user sequence metadata queries, got %d", len(specs))
	}
	if specs[0].sql != "SELECT * FROM USER_SEQUENCES ORDER BY SEQUENCE_NAME" {
		t.Fatalf("unexpected USER_SEQUENCES query: %q", specs[0].sql)
	}
	if !strings.Contains(specs[1].sql, "USER_OBJECTS") || !strings.Contains(specs[1].sql, "OBJECT_TYPE = 'SEQUENCE'") {
		t.Fatalf("expected USER_OBJECTS fallback query, got %q", specs[1].sql)
	}
}
