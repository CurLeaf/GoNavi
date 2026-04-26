package app

import (
	"context"
	"errors"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
)

type fakeJVMMonitoringManager struct {
	startSnapshot     jvm.MonitoringSessionSnapshot
	startErr          error
	historySnapshot   jvm.MonitoringSessionSnapshot
	historyErr        error
	stopErr           error
	startCfg          connection.ConnectionConfig
	startMode         string
	historyConnection string
	historyMode       string
	stopConnection    string
	stopMode          string
}

func (f *fakeJVMMonitoringManager) Start(_ context.Context, cfg connection.ConnectionConfig, mode string) (jvm.MonitoringSessionSnapshot, error) {
	f.startCfg = cfg
	f.startMode = mode
	return f.startSnapshot, f.startErr
}

func (f *fakeJVMMonitoringManager) GetHistory(connectionID string, providerMode string) (jvm.MonitoringSessionSnapshot, error) {
	f.historyConnection = connectionID
	f.historyMode = providerMode
	return f.historySnapshot, f.historyErr
}

func (f *fakeJVMMonitoringManager) Stop(connectionID string, providerMode string) error {
	f.stopConnection = connectionID
	f.stopMode = providerMode
	return f.stopErr
}

func swapJVMMonitoringManager(manager jvmMonitoringService) func() {
	prev := currentJVMMonitoringManager
	currentJVMMonitoringManager = manager
	return func() { currentJVMMonitoringManager = prev }
}

func TestJVMStartMonitoringReturnsManagerSnapshot(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	manager := &fakeJVMMonitoringManager{
		startSnapshot: jvm.MonitoringSessionSnapshot{
			ConnectionID: "conn-monitor",
			ProviderMode: jvm.ModeEndpoint,
			Running:      true,
			Points: []jvm.JVMMonitoringPoint{
				{Timestamp: 1713945600000, ThreadCount: 21},
			},
		},
	}
	restore := swapJVMMonitoringManager(manager)
	defer restore()

	res := app.JVMStartMonitoring(connection.ConnectionConfig{
		ID:   "conn-monitor",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: jvm.ModeEndpoint,
			AllowedModes:  []string{jvm.ModeEndpoint},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	snapshot, ok := res.Data.(jvm.MonitoringSessionSnapshot)
	if !ok {
		t.Fatalf("expected monitoring snapshot, got %#v", res.Data)
	}
	if !snapshot.Running || len(snapshot.Points) != 1 {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
	if manager.startCfg.ID != "conn-monitor" {
		t.Fatalf("expected manager to receive config ID, got %#v", manager.startCfg)
	}
}

func TestJVMGetMonitoringHistoryResolvesPreferredMode(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	manager := &fakeJVMMonitoringManager{
		historySnapshot: jvm.MonitoringSessionSnapshot{
			ConnectionID: "conn-history",
			ProviderMode: jvm.ModeJMX,
			Running:      true,
		},
	}
	restore := swapJVMMonitoringManager(manager)
	defer restore()

	res := app.JVMGetMonitoringHistory(connection.ConnectionConfig{
		ID:   "conn-history",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: jvm.ModeJMX,
			AllowedModes:  []string{jvm.ModeJMX},
		},
	}, "")

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if manager.historyConnection != "conn-history" || manager.historyMode != jvm.ModeJMX {
		t.Fatalf("unexpected manager history args: connection=%q mode=%q", manager.historyConnection, manager.historyMode)
	}
}

func TestJVMStopMonitoringReturnsManagerError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	manager := &fakeJVMMonitoringManager{
		stopErr: errors.New("session not found"),
	}
	restore := swapJVMMonitoringManager(manager)
	defer restore()

	res := app.JVMStopMonitoring(connection.ConnectionConfig{
		ID:   "conn-stop",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: jvm.ModeAgent,
			AllowedModes:  []string{jvm.ModeAgent},
		},
	}, "")

	if res.Success {
		t.Fatalf("expected failure, got %+v", res)
	}
	if res.Message != "session not found" {
		t.Fatalf("expected message %q, got %#v", "session not found", res)
	}
	if manager.stopConnection != "conn-stop" || manager.stopMode != jvm.ModeAgent {
		t.Fatalf("unexpected manager stop args: connection=%q mode=%q", manager.stopConnection, manager.stopMode)
	}
}
