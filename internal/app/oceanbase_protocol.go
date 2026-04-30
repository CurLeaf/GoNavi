package app

import (
	"net/url"
	"strings"

	"GoNavi-Wails/internal/connection"
)

func normalizeOceanBaseProtocolForApp(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "oracle", "oracle-mode", "oracle_mode", "oboracle":
		return "oracle"
	case "mysql", "mysql-compatible", "mysql_compatible", "mysql-mode", "mysql_mode":
		return "mysql"
	default:
		return "mysql"
	}
}

func resolveOceanBaseProtocolForApp(config connection.ConnectionConfig) string {
	if !strings.EqualFold(strings.TrimSpace(config.Type), "oceanbase") {
		return ""
	}
	if explicit := strings.TrimSpace(config.OceanBaseProtocol); explicit != "" {
		return normalizeOceanBaseProtocolForApp(explicit)
	}
	if protocol := resolveOceanBaseProtocolParam(config.ConnectionParams); protocol != "" {
		return protocol
	}
	if protocol := resolveOceanBaseProtocolParam(config.URI); protocol != "" {
		return protocol
	}
	return "mysql"
}

func resolveOceanBaseProtocolParam(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	if queryIndex := strings.Index(text, "?"); queryIndex >= 0 {
		text = text[queryIndex+1:]
	}
	if hashIndex := strings.Index(text, "#"); hashIndex >= 0 {
		text = text[:hashIndex]
	}
	values, err := url.ParseQuery(strings.TrimLeft(strings.TrimSpace(text), "?&"))
	if err != nil {
		return ""
	}
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		if value := strings.TrimSpace(values.Get(key)); value != "" {
			return normalizeOceanBaseProtocolForApp(value)
		}
	}
	return ""
}

func normalizeOceanBaseConnectionParamsForCache(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	values, err := url.ParseQuery(strings.TrimLeft(text, "?&"))
	if err != nil {
		return text
	}
	if len(values) == 0 {
		return ""
	}
	protocol := resolveOceanBaseProtocolParam(raw)
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		values.Del(key)
	}
	if strings.EqualFold(protocol, "oracle") {
		values.Set("protocol", "oracle")
	}
	return values.Encode()
}

func normalizeOceanBaseConnectionParamsForCacheWithProtocol(raw string, protocol string) string {
	normalized := normalizeOceanBaseConnectionParamsForCache(raw)
	if !strings.EqualFold(protocol, "oracle") {
		return normalized
	}
	values, err := url.ParseQuery(strings.TrimLeft(strings.TrimSpace(normalized), "?&"))
	if err != nil {
		values = url.Values{}
	}
	values.Set("protocol", "oracle")
	return values.Encode()
}

func isOceanBaseOracleProtocol(config connection.ConnectionConfig) bool {
	return resolveOceanBaseProtocolForApp(config) == "oracle"
}
