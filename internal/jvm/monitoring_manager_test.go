package jvm

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
)

type fakeMonitoringProvider struct {
	snapshot    JVMMonitoringSnapshot
	snapshotErr error
}

type blockingMonitoringProvider struct {
	fakeMonitoringProvider
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

type fakeProviderWithoutMonitoring struct{}

func (f fakeMonitoringProvider) Mode() string { return ModeJMX }
func (f fakeMonitoringProvider) TestConnection(context.Context, connection.ConnectionConfig) error {
	return nil
}
func (f fakeMonitoringProvider) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]Capability, error) {
	return nil, nil
}
func (f fakeMonitoringProvider) ListResources(context.Context, connection.ConnectionConfig, string) ([]ResourceSummary, error) {
	return nil, nil
}
func (f fakeMonitoringProvider) GetValue(context.Context, connection.ConnectionConfig, string) (ValueSnapshot, error) {
	return ValueSnapshot{}, nil
}
func (f fakeMonitoringProvider) PreviewChange(context.Context, connection.ConnectionConfig, ChangeRequest) (ChangePreview, error) {
	return ChangePreview{}, nil
}
func (f fakeMonitoringProvider) ApplyChange(context.Context, connection.ConnectionConfig, ChangeRequest) (ApplyResult, error) {
	return ApplyResult{}, nil
}
func (f fakeMonitoringProvider) GetMonitoringSnapshot(context.Context, connection.ConnectionConfig, *JVMMonitoringPoint) (JVMMonitoringSnapshot, error) {
	return f.snapshot, f.snapshotErr
}

func (p *blockingMonitoringProvider) GetMonitoringSnapshot(context.Context, connection.ConnectionConfig, *JVMMonitoringPoint) (JVMMonitoringSnapshot, error) {
	p.once.Do(func() {
		close(p.started)
	})
	<-p.release
	return p.snapshot, p.snapshotErr
}

func (f fakeProviderWithoutMonitoring) Mode() string { return ModeJMX }
func (f fakeProviderWithoutMonitoring) TestConnection(context.Context, connection.ConnectionConfig) error {
	return nil
}
func (f fakeProviderWithoutMonitoring) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]Capability, error) {
	return nil, nil
}
func (f fakeProviderWithoutMonitoring) ListResources(context.Context, connection.ConnectionConfig, string) ([]ResourceSummary, error) {
	return nil, nil
}
func (f fakeProviderWithoutMonitoring) GetValue(context.Context, connection.ConnectionConfig, string) (ValueSnapshot, error) {
	return ValueSnapshot{}, nil
}
func (f fakeProviderWithoutMonitoring) PreviewChange(context.Context, connection.ConnectionConfig, ChangeRequest) (ChangePreview, error) {
	return ChangePreview{}, nil
}
func (f fakeProviderWithoutMonitoring) ApplyChange(context.Context, connection.ConnectionConfig, ChangeRequest) (ApplyResult, error) {
	return ApplyResult{}, nil
}

func swapMonitoringProviderFactory(factory func(mode string) (Provider, error)) func() {
	prev := monitoringProviderFactory
	monitoringProviderFactory = factory
	return func() { monitoringProviderFactory = prev }
}

func TestMonitoringRingBufferKeepsLatestPoints(t *testing.T) {
	manager := newMonitoringManagerForTest(3)
	session := manager.ensureSession("conn-1", ModeJMX)

	for i := 1; i <= 5; i++ {
		session.appendPoint(JVMMonitoringPoint{Timestamp: int64(i)})
	}

	snapshot := session.snapshot()
	if len(snapshot.Points) != 3 {
		t.Fatalf("expected 3 points, got %d", len(snapshot.Points))
	}
	if snapshot.Points[0].Timestamp != 3 || snapshot.Points[2].Timestamp != 5 {
		t.Fatalf("unexpected points order: %#v", snapshot.Points)
	}
}

func TestMonitoringSessionSnapshotCarriesProviderWarningsAndGCEvents(t *testing.T) {
	manager := newMonitoringManagerForTest(5)
	session := manager.ensureSession("conn-2", ModeEndpoint)
	session.running = true
	session.availableMetrics = []string{"heap.used", "thread.count", "memory.rss"}
	session.missingMetrics = []string{"cpu.process", "gc.events"}
	session.providerWarnings = []string{"endpoint metrics degraded"}
	session.recentGCEvents = []RecentGCEvent{
		{
			Timestamp:       1713945600000,
			Name:            "G1 Young Generation",
			Cause:           "G1 Evacuation Pause",
			Action:          "end of minor GC",
			DurationMs:      21,
			BeforeUsedBytes: 734003200,
			AfterUsedBytes:  503316480,
		},
	}
	session.appendPoint(JVMMonitoringPoint{
		Timestamp:       1713945600000,
		ThreadCount:     18,
		HeapUsedBytes:   503316480,
		ProcessRssBytes: 1073741824,
	})

	snapshot := session.snapshot()
	if !snapshot.Running {
		t.Fatalf("expected session to be running")
	}
	if snapshot.ProviderMode != ModeEndpoint {
		t.Fatalf("expected provider mode %q, got %q", ModeEndpoint, snapshot.ProviderMode)
	}
	if len(snapshot.AvailableMetrics) != 3 {
		t.Fatalf("expected available metrics, got %#v", snapshot.AvailableMetrics)
	}
	if len(snapshot.MissingMetrics) != 2 || snapshot.MissingMetrics[0] != "cpu.process" {
		t.Fatalf("unexpected missing metrics: %#v", snapshot.MissingMetrics)
	}
	if len(snapshot.ProviderWarnings) != 1 {
		t.Fatalf("expected provider warning, got %#v", snapshot.ProviderWarnings)
	}
	if len(snapshot.RecentGCEvents) != 1 {
		t.Fatalf("expected recent gc event, got %#v", snapshot.RecentGCEvents)
	}
	if len(snapshot.Points) != 1 || snapshot.Points[0].ThreadCount != 18 || snapshot.Points[0].HeapUsedBytes != 503316480 {
		t.Fatalf("unexpected points snapshot: %#v", snapshot.Points)
	}
}

func TestMonitoringManagerStartSamplesImmediatelyAndReturnsHistory(t *testing.T) {
	manager := newMonitoringManagerForTest(5)
	restore := swapMonitoringProviderFactory(func(mode string) (Provider, error) {
		return fakeMonitoringProvider{
			snapshot: JVMMonitoringSnapshot{
				Point: JVMMonitoringPoint{
					Timestamp:      1713945600000,
					ThreadCount:    12,
					HeapUsedBytes:  268435456,
					ProcessCpuLoad: 0.42,
				},
				AvailableMetrics: []string{"thread.count", "heap.used"},
				MissingMetrics:   []string{"cpu.process"},
				ProviderWarnings: []string{"jmx cpu metric unavailable"},
			},
		}, nil
	})
	defer restore()

	readOnly := true
	cfg := connection.ConnectionConfig{
		ID:   "conn-monitor",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}

	snapshot, err := manager.Start(context.Background(), cfg, "")
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}
	if !snapshot.Running {
		t.Fatalf("expected started session to be running")
	}
	if len(snapshot.Points) != 1 || snapshot.Points[0].ThreadCount != 12 || snapshot.Points[0].HeapUsedBytes != 268435456 {
		t.Fatalf("unexpected initial points: %#v", snapshot.Points)
	}

	history, err := manager.GetHistory("conn-monitor", ModeJMX)
	if err != nil {
		t.Fatalf("GetHistory returned error: %v", err)
	}
	if len(history.MissingMetrics) != 1 || history.MissingMetrics[0] != "cpu.process" {
		t.Fatalf("unexpected history missing metrics: %#v", history.MissingMetrics)
	}
	if len(history.ProviderWarnings) != 1 {
		t.Fatalf("unexpected provider warnings: %#v", history.ProviderWarnings)
	}
}

func TestMonitoringManagerStopMarksSessionStopped(t *testing.T) {
	manager := newMonitoringManagerForTest(5)
	restore := swapMonitoringProviderFactory(func(mode string) (Provider, error) {
		return fakeMonitoringProvider{
			snapshot: JVMMonitoringSnapshot{
				Point: JVMMonitoringPoint{Timestamp: 1713945600000, ThreadCount: 7},
			},
		}, nil
	})
	defer restore()

	cfg := connection.ConnectionConfig{
		ID:   "conn-stop",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: ModeEndpoint,
			AllowedModes:  []string{ModeEndpoint},
		},
	}

	if _, err := manager.Start(context.Background(), cfg, ModeEndpoint); err != nil {
		t.Fatalf("Start returned error: %v", err)
	}
	if err := manager.Stop("conn-stop", ModeEndpoint); err != nil {
		t.Fatalf("Stop returned error: %v", err)
	}

	history, err := manager.GetHistory("conn-stop", ModeEndpoint)
	if err != nil {
		t.Fatalf("GetHistory returned error: %v", err)
	}
	if history.Running {
		t.Fatalf("expected session to stop running, got %#v", history)
	}
}

func TestMonitoringManagerReturnsLocalizedErrorsForFixedMonitoringFailures(t *testing.T) {
	manager := newMonitoringManagerForTest(5)

	_, err := manager.GetHistory("conn-missing", ModeJMX)
	assertMonitoringLocalizedError(t, err, "jvm.backend.monitoring.error.session_not_found", map[string]any{
		"connectionId": "conn-missing",
		"providerMode": ModeJMX,
	})

	err = manager.Stop("conn-missing", ModeAgent)
	assertMonitoringLocalizedError(t, err, "jvm.backend.monitoring.error.session_not_found", map[string]any{
		"connectionId": "conn-missing",
		"providerMode": ModeAgent,
	})

	restore := swapMonitoringProviderFactory(func(mode string) (Provider, error) {
		return fakeProviderWithoutMonitoring{}, nil
	})
	defer restore()

	_, err = manager.Start(context.Background(), connection.ConnectionConfig{
		ID:   "conn-monitor",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, "")
	assertMonitoringLocalizedError(t, err, "jvm.backend.monitoring.error.snapshot_unsupported", map[string]any{
		"provider": "JMX",
	})
}

func assertMonitoringLocalizedError(t *testing.T, err error, key string, params map[string]any) {
	t.Helper()

	if err == nil {
		t.Fatalf("expected localized error %q, got nil", key)
	}
	var localized *LocalizedError
	if !errors.As(err, &localized) {
		t.Fatalf("expected LocalizedError %q, got %T: %v", key, err, err)
	}
	if localized.Key != key {
		t.Fatalf("expected localized key %q, got %q", key, localized.Key)
	}
	for name, expected := range params {
		if localized.Params[name] != expected {
			t.Fatalf("expected param %s=%#v, got %#v in %#v", name, expected, localized.Params[name], localized.Params)
		}
	}
}

func TestMonitoringSessionIgnoresStaleStopFromPreviousSampler(t *testing.T) {
	session := &monitoringSession{}

	firstGeneration := session.reset("conn-race", ModeJMX)
	session.markRunning(firstGeneration)
	secondGeneration := session.reset("conn-race", ModeJMX)
	session.markRunning(secondGeneration)

	session.markStopped(firstGeneration)
	if snapshot := session.snapshot(); !snapshot.Running {
		t.Fatalf("expected stale sampler stop to be ignored, got %#v", snapshot)
	}

	session.markStopped(secondGeneration)
	if snapshot := session.snapshot(); snapshot.Running {
		t.Fatalf("expected active generation stop to mark stopped, got %#v", snapshot)
	}
}

func TestMonitoringSessionIgnoresStalePointFromPreviousSampler(t *testing.T) {
	manager := newMonitoringManager(5, time.Millisecond)
	session := &monitoringSession{limit: 5}
	provider := &blockingMonitoringProvider{
		fakeMonitoringProvider: fakeMonitoringProvider{
			snapshot: JVMMonitoringSnapshot{
				Point: JVMMonitoringPoint{
					Timestamp:   1713945600000,
					ThreadCount: 8,
				},
				AvailableMetrics: []string{"thread.count"},
			},
		},
		started: make(chan struct{}),
		release: make(chan struct{}),
	}

	firstGeneration := session.reset("conn-race", ModeJMX)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		manager.runSampler(ctx, provider, connection.ConnectionConfig{}, session, firstGeneration)
		close(done)
	}()

	select {
	case <-provider.started:
	case <-time.After(time.Second):
		t.Fatal("sampler did not start within 1s")
	}

	secondGeneration := session.reset("conn-race", ModeJMX)
	session.markRunning(secondGeneration)
	close(provider.release)
	cancel()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("sampler did not stop within 1s")
	}

	snapshot := session.snapshot()
	if !snapshot.Running {
		t.Fatalf("expected new generation to remain running, got %#v", snapshot)
	}
	if len(snapshot.Points) != 0 {
		t.Fatalf("expected stale sampler point to be ignored, got %#v", snapshot.Points)
	}
}

func TestFinalizeMonitoringSnapshotPreservesProviderDeltaWhenClassTotalMissing(t *testing.T) {
	snapshot := JVMMonitoringSnapshot{
		Point: JVMMonitoringPoint{
			Timestamp:      1713945602000,
			ClassLoadDelta: 3,
		},
		AvailableMetrics: []string{"class.delta"},
	}

	finalizeMonitoringSnapshot(&snapshot, &JVMMonitoringPoint{
		Timestamp:        1713945600000,
		LoadedClassCount: 200,
	})

	if snapshot.Point.ClassLoadDelta != 3 {
		t.Fatalf("expected provider class delta to be preserved, got %#v", snapshot.Point)
	}
}

func TestMonitoringSamplerStopsAfterConsecutiveFailures(t *testing.T) {
	manager := newMonitoringManager(5, time.Millisecond)
	session := &monitoringSession{limit: 5}
	generation := session.reset("conn-fail", ModeJMX)
	session.markRunning(generation)
	provider := fakeMonitoringProvider{snapshotErr: errors.New("collector unavailable")}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		manager.runSampler(ctx, provider, connection.ConnectionConfig{}, session, generation)
		close(done)
	}()

	deadline := time.After(time.Second)
	for {
		select {
		case <-done:
			snapshot := session.snapshot()
			if snapshot.Running {
				t.Fatalf("expected session to stop after consecutive failures, got %#v", snapshot)
			}
			if len(snapshot.ProviderWarnings) == 0 {
				t.Fatalf("expected provider warnings to explain sampling failure")
			}
			expectedFinalWarning := "__gonavi_i18n__:jvm.backend.monitoring.warning.sample_auto_stopped:count=3"
			if snapshot.ProviderWarnings[len(snapshot.ProviderWarnings)-1] != expectedFinalWarning {
				t.Fatalf("expected final warning to be structured, got %#v", snapshot.ProviderWarnings)
			}
			for _, warning := range snapshot.ProviderWarnings {
				if strings.Contains(warning, "监控采样连续失败") {
					t.Fatalf("expected no localized Chinese warning in manager snapshot, got %#v", snapshot.ProviderWarnings)
				}
			}
			return
		case <-deadline:
			t.Fatal("sampler did not stop after consecutive failures")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func TestMonitoringSessionDeduplicatesProviderWarnings(t *testing.T) {
	session := &monitoringSession{}

	session.appendWarning("collector unavailable")
	session.appendWarning("collector unavailable")
	session.appendWarning(" collector unavailable ")

	snapshot := session.snapshot()
	if len(snapshot.ProviderWarnings) != 1 {
		t.Fatalf("expected duplicate provider warnings to be collapsed, got %#v", snapshot.ProviderWarnings)
	}
}
