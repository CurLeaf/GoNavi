package redis

import (
	"crypto/tls"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/tlsconfig"
)

func normalizeRedisSSLMode(raw string) string {
	mode := strings.ToLower(strings.TrimSpace(raw))
	switch mode {
	case "", "preferred", "prefer":
		return "preferred"
	case "required", "require", "on", "true", "mandatory", "strict":
		return "required"
	case "skip-verify", "insecure", "skipverify", "skip_verify", "insecure-skip-verify":
		return "skip-verify"
	case "disable", "disabled", "off", "false", "none":
		return "disable"
	default:
		return "preferred"
	}
}

func redisSSLMode(config connection.ConnectionConfig) string {
	if !config.UseSSL {
		return "disable"
	}
	return normalizeRedisSSLMode(config.SSLMode)
}

func shouldTryRedisSSLPreferredFallback(config connection.ConnectionConfig) bool {
	return config.UseSSL && normalizeRedisSSLMode(config.SSLMode) == "preferred"
}

func withRedisSSLDisabled(config connection.ConnectionConfig) connection.ConnectionConfig {
	next := config
	next.UseSSL = false
	next.SSLMode = "disable"
	return next
}

func resolveRedisTLSConfig(config connection.ConnectionConfig) (*tls.Config, error) {
	switch redisSSLMode(config) {
	case "disable":
		return nil, nil
	case "required":
		return tlsconfig.BuildClientConfig(tlsconfig.ClientConfigOptions{
			Enabled:  true,
			CAPath:   config.SSLCAPath,
			CertPath: config.SSLCertPath,
			KeyPath:  config.SSLKeyPath,
		})
	case "skip-verify":
		return tlsconfig.BuildClientConfig(tlsconfig.ClientConfigOptions{
			Enabled:            true,
			InsecureSkipVerify: true,
			CAPath:             config.SSLCAPath,
			CertPath:           config.SSLCertPath,
			KeyPath:            config.SSLKeyPath,
		})
	default:
		return tlsconfig.BuildClientConfig(tlsconfig.ClientConfigOptions{
			Enabled:            true,
			InsecureSkipVerify: true,
			CAPath:             config.SSLCAPath,
			CertPath:           config.SSLCertPath,
			KeyPath:            config.SSLKeyPath,
		})
	}
}
