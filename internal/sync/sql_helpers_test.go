package sync

import "testing"

func TestQuoteQualifiedIdentByType_KingbaseLeavesLowercaseQualifiedTableUnquoted(t *testing.T) {
	t.Parallel()

	got := quoteQualifiedIdentByType("kingbase", "ldf_server.andon_events")
	if got != "ldf_server.andon_events" {
		t.Fatalf("unexpected kingbase qualified identifier: %s", got)
	}
}

func TestQuoteQualifiedIdentByType_KingbaseNormalizesEscapedQuotedQualifiedTable(t *testing.T) {
	t.Parallel()

	got := quoteQualifiedIdentByType("kingbase", `\"Idf_server\".\"andon_events\"`)
	if got != `"Idf_server".andon_events` {
		t.Fatalf("unexpected kingbase qualified identifier: %s", got)
	}
}

func TestQuoteQualifiedIdentByType_KingbaseAliasUsesKingbaseQuoting(t *testing.T) {
	t.Parallel()

	got := quoteQualifiedIdentByType("kingbase8", `\"ldf_server\".\"andon_events\"`)
	if got != "ldf_server.andon_events" {
		t.Fatalf("unexpected kingbase alias qualified identifier: %s", got)
	}
}

func TestQuoteIdentByType_KingbaseStillQuotesReservedAndMixedCaseIdentifiers(t *testing.T) {
	t.Parallel()

	if got := quoteIdentByType("kingbase", "select"); got != `"select"` {
		t.Fatalf("expected reserved word to stay quoted, got %s", got)
	}
	if got := quoteIdentByType("kingbase", "CamelName"); got != `"CamelName"` {
		t.Fatalf("expected mixed-case identifier to stay quoted, got %s", got)
	}
}

func TestNormalizeSchemaAndTable_KingbaseNormalizesEscapedQualifiedName(t *testing.T) {
	t.Parallel()

	schema, table := normalizeSchemaAndTable("kingbase", "demo", `\"Idf_server\".\"andon_events\"`)
	if schema != "Idf_server" || table != "andon_events" {
		t.Fatalf("unexpected kingbase schema/table: %q.%q", schema, table)
	}
}

func TestNormalizeMigrationDBType_KingbaseAliases(t *testing.T) {
	t.Parallel()

	for _, in := range []string{"kingbase8", "kingbasees", "kingbasev8"} {
		if got := normalizeMigrationDBType(in); got != "kingbase" {
			t.Fatalf("normalizeMigrationDBType(%q)=%q, want kingbase", in, got)
		}
	}
}
