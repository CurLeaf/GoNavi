package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/secretstore"
)

const (
	globalProxyFileName   = "global_proxy.json"
	globalProxySecretKind = "global-proxy"
	globalProxySecretID   = "default"
)

type globalProxySecretBundle struct {
	Password string `json:"password,omitempty"`
}

func globalProxyMetadataPath(configDir string) string {
	return filepath.Join(configDir, globalProxyFileName)
}

func (a *App) saveGlobalProxy(input connection.SaveGlobalProxyInput) (connection.GlobalProxyView, error) {
	if strings.TrimSpace(a.configDir) == "" {
		a.configDir = resolveAppConfigDir()
	}

	existing, err := a.loadStoredGlobalProxyView()
	if err != nil && !os.IsNotExist(err) {
		return connection.GlobalProxyView{}, err
	}

	view := connection.GlobalProxyView{
		Enabled: input.Enabled,
		Type:    strings.TrimSpace(input.Type),
		Host:    strings.TrimSpace(input.Host),
		Port:    input.Port,
		User:    strings.TrimSpace(input.User),
	}

	bundle := globalProxySecretBundle{}
	if strings.TrimSpace(input.Password) != "" {
		bundle.Password = input.Password
	} else if existing.HasPassword {
		existingBundle, loadErr := a.loadGlobalProxySecretBundle(existing)
		if loadErr != nil {
			return connection.GlobalProxyView{}, loadErr
		}
		bundle = existingBundle
		view.SecretRef = existing.SecretRef
	}

	if !view.Enabled {
		if strings.TrimSpace(existing.SecretRef) != "" && a.secretStore != nil {
			if deleteErr := a.secretStore.Delete(existing.SecretRef); deleteErr != nil {
				return connection.GlobalProxyView{}, deleteErr
			}
		}
		view = connection.GlobalProxyView{Enabled: false}
		if err := a.persistGlobalProxyView(view); err != nil {
			return connection.GlobalProxyView{}, err
		}
		if _, err := setGlobalProxyConfig(false, connection.ProxyConfig{}); err != nil {
			return connection.GlobalProxyView{}, err
		}
		return view, nil
	}

	if strings.TrimSpace(bundle.Password) != "" {
		ref, storeErr := a.storeGlobalProxySecret(view.SecretRef, bundle)
		if storeErr != nil {
			return connection.GlobalProxyView{}, storeErr
		}
		view.SecretRef = ref
		view.HasPassword = true
	} else {
		if strings.TrimSpace(existing.SecretRef) != "" && a.secretStore != nil {
			if deleteErr := a.secretStore.Delete(existing.SecretRef); deleteErr != nil {
				return connection.GlobalProxyView{}, deleteErr
			}
		}
		view.SecretRef = ""
		view.HasPassword = false
	}

	if err := a.persistGlobalProxyView(view); err != nil {
		return connection.GlobalProxyView{}, err
	}
	if _, err := setGlobalProxyConfig(true, connection.ProxyConfig{
		Type:     view.Type,
		Host:     view.Host,
		Port:     view.Port,
		User:     view.User,
		Password: bundle.Password,
	}); err != nil {
		return connection.GlobalProxyView{}, err
	}
	view.Password = ""
	return view, nil
}

func (a *App) persistGlobalProxyView(view connection.GlobalProxyView) error {
	if err := os.MkdirAll(a.configDir, 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(view, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(globalProxyMetadataPath(a.configDir), payload, 0o644)
}

func (a *App) loadStoredGlobalProxyView() (connection.GlobalProxyView, error) {
	data, err := os.ReadFile(globalProxyMetadataPath(a.configDir))
	if err != nil {
		return connection.GlobalProxyView{}, err
	}
	var view connection.GlobalProxyView
	if err := json.Unmarshal(data, &view); err != nil {
		return connection.GlobalProxyView{}, err
	}
	return view, nil
}

func (a *App) loadGlobalProxySecretBundle(view connection.GlobalProxyView) (globalProxySecretBundle, error) {
	if !view.HasPassword {
		return globalProxySecretBundle{}, nil
	}
	if a.secretStore == nil {
		return globalProxySecretBundle{}, fmt.Errorf("secret store unavailable")
	}
	ref := strings.TrimSpace(view.SecretRef)
	if ref == "" {
		var err error
		ref, err = secretstore.BuildRef(globalProxySecretKind, globalProxySecretID)
		if err != nil {
			return globalProxySecretBundle{}, err
		}
	}
	payload, err := a.secretStore.Get(ref)
	if err != nil {
		return globalProxySecretBundle{}, err
	}
	var bundle globalProxySecretBundle
	if err := json.Unmarshal(payload, &bundle); err != nil {
		return globalProxySecretBundle{}, err
	}
	return bundle, nil
}

func (a *App) storeGlobalProxySecret(existingRef string, bundle globalProxySecretBundle) (string, error) {
	if a.secretStore == nil {
		return "", fmt.Errorf("secret store unavailable")
	}
	if err := a.secretStore.HealthCheck(); err != nil {
		return "", err
	}
	ref := strings.TrimSpace(existingRef)
	if ref == "" {
		var err error
		ref, err = secretstore.BuildRef(globalProxySecretKind, globalProxySecretID)
		if err != nil {
			return "", err
		}
	}
	payload, err := json.Marshal(bundle)
	if err != nil {
		return "", err
	}
	if err := a.secretStore.Put(ref, payload); err != nil {
		return "", err
	}
	return ref, nil
}

func (a *App) loadPersistedGlobalProxy() {
	view, err := a.loadStoredGlobalProxyView()
	if err != nil {
		if !os.IsNotExist(err) {
			logger.Error(err, "加载全局代理元数据失败")
		}
		return
	}

	proxyConfig := connection.ProxyConfig{
		Type: view.Type,
		Host: view.Host,
		Port: view.Port,
		User: view.User,
	}
	if view.HasPassword {
		bundle, loadErr := a.loadGlobalProxySecretBundle(view)
		if loadErr != nil {
			logger.Error(loadErr, "加载全局代理密码失败")
			return
		}
		proxyConfig.Password = bundle.Password
	}
	if _, err := setGlobalProxyConfig(view.Enabled, proxyConfig); err != nil {
		logger.Error(err, "恢复全局代理配置失败")
	}
}
