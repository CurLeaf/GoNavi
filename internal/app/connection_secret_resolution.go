package app

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

func (a *App) resolveConnectionSecrets(config connection.ConnectionConfig) (connection.ConnectionConfig, error) {
	if strings.TrimSpace(config.ID) == "" {
		return config, nil
	}

	repo := newSavedConnectionRepository(a.configDir, a.secretStore)
	view, err := repo.Find(config.ID)
	if err != nil {
		if shouldFallbackToInlineConnectionSecrets(config, err) {
			return config, nil
		}
		return config, normalizeConnectionSecretResolutionError(config, err)
	}

	base := config
	if connectionMetadataLooksEmpty(base) {
		base = view.Config
	}
	bundle, err := repo.loadSecretBundle(view)
	if err != nil {
		if shouldFallbackToInlineConnectionSecrets(config, err) {
			return mergeInlineConnectionSecrets(base, config), nil
		}
		return base, normalizeConnectionSecretResolutionError(base, err)
	}
	resolved := mergeConnectionSecretBundleIntoConfig(base, bundle)
	resolved.ID = view.ID

	return resolved, nil
}

func shouldFallbackToInlineConnectionSecrets(config connection.ConnectionConfig, err error) bool {
	if err == nil || !connectionConfigCarriesInlineSecrets(config) || secretstore.IsUnavailable(err) {
		return false
	}
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	lower := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(lower, "saved connection not found:")
}

func connectionConfigCarriesInlineSecrets(config connection.ConnectionConfig) bool {
	return strings.TrimSpace(config.Password) != "" ||
		strings.TrimSpace(config.SSH.Password) != "" ||
		strings.TrimSpace(config.Proxy.Password) != "" ||
		strings.TrimSpace(config.HTTPTunnel.Password) != "" ||
		strings.TrimSpace(config.MySQLReplicaPassword) != "" ||
		strings.TrimSpace(config.MongoReplicaPassword) != "" ||
		strings.TrimSpace(config.URI) != "" ||
		strings.TrimSpace(config.DSN) != ""
}

func mergeInlineConnectionSecrets(base connection.ConnectionConfig, inline connection.ConnectionConfig) connection.ConnectionConfig {
	merged := base
	if strings.TrimSpace(inline.Password) != "" {
		merged.Password = inline.Password
	}
	if strings.TrimSpace(inline.SSH.Password) != "" {
		merged.SSH.Password = inline.SSH.Password
	}
	if strings.TrimSpace(inline.Proxy.Password) != "" {
		merged.Proxy.Password = inline.Proxy.Password
	}
	if strings.TrimSpace(inline.HTTPTunnel.Password) != "" {
		merged.HTTPTunnel.Password = inline.HTTPTunnel.Password
	}
	if strings.TrimSpace(inline.MySQLReplicaPassword) != "" {
		merged.MySQLReplicaPassword = inline.MySQLReplicaPassword
	}
	if strings.TrimSpace(inline.MongoReplicaPassword) != "" {
		merged.MongoReplicaPassword = inline.MongoReplicaPassword
	}
	if strings.TrimSpace(inline.URI) != "" {
		merged.URI = inline.URI
	}
	if strings.TrimSpace(inline.DSN) != "" {
		merged.DSN = inline.DSN
	}
	return merged
}

func normalizeConnectionSecretResolutionError(config connection.ConnectionConfig, err error) error {
	if err == nil {
		return nil
	}

	lower := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case strings.Contains(lower, "saved connection not found:"):
		if connectionMetadataLooksEmpty(config) {
			return fmt.Errorf("未找到已保存连接，可能已被删除，请刷新后重试")
		}
		return fmt.Errorf("未找到当前连接对应的已保存密文，请重新填写密码并保存后再试")
	case errors.Is(err, os.ErrNotExist):
		return fmt.Errorf("未找到当前连接对应的已保存密文，请重新填写密码并保存后再试")
	case strings.Contains(lower, "secret store unavailable"):
		return fmt.Errorf("系统密文存储当前不可用，请检查系统钥匙串或凭据管理器后再试")
	default:
		return err
	}
}

func connectionMetadataLooksEmpty(config connection.ConnectionConfig) bool {
	return strings.TrimSpace(config.Type) == "" &&
		strings.TrimSpace(config.Host) == "" &&
		config.Port == 0 &&
		strings.TrimSpace(config.User) == "" &&
		strings.TrimSpace(config.Database) == "" &&
		strings.TrimSpace(config.DSN) == "" &&
		strings.TrimSpace(config.URI) == "" &&
		len(config.Hosts) == 0
}

func mergeConnectionSecretBundleIntoConfig(config connection.ConnectionConfig, bundle connectionSecretBundle) connection.ConnectionConfig {
	merged := config
	if strings.TrimSpace(merged.Password) == "" {
		merged.Password = bundle.Password
	}
	if strings.TrimSpace(merged.SSH.Password) == "" {
		merged.SSH.Password = bundle.SSHPassword
	}
	if strings.TrimSpace(merged.Proxy.Password) == "" {
		merged.Proxy.Password = bundle.ProxyPassword
	}
	if strings.TrimSpace(merged.HTTPTunnel.Password) == "" {
		merged.HTTPTunnel.Password = bundle.HTTPTunnelPassword
	}
	if strings.TrimSpace(merged.MySQLReplicaPassword) == "" {
		merged.MySQLReplicaPassword = bundle.MySQLReplicaPassword
	}
	if strings.TrimSpace(merged.MongoReplicaPassword) == "" {
		merged.MongoReplicaPassword = bundle.MongoReplicaPassword
	}
	if strings.TrimSpace(merged.URI) == "" {
		merged.URI = bundle.OpaqueURI
	}
	if strings.TrimSpace(merged.DSN) == "" {
		merged.DSN = bundle.OpaqueDSN
	}
	return merged
}
