package app

import (
	"errors"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

func TestVerifyOptionalDriverAgentReadyForExportAllowsRevisionMismatch(t *testing.T) {
	restore := stubOptionalDriverAgentExportProbe(t, db.OptionalDriverAgentMetadata{AgentRevision: "src-stale-agent"}, nil)
	defer restore()

	err := verifyOptionalDriverAgentReadyForExport(connection.ConnectionConfig{Type: "clickhouse"})
	if err != nil {
		t.Fatalf("revision mismatch must not block export: %v", err)
	}

	err = verifyOptionalDriverAgentReadyForExport(connection.ConnectionConfig{Type: "custom", Driver: "clickhouse"})
	if err != nil {
		t.Fatalf("custom clickhouse revision mismatch must not block export: %v", err)
	}
}

func TestVerifyOptionalDriverAgentReadyForExportStillBlocksMetadataFailure(t *testing.T) {
	restore := stubOptionalDriverAgentExportProbe(t, db.OptionalDriverAgentMetadata{}, errors.New("probe failed"))
	defer restore()

	err := verifyOptionalDriverAgentReadyForExport(connection.ConnectionConfig{Type: "clickhouse"})
	if err == nil {
		t.Fatal("metadata probe failure must still block export")
	}
}

func stubOptionalDriverAgentExportProbe(t *testing.T, metadata db.OptionalDriverAgentMetadata, probeErr error) func() {
	t.Helper()
	originalProbe := optionalDriverAgentMetadataProbe
	originalPath := resolveOptionalDriverAgentExecutablePathFunc
	resolveOptionalDriverAgentExecutablePathFunc = func(string, string) (string, error) {
		return "/tmp/gonavi-fake-driver-agent", nil
	}
	optionalDriverAgentMetadataProbe = func(driverType string, executablePath string) (db.OptionalDriverAgentMetadata, error) {
		if probeErr != nil {
			return db.OptionalDriverAgentMetadata{}, probeErr
		}
		metadata.DriverType = driverType
		if metadata.AgentRevision == "" {
			metadata.AgentRevision = "src-stale-agent"
		}
		_ = executablePath
		return metadata, nil
	}
	return func() {
		optionalDriverAgentMetadataProbe = originalProbe
		resolveOptionalDriverAgentExecutablePathFunc = originalPath
	}
}
