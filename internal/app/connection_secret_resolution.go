package app

import (
	"strings"

	"GoNavi-Wails/internal/connection"
)

func (a *App) resolveConnectionSecrets(config connection.ConnectionConfig) (connection.ConnectionConfig, error) {
	if strings.TrimSpace(config.ID) == "" {
		return config, nil
	}

	repo := newSavedConnectionRepository(a.configDir, a.secretStore)
	view, err := repo.Find(config.ID)
	if err != nil {
		return config, err
	}

	base := config
	if connectionMetadataLooksEmpty(base) {
		base = view.Config
	}
	bundle, err := repo.loadSecretBundle(view)
	if err != nil {
		return base, err
	}
	resolved := mergeConnectionSecretBundleIntoConfig(base, bundle)
	resolved.ID = view.ID
	return resolved, nil
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
