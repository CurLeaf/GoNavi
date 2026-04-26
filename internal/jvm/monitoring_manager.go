package jvm

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/connection"
)

const (
	defaultMonitoringPointLimit = 180
	defaultMonitoringEventLimit = 20
	defaultMonitoringInterval   = 2 * time.Second
	maxMonitoringSampleFailures = 3
)

var monitoringProviderFactory = NewProvider

type monitoringManager struct {
	mu       sync.Mutex
	limit    int
	interval time.Duration
	sessions map[string]*monitoringSession
}

type monitoringSession struct {
	mu               sync.Mutex
	connectionID     string
	providerMode     string
	limit            int
	running          bool
	points           []JVMMonitoringPoint
	recentGCEvents   []RecentGCEvent
	availableMetrics []string
	missingMetrics   []string
	providerWarnings []string
	cancel           context.CancelFunc
	generation       int64
}

func newMonitoringManagerForTest(limit int) *monitoringManager {
	return newMonitoringManager(limit, 0)
}

func NewMonitoringManager() *monitoringManager {
	return newMonitoringManager(defaultMonitoringPointLimit, defaultMonitoringInterval)
}

func newMonitoringManager(limit int, interval time.Duration) *monitoringManager {
	if limit <= 0 {
		limit = defaultMonitoringPointLimit
	}
	return &monitoringManager{
		limit:    limit,
		interval: interval,
		sessions: make(map[string]*monitoringSession),
	}
}

func (m *monitoringManager) ensureSession(connectionID string, providerMode string) *monitoringSession {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := connectionID + ":" + providerMode
	if session, ok := m.sessions[key]; ok {
		return session
	}

	session := &monitoringSession{
		connectionID: connectionID,
		providerMode: providerMode,
		limit:        m.limit,
	}
	m.sessions[key] = session
	return session
}

func (m *monitoringManager) Start(ctx context.Context, raw connection.ConnectionConfig, requestedMode string) (MonitoringSessionSnapshot, error) {
	cfg, providerMode, err := ResolveProviderMode(raw, requestedMode)
	if err != nil {
		return MonitoringSessionSnapshot{}, err
	}

	connectionID := resolveMonitoringConnectionID(cfg)
	session := m.ensureSession(connectionID, providerMode)

	provider, err := monitoringProviderFactory(providerMode)
	if err != nil {
		return MonitoringSessionSnapshot{}, err
	}

	monitoringProvider, ok := provider.(MonitoringCapableProvider)
	if !ok {
		return MonitoringSessionSnapshot{}, fmt.Errorf("%s provider does not implement monitoring snapshot yet", ModeDisplayLabel(providerMode))
	}

	generation := session.reset(connectionID, providerMode)
	if err := m.sampleOnce(ctx, monitoringProvider, cfg, session, generation); err != nil {
		session.markStopped(generation)
		return MonitoringSessionSnapshot{}, err
	}

	session.markRunning(generation)
	if m.interval > 0 {
		loopCtx, cancel := context.WithCancel(context.Background())
		session.setCancel(cancel)
		go m.runSampler(loopCtx, monitoringProvider, cfg, session, generation)
	}

	return session.snapshot(), nil
}

func (m *monitoringManager) Stop(connectionID string, providerMode string) error {
	m.mu.Lock()
	session, ok := m.sessions[m.sessionKey(connectionID, providerMode)]
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("monitoring session not found for %s %s", connectionID, providerMode)
	}

	session.stop()
	return nil
}

func (m *monitoringManager) GetHistory(connectionID string, providerMode string) (MonitoringSessionSnapshot, error) {
	m.mu.Lock()
	session, ok := m.sessions[m.sessionKey(connectionID, providerMode)]
	m.mu.Unlock()
	if !ok {
		return MonitoringSessionSnapshot{}, fmt.Errorf("monitoring session not found for %s %s", connectionID, providerMode)
	}
	return session.snapshot(), nil
}

func (s *monitoringSession) appendPoint(point JVMMonitoringPoint) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.points = append(s.points, point)
	if len(s.points) > s.limit {
		s.points = append([]JVMMonitoringPoint(nil), s.points[len(s.points)-s.limit:]...)
	}
}

func (m *monitoringManager) sessionKey(connectionID string, providerMode string) string {
	return strings.TrimSpace(connectionID) + ":" + strings.TrimSpace(providerMode)
}

func (m *monitoringManager) runSampler(ctx context.Context, provider MonitoringCapableProvider, cfg connection.ConnectionConfig, session *monitoringSession, generation int64) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	consecutiveFailures := 0

	for {
		select {
		case <-ctx.Done():
			session.markStopped(generation)
			return
		case <-ticker.C:
			if err := m.sampleOnce(ctx, provider, cfg, session, generation); err != nil {
				consecutiveFailures++
				session.appendWarning(err.Error())
				if consecutiveFailures >= maxMonitoringSampleFailures {
					session.appendWarning(fmt.Sprintf("监控采样连续失败 %d 次，已自动停止本次监控会话", consecutiveFailures))
					session.markStopped(generation)
					return
				}
				continue
			}
			consecutiveFailures = 0
		}
	}
}

func (m *monitoringManager) sampleOnce(ctx context.Context, provider MonitoringCapableProvider, cfg connection.ConnectionConfig, session *monitoringSession, generation int64) error {
	previous, ok := session.previousPoint(generation)
	if !ok {
		return nil
	}
	snapshot, err := provider.GetMonitoringSnapshot(ctx, cfg, previous)
	if err != nil {
		return err
	}
	session.applySnapshot(snapshot, generation)
	return nil
}

func (s *monitoringSession) snapshot() MonitoringSessionSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()

	return MonitoringSessionSnapshot{
		ConnectionID:     s.connectionID,
		ProviderMode:     s.providerMode,
		Running:          s.running,
		Points:           append([]JVMMonitoringPoint(nil), s.points...),
		RecentGCEvents:   append([]RecentGCEvent(nil), s.recentGCEvents...),
		AvailableMetrics: append([]string(nil), s.availableMetrics...),
		MissingMetrics:   append([]string(nil), s.missingMetrics...),
		ProviderWarnings: append([]string(nil), s.providerWarnings...),
	}
}

func (s *monitoringSession) previousPoint(generation int64) (*JVMMonitoringPoint, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if generation != s.generation {
		return nil, false
	}
	if len(s.points) == 0 {
		return nil, true
	}
	point := s.points[len(s.points)-1]
	if point.ThreadStateCounts != nil {
		point.ThreadStateCounts = cloneStringIntMap(point.ThreadStateCounts)
	}
	return &point, true
}

func (s *monitoringSession) applySnapshot(snapshot JVMMonitoringSnapshot, generation int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if generation != s.generation {
		return false
	}
	s.points = append(s.points, cloneMonitoringPoint(snapshot.Point))
	if len(s.points) > s.limit {
		s.points = append([]JVMMonitoringPoint(nil), s.points[len(s.points)-s.limit:]...)
	}
	s.recentGCEvents = append([]RecentGCEvent(nil), snapshot.RecentGCEvents...)
	if len(s.recentGCEvents) > defaultMonitoringEventLimit {
		s.recentGCEvents = append([]RecentGCEvent(nil), s.recentGCEvents[len(s.recentGCEvents)-defaultMonitoringEventLimit:]...)
	}
	s.availableMetrics = append([]string(nil), snapshot.AvailableMetrics...)
	s.missingMetrics = append([]string(nil), snapshot.MissingMetrics...)
	s.providerWarnings = append([]string(nil), snapshot.ProviderWarnings...)
	return true
}

func (s *monitoringSession) appendWarning(warning string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	trimmed := strings.TrimSpace(warning)
	if trimmed == "" {
		return
	}
	for _, existing := range s.providerWarnings {
		if existing == trimmed {
			return
		}
	}
	s.providerWarnings = append(s.providerWarnings, trimmed)
	if len(s.providerWarnings) > defaultMonitoringEventLimit {
		s.providerWarnings = append([]string(nil), s.providerWarnings[len(s.providerWarnings)-defaultMonitoringEventLimit:]...)
	}
}

func (s *monitoringSession) reset(connectionID string, providerMode string) int64 {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.generation++
	s.connectionID = connectionID
	s.providerMode = providerMode
	s.running = false
	s.points = nil
	s.recentGCEvents = nil
	s.availableMetrics = nil
	s.missingMetrics = nil
	s.providerWarnings = nil
	return s.generation
}

func (s *monitoringSession) setCancel(cancel context.CancelFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancel = cancel
}

func (s *monitoringSession) markRunning(generation int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if generation != s.generation {
		return
	}
	s.running = true
}

func (s *monitoringSession) markStopped(generation int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if generation != s.generation {
		return
	}
	s.running = false
	s.cancel = nil
}

func (s *monitoringSession) stop() {
	s.mu.Lock()
	cancel := s.cancel
	s.cancel = nil
	s.generation++
	s.running = false
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
}

func resolveMonitoringConnectionID(cfg connection.ConnectionConfig) string {
	if trimmed := strings.TrimSpace(cfg.ID); trimmed != "" {
		return trimmed
	}
	host := strings.TrimSpace(cfg.Host)
	if host == "" {
		host = "unknown"
	}
	if cfg.Port > 0 {
		return fmt.Sprintf("%s:%d", host, cfg.Port)
	}
	return host
}

func cloneMonitoringPoint(point JVMMonitoringPoint) JVMMonitoringPoint {
	cloned := point
	cloned.ThreadStateCounts = cloneStringIntMap(point.ThreadStateCounts)
	return cloned
}

func cloneStringIntMap(input map[string]int) map[string]int {
	if len(input) == 0 {
		return nil
	}
	cloned := make(map[string]int, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}
