package app

import (
	"context"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
)

const (
	defaultConnectionKeepAliveIntervalMinutes = 240
	minConnectionKeepAliveIntervalMinutes     = 1
	maxConnectionKeepAliveIntervalMinutes     = 1440
	connectionKeepAliveScanInterval           = 30 * time.Second
)

type cachedDatabaseKeepAliveTarget struct {
	key    string
	inst   db.Database
	config connection.ConnectionConfig
}

func resolveConnectionKeepAliveSettings(config connection.ConnectionConfig) (bool, time.Duration) {
	if !config.KeepAliveEnabled || isFileDatabaseType(config.Type) {
		return false, 0
	}

	minutes := config.KeepAliveIntervalMinutes
	switch {
	case minutes <= 0:
		minutes = defaultConnectionKeepAliveIntervalMinutes
	case minutes < minConnectionKeepAliveIntervalMinutes:
		minutes = minConnectionKeepAliveIntervalMinutes
	case minutes > maxConnectionKeepAliveIntervalMinutes:
		minutes = maxConnectionKeepAliveIntervalMinutes
	}

	return true, time.Duration(minutes) * time.Minute
}

func (a *App) startConnectionKeepAliveLoop() {
	if a == nil || a.keepAliveCancel != nil {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	a.keepAliveCancel = cancel
	a.keepAliveDone = done

	go func() {
		defer close(done)

		ticker := time.NewTicker(connectionKeepAliveScanInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				a.runConnectionKeepAliveTick(now)
			}
		}
	}()
}

func (a *App) stopConnectionKeepAliveLoop() {
	if a == nil {
		return
	}

	cancel := a.keepAliveCancel
	done := a.keepAliveDone
	a.keepAliveCancel = nil
	a.keepAliveDone = nil

	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
}

func (a *App) runConnectionKeepAliveTick(now time.Time) {
	for _, target := range a.collectDueConnectionKeepAliveTargets(now) {
		if target.inst == nil {
			continue
		}
		if err := target.inst.Ping(); err != nil {
			if closed, summary := a.evictCachedDatabaseAfterKeepAliveFailure(target); closed {
				logger.Warnf(
					"连接保活失败，已清理缓存连接：%s 缓存Key=%s 原因=%s",
					summary,
					shortCacheKey(target.key),
					normalizeErrorMessage(err),
				)
			}
			continue
		}
		a.markCachedDatabaseKeepAliveSuccess(target.key, target.inst, time.Now())
	}
}

func (a *App) collectDueConnectionKeepAliveTargets(now time.Time) []cachedDatabaseKeepAliveTarget {
	if a == nil {
		return nil
	}

	targets := make([]cachedDatabaseKeepAliveTarget, 0)
	a.mu.Lock()
	defer a.mu.Unlock()

	for key, entry := range a.dbCache {
		if entry.inst == nil || !entry.keepAliveEnabled || entry.keepAliveInterval <= 0 || entry.keepAliveInFlight {
			continue
		}
		if !entry.lastPing.IsZero() && now.Sub(entry.lastPing) < entry.keepAliveInterval {
			continue
		}

		entry.keepAliveInFlight = true
		a.dbCache[key] = entry
		targets = append(targets, cachedDatabaseKeepAliveTarget{
			key:    key,
			inst:   entry.inst,
			config: entry.config,
		})
	}

	return targets
}

func (a *App) markCachedDatabaseKeepAliveSuccess(key string, inst db.Database, pingedAt time.Time) {
	if a == nil {
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	entry, exists := a.dbCache[key]
	if !exists || entry.inst != inst {
		return
	}

	entry.keepAliveInFlight = false
	entry.lastPing = pingedAt
	a.dbCache[key] = entry
}

func (a *App) evictCachedDatabaseAfterKeepAliveFailure(target cachedDatabaseKeepAliveTarget) (bool, string) {
	if a == nil {
		return false, ""
	}

	var (
		inst    db.Database
		summary string
	)

	a.mu.Lock()
	entry, exists := a.dbCache[target.key]
	if exists && entry.inst == target.inst {
		inst = entry.inst
		summary = formatConnSummary(entry.config)
		delete(a.dbCache, target.key)
	}
	a.mu.Unlock()

	if inst == nil {
		return false, ""
	}
	if closeErr := inst.Close(); closeErr != nil {
		logger.Error(closeErr, "关闭保活失败的缓存连接时出错：缓存Key=%s", shortCacheKey(target.key))
	}
	return true, summary
}
