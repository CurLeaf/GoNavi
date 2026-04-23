package app

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
)

var newJVMProvider = jvm.NewProvider

func resolveJVMProvider(cfg connection.ConnectionConfig) (connection.ConnectionConfig, jvm.Provider, error) {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.ConnectionConfig{}, nil, err
	}

	provider, err := newJVMProvider(normalized.JVM.PreferredMode)
	if err != nil {
		return connection.ConnectionConfig{}, nil, err
	}

	return normalized, provider, nil
}

func (a *App) TestJVMConnection(cfg connection.ConnectionConfig) connection.QueryResult {
	normalized, provider, err := resolveJVMProvider(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	if err := provider.TestConnection(a.ctx, normalized); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Message: "JVM 连接成功"}
}

func (a *App) JVMListResources(cfg connection.ConnectionConfig, parentPath string) connection.QueryResult {
	normalized, provider, err := resolveJVMProvider(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	items, err := provider.ListResources(a.ctx, normalized, parentPath)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: items}
}

func (a *App) JVMGetValue(cfg connection.ConnectionConfig, resourcePath string) connection.QueryResult {
	normalized, provider, err := resolveJVMProvider(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	value, err := provider.GetValue(a.ctx, normalized, resourcePath)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: value}
}

func (a *App) JVMProbeCapabilities(cfg connection.ConnectionConfig) connection.QueryResult {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	items := make([]jvm.Capability, 0, len(normalized.JVM.AllowedModes))
	for _, mode := range normalized.JVM.AllowedModes {
		provider, providerErr := newJVMProvider(mode)
		if providerErr != nil {
			items = append(items, jvm.Capability{
				Mode:         mode,
				DisplayLabel: jvm.ModeDisplayLabel(mode),
				Reason:       providerErr.Error(),
			})
			continue
		}

		caps, probeErr := provider.ProbeCapabilities(a.ctx, normalized)
		if probeErr != nil {
			items = append(items, jvm.Capability{
				Mode:         mode,
				DisplayLabel: jvm.ModeDisplayLabel(mode),
				Reason:       probeErr.Error(),
			})
			continue
		}

		items = append(items, caps...)
	}

	return connection.QueryResult{Success: true, Data: items}
}
