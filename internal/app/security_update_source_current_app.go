package app

import (
	"encoding/json"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const (
	securityUpdateSourceCurrentAppFileName  = "source-current-app.json"
	securityUpdateNormalizedPreviewFileName = "normalized-preview.json"
)

type securityUpdateCurrentAppEnvelope struct {
	State       securityUpdateCurrentAppPayload    `json:"state"`
	Connections []connection.LegacySavedConnection `json:"connections"`
	GlobalProxy *connection.LegacyGlobalProxyInput `json:"globalProxy"`
}

type securityUpdateCurrentAppPayload struct {
	Connections []connection.LegacySavedConnection `json:"connections"`
	GlobalProxy *connection.LegacyGlobalProxyInput `json:"globalProxy"`
}

type securityUpdateCurrentAppSource struct {
	Connections []connection.LegacySavedConnection `json:"connections"`
	GlobalProxy *connection.LegacyGlobalProxyInput `json:"globalProxy,omitempty"`
}

func parseSecurityUpdateCurrentAppSource(rawPayload string) (securityUpdateCurrentAppSource, any, error) {
	trimmed := strings.TrimSpace(rawPayload)
	if trimmed == "" {
		return securityUpdateCurrentAppSource{Connections: []connection.LegacySavedConnection{}}, map[string]any{}, nil
	}

	var raw any
	if err := json.Unmarshal([]byte(trimmed), &raw); err != nil {
		return securityUpdateCurrentAppSource{}, nil, err
	}

	var envelope securityUpdateCurrentAppEnvelope
	if err := json.Unmarshal([]byte(trimmed), &envelope); err != nil {
		return securityUpdateCurrentAppSource{}, nil, err
	}

	connections := envelope.Connections
	globalProxy := envelope.GlobalProxy
	if len(envelope.State.Connections) > 0 || envelope.State.GlobalProxy != nil {
		connections = envelope.State.Connections
		globalProxy = envelope.State.GlobalProxy
	}

	normalizedConnections := make([]connection.LegacySavedConnection, 0, len(connections))
	for _, item := range connections {
		if strings.TrimSpace(item.ID) == "" && strings.TrimSpace(item.Config.ID) == "" {
			continue
		}
		if strings.TrimSpace(item.ID) == "" {
			item.ID = strings.TrimSpace(item.Config.ID)
		}
		item.Config.ID = item.ID
		normalizedConnections = append(normalizedConnections, item)
	}

	if globalProxy != nil {
		normalizedType := strings.ToLower(strings.TrimSpace(globalProxy.Type))
		if normalizedType != "http" {
			normalizedType = "socks5"
		}
		globalProxy.Type = normalizedType
		if globalProxy.Port <= 0 || globalProxy.Port > 65535 {
			if normalizedType == "http" {
				globalProxy.Port = 8080
			} else {
				globalProxy.Port = 1080
			}
		}
	}

	return securityUpdateCurrentAppSource{
		Connections: normalizedConnections,
		GlobalProxy: globalProxy,
	}, raw, nil
}
