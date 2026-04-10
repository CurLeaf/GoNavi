package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

func newConnectionPackageItem(view connection.SavedConnectionView, bundle connectionSecretBundle) connectionPackageItem {
	return connectionPackageItem{
		ID:                    view.ID,
		Name:                  view.Name,
		IncludeDatabases:      cloneStringSlice(view.IncludeDatabases),
		IncludeRedisDatabases: cloneIntSlice(view.IncludeRedisDatabases),
		IconType:              view.IconType,
		IconColor:             view.IconColor,
		Config:                view.Config,
		Secrets:               bundle,
	}
}

func (a *App) buildConnectionPackagePayload() (connectionPackagePayload, error) {
	repo := a.savedConnectionRepository()
	items, err := repo.List()
	if err != nil {
		return connectionPackagePayload{}, err
	}

	connections := make([]connectionPackageItem, 0, len(items))
	for _, item := range items {
		bundle, bundleErr := repo.loadSecretBundle(item)
		if bundleErr != nil {
			return connectionPackagePayload{}, bundleErr
		}
		connections = append(connections, newConnectionPackageItem(item, bundle))
	}

	return connectionPackagePayload{
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
		Connections: connections,
	}, nil
}

func newSavedConnectionInputFromPackageItem(item connectionPackageItem) connection.SavedConnectionInput {
	id := strings.TrimSpace(item.ID)
	if id == "" {
		id = strings.TrimSpace(item.Config.ID)
	}

	config := item.Config
	config.ID = id
	config.SavePassword = false

	secrets := item.Secrets
	config.Password = secrets.Password
	config.SSH.Password = secrets.SSHPassword
	config.Proxy.Password = secrets.ProxyPassword
	config.HTTPTunnel.Password = secrets.HTTPTunnelPassword
	config.MySQLReplicaPassword = secrets.MySQLReplicaPassword
	config.MongoReplicaPassword = secrets.MongoReplicaPassword
	config.URI = secrets.OpaqueURI
	config.DSN = secrets.OpaqueDSN

	return connection.SavedConnectionInput{
		ID:                    id,
		Name:                  item.Name,
		Config:                config,
		IncludeDatabases:      cloneStringSlice(item.IncludeDatabases),
		IncludeRedisDatabases: cloneIntSlice(item.IncludeRedisDatabases),
		IconType:              item.IconType,
		IconColor:             item.IconColor,
		// 连接恢复包以最新导入文件为准；载荷中缺失的密文字段需要显式清空旧值。
		ClearPrimaryPassword:      strings.TrimSpace(secrets.Password) == "",
		ClearSSHPassword:          strings.TrimSpace(secrets.SSHPassword) == "",
		ClearProxyPassword:        strings.TrimSpace(secrets.ProxyPassword) == "",
		ClearHTTPTunnelPassword:   strings.TrimSpace(secrets.HTTPTunnelPassword) == "",
		ClearMySQLReplicaPassword: strings.TrimSpace(secrets.MySQLReplicaPassword) == "",
		ClearMongoReplicaPassword: strings.TrimSpace(secrets.MongoReplicaPassword) == "",
		ClearOpaqueURI:            strings.TrimSpace(secrets.OpaqueURI) == "",
		ClearOpaqueDSN:            strings.TrimSpace(secrets.OpaqueDSN) == "",
	}
}

func (a *App) importConnectionPackagePayload(payload connectionPackagePayload) ([]connection.SavedConnectionView, error) {
	repo := a.savedConnectionRepository()
	rollbackSnapshot, err := captureConnectionPackageImportRollbackSnapshot(a, payload)
	if err != nil {
		return nil, err
	}

	result := make([]connection.SavedConnectionView, 0, len(payload.Connections))
	for _, item := range payload.Connections {
		view, err := repo.Save(newSavedConnectionInputFromPackageItem(item))
		if err != nil {
			if rollbackErr := rollbackSnapshot.restore(a); rollbackErr != nil {
				return nil, errors.Join(err, fmt.Errorf("restore connection package rollback: %w", rollbackErr))
			}
			return nil, err
		}
		result = append(result, view)
	}
	return result, nil
}

func (a *App) ImportConnectionsPayload(raw string, password string) ([]connection.SavedConnectionView, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, errConnectionPackageUnsupported
	}

	if isConnectionPackageEnvelope(trimmed) {
		var file connectionPackageFile
		if err := json.Unmarshal([]byte(trimmed), &file); err != nil {
			return nil, errConnectionPackageUnsupported
		}
		payload, err := decryptConnectionPackage(file, password)
		if err != nil {
			return nil, err
		}
		return a.importConnectionPackagePayload(payload)
	}

	var legacy []connection.LegacySavedConnection
	if err := json.Unmarshal([]byte(trimmed), &legacy); err != nil {
		return nil, errConnectionPackageUnsupported
	}
	return a.ImportLegacyConnections(legacy)
}

type connectionPackageImportRollbackSnapshot struct {
	connectionsFileExists bool
	connectionsFileData   []byte
	connectionSecrets     map[string]securityUpdateSecretSnapshot
	connectionCleanupRefs []string
}

func captureConnectionPackageImportRollbackSnapshot(a *App, payload connectionPackagePayload) (connectionPackageImportRollbackSnapshot, error) {
	snapshot := connectionPackageImportRollbackSnapshot{
		connectionSecrets: make(map[string]securityUpdateSecretSnapshot),
	}

	repo := a.savedConnectionRepository()
	connectionFileData, connectionFileExists, err := readOptionalFile(repo.connectionsPath())
	if err != nil {
		return snapshot, err
	}
	snapshot.connectionsFileExists = connectionFileExists
	snapshot.connectionsFileData = connectionFileData

	existingConnections, err := repo.load()
	if err != nil {
		return snapshot, err
	}
	existingConnectionsByID := make(map[string]connection.SavedConnectionView, len(existingConnections))
	for _, item := range existingConnections {
		existingConnectionsByID[item.ID] = item
	}

	cleanupSet := make(map[string]struct{})
	seenIDs := make(map[string]struct{})
	for _, item := range payload.Connections {
		input := newSavedConnectionInputFromPackageItem(item)
		connectionID := strings.TrimSpace(input.ID)
		if connectionID == "" {
			continue
		}
		if _, alreadySeen := seenIDs[connectionID]; alreadySeen {
			continue
		}
		seenIDs[connectionID] = struct{}{}

		defaultRef, refErr := secretstore.BuildRef(savedConnectionSecretKind, connectionID)
		if refErr == nil {
			cleanupSet[defaultRef] = struct{}{}
		}

		existing, ok := existingConnectionsByID[connectionID]
		if !ok || !savedConnectionViewHasSecrets(existing) {
			continue
		}

		ref := strings.TrimSpace(existing.SecretRef)
		if ref == "" {
			ref = defaultRef
		}
		if ref == "" {
			continue
		}

		secretSnapshot, captureErr := captureSecurityUpdateSecretSnapshot(a.secretStore, ref)
		if captureErr != nil {
			return snapshot, captureErr
		}
		snapshot.connectionSecrets[ref] = secretSnapshot
		cleanupSet[ref] = struct{}{}
	}

	snapshot.connectionCleanupRefs = make([]string, 0, len(cleanupSet))
	for ref := range cleanupSet {
		snapshot.connectionCleanupRefs = append(snapshot.connectionCleanupRefs, ref)
	}
	return snapshot, nil
}

func (s connectionPackageImportRollbackSnapshot) restore(a *App) error {
	repo := a.savedConnectionRepository()
	if err := restoreOptionalFile(repo.connectionsPath(), s.connectionsFileExists, s.connectionsFileData); err != nil {
		return err
	}
	for ref, secretSnapshot := range s.connectionSecrets {
		if err := restoreSecurityUpdateSecretSnapshot(a.secretStore, ref, secretSnapshot); err != nil {
			return err
		}
	}
	for _, ref := range s.connectionCleanupRefs {
		if _, alreadyRestored := s.connectionSecrets[ref]; alreadyRestored {
			continue
		}
		if err := deleteSecurityUpdateSecretRef(a.secretStore, ref); err != nil {
			return err
		}
	}
	return nil
}
