package app

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/shared/i18n"
)

func useDriverStatusLanguage(t *testing.T, language i18n.Language) {
	t.Helper()
	previous := defaultAppTextLanguage
	setDefaultAppLanguage(language)
	t.Cleanup(func() {
		setDefaultAppLanguage(previous)
	})
}

func TestOptionalDriverPackageUpdateStatusTiersRevisionMismatch(t *testing.T) {
	useDriverStatusLanguage(t, i18n.LanguageZhCN)
	clickhouseRevision := db.OptionalDriverAgentRevision("clickhouse")
	if clickhouseRevision == "" {
		t.Fatal("clickhouse revision must be present for tier tests")
	}

	tests := []struct {
		name           string
		definition     driverDefinition
		pkg            installedDriverPackage
		metaExists     bool
		wantUpdate     bool
		wantOptional   bool
		reasonContains string
	}{
		{
			name:           "unchanged pinned version is optional",
			definition:     driverDefinition{Type: "clickhouse", Name: "ClickHouse", PinnedVersion: "2.43.1"},
			pkg:            installedDriverPackage{Version: "2.43.1", AgentRevision: "src-stale-shared-bump"},
			metaExists:     true,
			wantOptional:   true,
			reasonContains: "驱动库版本未变化",
		},
		{
			name:           "installed latest different from pinned is optional",
			definition:     driverDefinition{Type: "clickhouse", Name: "ClickHouse", PinnedVersion: "0.0.1"},
			pkg:            installedDriverPackage{Version: latestDriverVersionMap["clickhouse"], AgentRevision: "src-stale-shared-bump"},
			metaExists:     true,
			wantOptional:   true,
			reasonContains: "仍可正常使用",
		},
		{
			name:       "changed library version stays required",
			definition: driverDefinition{Type: "clickhouse", Name: "ClickHouse", PinnedVersion: "9.9.9"},
			pkg:        installedDriverPackage{Version: "0.0.1", AgentRevision: "src-stale"},
			metaExists: true,
			wantUpdate: true,
		},
		{
			name:       "missing installed version stays required",
			definition: driverDefinition{Type: "clickhouse", Name: "ClickHouse", PinnedVersion: "2.43.1"},
			pkg:        installedDriverPackage{Version: "", AgentRevision: "src-stale"},
			metaExists: true,
			wantUpdate: true,
		},
		{
			name:       "matching revision needs neither",
			definition: driverDefinition{Type: "clickhouse", Name: "ClickHouse", PinnedVersion: "2.43.1"},
			pkg:        installedDriverPackage{Version: "2.43.1", AgentRevision: clickhouseRevision},
			metaExists: true,
		},
		{
			name:           "mongodb v2 against v1 pin stays required",
			definition:     driverDefinition{Type: "mongodb", Name: "MongoDB", PinnedVersion: "1.17.9"},
			pkg:            installedDriverPackage{Version: latestDriverVersionMap["mongodb"], AgentRevision: "src-stale"},
			metaExists:     true,
			wantUpdate:     true,
			reasonContains: "wire version 7",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			needsUpdate, optionalUpdate, reason, _ := optionalDriverPackageUpdateStatus(tt.definition, tt.pkg, tt.metaExists)
			if needsUpdate != tt.wantUpdate || optionalUpdate != tt.wantOptional {
				t.Fatalf("needsUpdate=%v optionalUpdate=%v, want needsUpdate=%v optionalUpdate=%v, reason=%q", needsUpdate, optionalUpdate, tt.wantUpdate, tt.wantOptional, reason)
			}
			if tt.wantUpdate && optionalUpdate {
				t.Fatalf("required update must not also be optional, reason=%q", reason)
			}
			if tt.reasonContains != "" && !strings.Contains(reason, tt.reasonContains) {
				t.Fatalf("reason %q does not contain %q", reason, tt.reasonContains)
			}
			if tt.wantOptional && strings.Contains(reason, "强烈建议重装") {
				t.Fatalf("optional update must not use the required reinstall copy, reason=%q", reason)
			}
		})
	}
}
