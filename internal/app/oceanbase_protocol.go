package app

import (
	"net/url"
	"strings"

	"GoNavi-Wails/internal/connection"
)

func normalizeOceanBaseProtocolForApp(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "oracle", "oracle-mode", "oracle_mode", "oboracle":
		return "oracle"
	case "mysql", "mysql-compatible", "mysql_compatible", "mysql-mode", "mysql_mode", "obmysql":
		return "mysql"
	default:
		return normalized
	}
}

func isSupportedOceanBaseProtocolForApp(protocol string) bool {
	return protocol == "mysql" || protocol == "oracle"
}

func resolveOceanBaseProtocolForApp(config connection.ConnectionConfig) string {
	if !strings.EqualFold(strings.TrimSpace(config.Type), "oceanbase") {
		return ""
	}
	explicitProtocol := ""
	if explicit := strings.TrimSpace(config.OceanBaseProtocol); explicit != "" {
		explicitProtocol = normalizeOceanBaseProtocolForApp(explicit)
		if !isSupportedOceanBaseProtocolForApp(explicitProtocol) {
			return explicitProtocol
		}
	}
	if protocol := resolveOceanBaseProtocolParam(config.ConnectionParams); protocol != "" {
		if !isSupportedOceanBaseProtocolForApp(protocol) {
			return protocol
		}
		if explicitProtocol != "" {
			return explicitProtocol
		}
		return protocol
	}
	if protocol := resolveOceanBaseProtocolParam(config.URI); protocol != "" {
		if !isSupportedOceanBaseProtocolForApp(protocol) {
			return protocol
		}
		if explicitProtocol != "" {
			return explicitProtocol
		}
		return protocol
	}
	if explicitProtocol != "" {
		return explicitProtocol
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

func stripOceanBaseConnectionParamsForCache(raw string) string {
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
	values, err := url.ParseQuery(strings.TrimLeft(text, "?&"))
	if err != nil {
		return text
	}
	if len(values) == 0 {
		return ""
	}
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		values.Del(key)
	}
	return values.Encode()
}

func normalizeOceanBaseConnectionParamsForCache(raw string) string {
	normalized := stripOceanBaseConnectionParamsForCache(raw)
	protocol := resolveOceanBaseProtocolParam(raw)
	if protocol != "" && !strings.EqualFold(protocol, "mysql") {
		values, err := url.ParseQuery(strings.TrimLeft(strings.TrimSpace(normalized), "?&"))
		if err != nil {
			values = url.Values{}
		}
		values.Set("protocol", protocol)
		return values.Encode()
	}
	return normalized
}

func normalizeOceanBaseConnectionParamsForCacheWithProtocol(raw string, protocol string) string {
	resolvedProtocol := normalizeOceanBaseProtocolForApp(protocol)
	if resolvedProtocol == "" {
		return normalizeOceanBaseConnectionParamsForCache(raw)
	}
	normalized := stripOceanBaseConnectionParamsForCache(raw)
	if strings.EqualFold(resolvedProtocol, "mysql") {
		return normalized
	}
	values, err := url.ParseQuery(strings.TrimLeft(strings.TrimSpace(normalized), "?&"))
	if err != nil {
		values = url.Values{}
	}
	values.Set("protocol", resolvedProtocol)
	return values.Encode()
}

func isOceanBaseOracleProtocol(config connection.ConnectionConfig) bool {
	return resolveOceanBaseProtocolForApp(config) == "oracle"
}
