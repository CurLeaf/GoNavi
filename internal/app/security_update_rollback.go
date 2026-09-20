package app

import (
	"os"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

type securityUpdateSecretSnapshot struct {
	Exists  bool
	Payload []byte
}

type securityUpdateCurrentAppRollbackSnapshot struct {
	connectionsFileExists bool
	connectionsFileData   []byte
	connectionSecrets     map[string]securityUpdateSecretSnapshot
	connectionCleanupRefs []string

	globalProxyFileExists bool
	globalProxyFileData   []byte
	globalProxySecretRef  string
	globalProxySecret     securityUpdateSecretSnapshot
	globalProxyCleanupRef string
}

func captureSecurityUpdateCurrentAppRollbackSnapshot(a *App, source securityUpdateCurrentAppSource) (securityUpdateCurrentAppRollbackSnapshot, error) {
	snapshot := securityUpdateCurrentAppRollbackSnapshot{
		connectionSecrets: make(map[string]securityUpdateSecretSnapshot),
	}
	configDir := strings.TrimSpace(a.configDir)
	if configDir == "" {
		configDir = resolveAppConfigDir()
	}

	connectionRepo := a.savedConnectionRepository()
	connectionFileData, connectionFileExists, err := readOptionalFile(connectionRepo.connectionsPath())
	if err != nil {
		return snapshot, err
	}
	snapshot.connectionsFileExists = connectionFileExists
	snapshot.connectionsFileData = connectionFileData

	existingConnections, err := connectionRepo.load()
	if err != nil {
		return snapshot, err
	}
	existingConnectionsByID := make(map[string]connection.SavedConnectionView, len(existingConnections))
	for _, item := range existingConnections {
		existingConnectionsByID[item.ID] = item
	}

	connectionCleanupSet := make(map[string]struct{})
	for _, item := range source.Connections {
		connectionID := strings.TrimSpace(item.ID)
		if connectionID == "" {
			connectionID = strings.TrimSpace(item.Config.ID)
		}
		if connectionID == "" {
			continue
		}

		defaultRef, refErr := secretstore.BuildRef(savedConnectionSecretKind, connectionID)
		if refErr == nil {
			connectionCleanupSet[defaultRef] = struct{}{}
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
		connectionCleanupSet[ref] = struct{}{}
	}

	snapshot.connectionCleanupRefs = make([]string, 0, len(connectionCleanupSet))
	for ref := range connectionCleanupSet {
		snapshot.connectionCleanupRefs = append(snapshot.connectionCleanupRefs, ref)
	}

	if source.GlobalProxy != nil {
		globalProxyFileData, globalProxyFileExists, err := readOptionalFile(globalProxyMetadataPath(configDir))
		if err != nil {
			return snapshot, err
		}
		snapshot.globalProxyFileExists = globalProxyFileExists
		snapshot.globalProxyFileData = globalProxyFileData

		defaultProxyRef, refErr := secretstore.BuildRef(globalProxySecretKind, globalProxySecretID)
		if refErr == nil {
			snapshot.globalProxyCleanupRef = defaultProxyRef
		}

		existingProxy, err := a.loadStoredGlobalProxyView()
		if err != nil {
			if !os.IsNotExist(err) {
				return snapshot, err
			}
		} else if existingProxy.HasPassword {
			ref := strings.TrimSpace(existingProxy.SecretRef)
			if ref == "" {
				ref = snapshot.globalProxyCleanupRef
			}
			if ref != "" {
				secretSnapshot, captureErr := captureSecurityUpdateSecretSnapshot(a.secretStore, ref)
				if captureErr != nil {
					return snapshot, captureErr
				}
				snapshot.globalProxySecretRef = ref
				snapshot.globalProxySecret = secretSnapshot
			}
		}
	}

	return snapshot, nil
}

func (s securityUpdateCurrentAppRollbackSnapshot) restore(a *App) error {
	configDir := strings.TrimSpace(a.configDir)
	if configDir == "" {
		configDir = resolveAppConfigDir()
	}
	connectionRepo := a.savedConnectionRepository()
	if err := restoreOptionalFile(connectionRepo.connectionsPath(), s.connectionsFileExists, s.connectionsFileData); err != nil {
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

	if err := restoreOptionalFile(globalProxyMetadataPath(configDir), s.globalProxyFileExists, s.globalProxyFileData); err != nil {
		return err
	}
	if s.globalProxySecretRef != "" {
		if err := restoreSecurityUpdateSecretSnapshot(a.secretStore, s.globalProxySecretRef, s.globalProxySecret); err != nil {
			return err
		}
	}
	if s.globalProxyCleanupRef != "" && s.globalProxyCleanupRef != s.globalProxySecretRef {
		if err := deleteSecurityUpdateSecretRef(a.secretStore, s.globalProxyCleanupRef); err != nil {
			return err
		}
	}

	if s.globalProxyFileExists {
		a.loadPersistedGlobalProxy()
		return nil
	}
	_, err := setGlobalProxyConfig(false, connection.ProxyConfig{})
	return err
}

func readOptionalFile(path string) ([]byte, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return append([]byte(nil), data...), true, nil
}

func restoreOptionalFile(path string, exists bool, data []byte) error {
	if !exists {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	return os.WriteFile(path, data, 0o644)
}

func captureSecurityUpdateSecretSnapshot(store secretstore.SecretStore, ref string) (securityUpdateSecretSnapshot, error) {
	if store == nil || strings.TrimSpace(ref) == "" {
		return securityUpdateSecretSnapshot{}, nil
	}
	payload, err := store.Get(ref)
	if err != nil {
		if os.IsNotExist(err) || secretstore.IsUnavailable(err) {
			return securityUpdateSecretSnapshot{}, nil
		}
		return securityUpdateSecretSnapshot{}, err
	}
	return securityUpdateSecretSnapshot{
		Exists:  true,
		Payload: append([]byte(nil), payload...),
	}, nil
}

func restoreSecurityUpdateSecretSnapshot(store secretstore.SecretStore, ref string, snapshot securityUpdateSecretSnapshot) error {
	if store == nil || strings.TrimSpace(ref) == "" {
		return nil
	}
	if snapshot.Exists {
		if err := store.Put(ref, snapshot.Payload); err != nil {
			if secretstore.IsUnavailable(err) {
				return nil
			}
			return err
		}
		return nil
	}
	return deleteSecurityUpdateSecretRef(store, ref)
}

func deleteSecurityUpdateSecretRef(store secretstore.SecretStore, ref string) error {
	if store == nil || strings.TrimSpace(ref) == "" {
		return nil
	}
	if err := store.Delete(ref); err != nil {
		if os.IsNotExist(err) || secretstore.IsUnavailable(err) {
			return nil
		}
		return err
	}
	return nil
}
