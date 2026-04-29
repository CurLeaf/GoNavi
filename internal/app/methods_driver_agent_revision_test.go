package app

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestOptionalDriverAgentRevisionStatusDetectsStaleClickHouseAgent(t *testing.T) {
	needsUpdate, reason, expected := optionalDriverAgentRevisionStatus("clickhouse", installedDriverPackage{}, true)
	if !needsUpdate {
		t.Fatal("expected missing ClickHouse agent revision to require update")
	}
	if expected == "" {
		t.Fatal("expected ClickHouse to define an agent revision")
	}
	if reason == "" {
		t.Fatal("expected update reason")
	}
	if !strings.Contains(reason, "原因：") || !strings.Contains(reason, "影响：") {
		t.Fatalf("expected reason to explain cause and impact, got %q", reason)
	}
	if !strings.Contains(reason, "强烈建议重装") {
		t.Fatalf("expected reason to strongly recommend reinstall, got %q", reason)
	}

	current := installedDriverPackage{AgentRevision: expected}
	needsUpdate, reason, _ = optionalDriverAgentRevisionStatus("clickhouse", current, true)
	if needsUpdate {
		t.Fatalf("expected current ClickHouse agent revision to be accepted, reason=%q", reason)
	}
}

func TestSavedConnectionDriverUsageCountsIncludesOptionalAndCustomDrivers(t *testing.T) {
	app := &App{configDir: t.TempDir()}
	repo := app.savedConnectionRepository()
	if err := repo.saveAll([]connection.SavedConnectionView{
		{
			ID:   "conn-clickhouse",
			Name: "ClickHouse",
			Config: connection.ConnectionConfig{
				Type: "clickhouse",
			},
		},
		{
			ID:   "conn-custom-clickhouse",
			Name: "Custom ClickHouse",
			Config: connection.ConnectionConfig{
				Type:   "custom",
				Driver: "clickhouse",
			},
		},
		{
			ID:   "conn-mysql",
			Name: "MySQL",
			Config: connection.ConnectionConfig{
				Type: "mysql",
			},
		},
	}); err != nil {
		t.Fatalf("save connections failed: %v", err)
	}

	counts := app.savedConnectionDriverUsageCounts()
	if got := counts["clickhouse"]; got != 2 {
		t.Fatalf("expected two ClickHouse usages, got %d", got)
	}
	if got := counts["mysql"]; got != 0 {
		t.Fatalf("expected built-in MySQL to be ignored, got %d", got)
	}
}
