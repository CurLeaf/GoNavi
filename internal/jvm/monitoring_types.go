package jvm

import (
	"context"

	"GoNavi-Wails/internal/connection"
)

type JVMMonitoringPoint struct {
	Timestamp                   int64          `json:"timestamp"`
	HeapUsedBytes               int64          `json:"heapUsedBytes,omitempty"`
	HeapCommittedBytes          int64          `json:"heapCommittedBytes,omitempty"`
	HeapMaxBytes                int64          `json:"heapMaxBytes,omitempty"`
	NonHeapUsedBytes            int64          `json:"nonHeapUsedBytes,omitempty"`
	NonHeapCommittedBytes       int64          `json:"nonHeapCommittedBytes,omitempty"`
	GCCollectionCount           int64          `json:"gcCollectionCount,omitempty"`
	GCCollectionTimeMs          int64          `json:"gcCollectionTimeMs,omitempty"`
	GCDeltaCount                int64          `json:"gcDeltaCount,omitempty"`
	GCDeltaTimeMs               int64          `json:"gcDeltaTimeMs,omitempty"`
	ThreadCount                 int            `json:"threadCount,omitempty"`
	DaemonThreadCount           int            `json:"daemonThreadCount,omitempty"`
	PeakThreadCount             int            `json:"peakThreadCount,omitempty"`
	ThreadStateCounts           map[string]int `json:"threadStateCounts,omitempty"`
	LoadedClassCount            int            `json:"loadedClassCount,omitempty"`
	UnloadedClassCount          int64          `json:"unloadedClassCount,omitempty"`
	ClassLoadDelta              int64          `json:"classLoadDelta,omitempty"`
	ProcessCpuLoad              float64        `json:"processCpuLoad,omitempty"`
	SystemCpuLoad               float64        `json:"systemCpuLoad,omitempty"`
	ProcessRssBytes             int64          `json:"processRssBytes,omitempty"`
	CommittedVirtualMemoryBytes int64          `json:"committedVirtualMemoryBytes,omitempty"`
}

type RecentGCEvent struct {
	Timestamp       int64  `json:"timestamp"`
	Name            string `json:"name,omitempty"`
	Cause           string `json:"cause,omitempty"`
	Action          string `json:"action,omitempty"`
	DurationMs      int64  `json:"durationMs,omitempty"`
	BeforeUsedBytes int64  `json:"beforeUsedBytes,omitempty"`
	AfterUsedBytes  int64  `json:"afterUsedBytes,omitempty"`
}

type MonitoringSessionSnapshot struct {
	ConnectionID     string               `json:"connectionId"`
	ProviderMode     string               `json:"providerMode"`
	Running          bool                 `json:"running"`
	Points           []JVMMonitoringPoint `json:"points,omitempty"`
	RecentGCEvents   []RecentGCEvent      `json:"recentGcEvents,omitempty"`
	AvailableMetrics []string             `json:"availableMetrics,omitempty"`
	MissingMetrics   []string             `json:"missingMetrics,omitempty"`
	ProviderWarnings []string             `json:"providerWarnings,omitempty"`
}

type JVMMonitoringSnapshot struct {
	Point            JVMMonitoringPoint `json:"point"`
	RecentGCEvents   []RecentGCEvent    `json:"recentGcEvents,omitempty"`
	AvailableMetrics []string           `json:"availableMetrics,omitempty"`
	MissingMetrics   []string           `json:"missingMetrics,omitempty"`
	ProviderWarnings []string           `json:"providerWarnings,omitempty"`
}

type MonitoringCapableProvider interface {
	Provider
	GetMonitoringSnapshot(ctx context.Context, cfg connection.ConnectionConfig, previous *JVMMonitoringPoint) (JVMMonitoringSnapshot, error)
}

func finalizeMonitoringSnapshot(snapshot *JVMMonitoringSnapshot, previous *JVMMonitoringPoint) {
	if snapshot == nil || previous == nil {
		return
	}

	if hasMonitoringMetric(snapshot.AvailableMetrics, "gc.count") && snapshot.Point.GCCollectionCount >= previous.GCCollectionCount {
		snapshot.Point.GCDeltaCount = snapshot.Point.GCCollectionCount - previous.GCCollectionCount
	}
	if hasMonitoringMetric(snapshot.AvailableMetrics, "gc.time") && snapshot.Point.GCCollectionTimeMs >= previous.GCCollectionTimeMs {
		snapshot.Point.GCDeltaTimeMs = snapshot.Point.GCCollectionTimeMs - previous.GCCollectionTimeMs
	}
	if hasMonitoringMetric(snapshot.AvailableMetrics, "class.loading") {
		snapshot.Point.ClassLoadDelta = int64(snapshot.Point.LoadedClassCount) - int64(previous.LoadedClassCount)
	}
}

func hasMonitoringMetric(metrics []string, expected string) bool {
	for _, metric := range metrics {
		if metric == expected {
			return true
		}
	}
	return false
}
