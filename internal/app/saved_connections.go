package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
	"github.com/google/uuid"
)

const (
	savedConnectionsFileName  = "connections.json"
	savedConnectionSecretKind = "connection"
)

type connectionSecretBundle struct {
	Password             string `json:"password,omitempty"`
	SSHPassword          string `json:"sshPassword,omitempty"`
	ProxyPassword        string `json:"proxyPassword,omitempty"`
	HTTPTunnelPassword   string `json:"httpTunnelPassword,omitempty"`
	MySQLReplicaPassword string `json:"mysqlReplicaPassword,omitempty"`
	MongoReplicaPassword string `json:"mongoReplicaPassword,omitempty"`
	OpaqueURI            string `json:"opaqueURI,omitempty"`
	OpaqueDSN            string `json:"opaqueDSN,omitempty"`
}

type savedConnectionsFile struct {
	Connections []connection.SavedConnectionView `json:"connections"`
}

type savedConnectionRepository struct {
	configDir   string
	secretStore secretstore.SecretStore
}

func resolveAppConfigDir() string {
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		return "."
	}
	return filepath.Join(homeDir, ".gonavi")
}

func newSavedConnectionRepository(configDir string, store secretstore.SecretStore) *savedConnectionRepository {
	if strings.TrimSpace(configDir) == "" {
		configDir = resolveAppConfigDir()
	}
	if store == nil {
		store = secretstore.NewUnavailableStore("secret store unavailable")
	}
	return &savedConnectionRepository{configDir: configDir, secretStore: store}
}

func (b connectionSecretBundle) hasAny() bool {
	return strings.TrimSpace(b.Password) != "" ||
		strings.TrimSpace(b.SSHPassword) != "" ||
		strings.TrimSpace(b.ProxyPassword) != "" ||
		strings.TrimSpace(b.HTTPTunnelPassword) != "" ||
		strings.TrimSpace(b.MySQLReplicaPassword) != "" ||
		strings.TrimSpace(b.MongoReplicaPassword) != "" ||
		strings.TrimSpace(b.OpaqueURI) != "" ||
		strings.TrimSpace(b.OpaqueDSN) != ""
}

func mergeConnectionSecretBundles(base, overlay connectionSecretBundle) connectionSecretBundle {
	merged := base
	if strings.TrimSpace(overlay.Password) != "" {
		merged.Password = overlay.Password
	}
	if strings.TrimSpace(overlay.SSHPassword) != "" {
		merged.SSHPassword = overlay.SSHPassword
	}
	if strings.TrimSpace(overlay.ProxyPassword) != "" {
		merged.ProxyPassword = overlay.ProxyPassword
	}
	if strings.TrimSpace(overlay.HTTPTunnelPassword) != "" {
		merged.HTTPTunnelPassword = overlay.HTTPTunnelPassword
	}
	if strings.TrimSpace(overlay.MySQLReplicaPassword) != "" {
		merged.MySQLReplicaPassword = overlay.MySQLReplicaPassword
	}
	if strings.TrimSpace(overlay.MongoReplicaPassword) != "" {
		merged.MongoReplicaPassword = overlay.MongoReplicaPassword
	}
	if strings.TrimSpace(overlay.OpaqueURI) != "" {
		merged.OpaqueURI = overlay.OpaqueURI
	}
	if strings.TrimSpace(overlay.OpaqueDSN) != "" {
		merged.OpaqueDSN = overlay.OpaqueDSN
	}
	return merged
}

func splitConnectionSecrets(input connection.SavedConnectionInput) (connection.SavedConnectionView, connectionSecretBundle) {
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = strings.TrimSpace(input.Config.ID)
	}

	meta := input.Config
	meta.ID = id
	meta.SavePassword = false

	bundle := connectionSecretBundle{}
	if strings.TrimSpace(meta.Password) != "" {
		bundle.Password = meta.Password
		meta.Password = ""
	}
	if strings.TrimSpace(meta.SSH.Password) != "" {
		bundle.SSHPassword = meta.SSH.Password
		meta.SSH.Password = ""
	}
	if strings.TrimSpace(meta.Proxy.Password) != "" {
		bundle.ProxyPassword = meta.Proxy.Password
		meta.Proxy.Password = ""
	}
	if strings.TrimSpace(meta.HTTPTunnel.Password) != "" {
		bundle.HTTPTunnelPassword = meta.HTTPTunnel.Password
		meta.HTTPTunnel.Password = ""
	}
	if strings.TrimSpace(meta.MySQLReplicaPassword) != "" {
		bundle.MySQLReplicaPassword = meta.MySQLReplicaPassword
		meta.MySQLReplicaPassword = ""
	}
	if strings.TrimSpace(meta.MongoReplicaPassword) != "" {
		bundle.MongoReplicaPassword = meta.MongoReplicaPassword
		meta.MongoReplicaPassword = ""
	}
	if strings.TrimSpace(meta.URI) != "" {
		bundle.OpaqueURI = meta.URI
		meta.URI = ""
	}
	if strings.TrimSpace(meta.DSN) != "" {
		bundle.OpaqueDSN = meta.DSN
		meta.DSN = ""
	}

	view := connection.SavedConnectionView{
		ID:                      id,
		Name:                    strings.TrimSpace(input.Name),
		Config:                  meta,
		HasPrimaryPassword:      strings.TrimSpace(bundle.Password) != "",
		HasSSHPassword:          strings.TrimSpace(bundle.SSHPassword) != "",
		HasProxyPassword:        strings.TrimSpace(bundle.ProxyPassword) != "",
		HasHTTPTunnelPassword:   strings.TrimSpace(bundle.HTTPTunnelPassword) != "",
		HasMySQLReplicaPassword: strings.TrimSpace(bundle.MySQLReplicaPassword) != "",
		HasMongoReplicaPassword: strings.TrimSpace(bundle.MongoReplicaPassword) != "",
		HasOpaqueURI:            strings.TrimSpace(bundle.OpaqueURI) != "",
		HasOpaqueDSN:            strings.TrimSpace(bundle.OpaqueDSN) != "",
	}
	return view, bundle
}

func (r *savedConnectionRepository) connectionsPath() string {
	return filepath.Join(r.configDir, savedConnectionsFileName)
}

func (r *savedConnectionRepository) load() ([]connection.SavedConnectionView, error) {
	data, err := os.ReadFile(r.connectionsPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []connection.SavedConnectionView{}, nil
		}
		return nil, err
	}

	var file savedConnectionsFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}
	if file.Connections == nil {
		return []connection.SavedConnectionView{}, nil
	}
	return file.Connections, nil
}

func (r *savedConnectionRepository) saveAll(connections []connection.SavedConnectionView) error {
	if err := os.MkdirAll(r.configDir, 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(savedConnectionsFile{Connections: connections}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(r.connectionsPath(), payload, 0o644)
}

func (r *savedConnectionRepository) Save(input connection.SavedConnectionInput) (connection.SavedConnectionView, error) {
	if strings.TrimSpace(input.ID) == "" && strings.TrimSpace(input.Config.ID) == "" {
		input.ID = "conn-" + uuid.New().String()[:8]
	}
	if strings.TrimSpace(input.ID) == "" {
		input.ID = strings.TrimSpace(input.Config.ID)
	}
	input.Config.ID = input.ID

	connections, err := r.load()
	if err != nil {
		return connection.SavedConnectionView{}, err
	}

	view, bundle := splitConnectionSecrets(input)
	index := -1
	var existing connection.SavedConnectionView
	for i, item := range connections {
		if item.ID == view.ID {
			index = i
			existing = item
			break
		}
	}

	mergedBundle := bundle
	if index >= 0 && savedConnectionViewHasSecrets(existing) {
		existingBundle, bundleErr := r.loadSecretBundle(existing)
		if bundleErr != nil {
			return connection.SavedConnectionView{}, bundleErr
		}
		mergedBundle = mergeConnectionSecretBundles(existingBundle, bundle)
		view.SecretRef = existing.SecretRef
	}

	if mergedBundle.hasAny() {
		ref, storeErr := r.storeSecretBundle(view.ID, view.SecretRef, mergedBundle)
		if storeErr != nil {
			return connection.SavedConnectionView{}, storeErr
		}
		view.SecretRef = ref
		applyConnectionBundleFlags(&view, mergedBundle)
	} else {
		if index >= 0 && strings.TrimSpace(existing.SecretRef) != "" {
			if deleteErr := r.secretStore.Delete(existing.SecretRef); deleteErr != nil {
				return connection.SavedConnectionView{}, deleteErr
			}
		}
		view.SecretRef = ""
		applyConnectionBundleFlags(&view, connectionSecretBundle{})
	}

	if index >= 0 {
		connections[index] = view
	} else {
		connections = append(connections, view)
	}
	if err := r.saveAll(connections); err != nil {
		return connection.SavedConnectionView{}, err
	}
	return view, nil
}

func (r *savedConnectionRepository) Find(id string) (connection.SavedConnectionView, error) {
	connections, err := r.load()
	if err != nil {
		return connection.SavedConnectionView{}, err
	}
	for _, item := range connections {
		if item.ID == strings.TrimSpace(id) {
			return item, nil
		}
	}
	return connection.SavedConnectionView{}, fmt.Errorf("saved connection not found: %s", id)
}

func (r *savedConnectionRepository) storeSecretBundle(id string, existingRef string, bundle connectionSecretBundle) (string, error) {
	if r.secretStore == nil {
		return "", fmt.Errorf("secret store unavailable")
	}
	if err := r.secretStore.HealthCheck(); err != nil {
		return "", err
	}
	ref := strings.TrimSpace(existingRef)
	if ref == "" {
		var err error
		ref, err = secretstore.BuildRef(savedConnectionSecretKind, id)
		if err != nil {
			return "", err
		}
	}
	payload, err := json.Marshal(bundle)
	if err != nil {
		return "", err
	}
	if err := r.secretStore.Put(ref, payload); err != nil {
		return "", err
	}
	return ref, nil
}

func (r *savedConnectionRepository) loadSecretBundle(view connection.SavedConnectionView) (connectionSecretBundle, error) {
	if !savedConnectionViewHasSecrets(view) {
		return connectionSecretBundle{}, nil
	}
	if r.secretStore == nil {
		return connectionSecretBundle{}, fmt.Errorf("secret store unavailable")
	}
	ref := strings.TrimSpace(view.SecretRef)
	if ref == "" {
		var err error
		ref, err = secretstore.BuildRef(savedConnectionSecretKind, view.ID)
		if err != nil {
			return connectionSecretBundle{}, err
		}
	}
	payload, err := r.secretStore.Get(ref)
	if err != nil {
		return connectionSecretBundle{}, err
	}
	var bundle connectionSecretBundle
	if err := json.Unmarshal(payload, &bundle); err != nil {
		return connectionSecretBundle{}, err
	}
	return bundle, nil
}

func savedConnectionViewHasSecrets(view connection.SavedConnectionView) bool {
	return view.HasPrimaryPassword || view.HasSSHPassword || view.HasProxyPassword || view.HasHTTPTunnelPassword ||
		view.HasMySQLReplicaPassword || view.HasMongoReplicaPassword || view.HasOpaqueURI || view.HasOpaqueDSN
}

func applyConnectionBundleFlags(view *connection.SavedConnectionView, bundle connectionSecretBundle) {
	view.HasPrimaryPassword = strings.TrimSpace(bundle.Password) != ""
	view.HasSSHPassword = strings.TrimSpace(bundle.SSHPassword) != ""
	view.HasProxyPassword = strings.TrimSpace(bundle.ProxyPassword) != ""
	view.HasHTTPTunnelPassword = strings.TrimSpace(bundle.HTTPTunnelPassword) != ""
	view.HasMySQLReplicaPassword = strings.TrimSpace(bundle.MySQLReplicaPassword) != ""
	view.HasMongoReplicaPassword = strings.TrimSpace(bundle.MongoReplicaPassword) != ""
	view.HasOpaqueURI = strings.TrimSpace(bundle.OpaqueURI) != ""
	view.HasOpaqueDSN = strings.TrimSpace(bundle.OpaqueDSN) != ""
}

func (r *savedConnectionRepository) List() ([]connection.SavedConnectionView, error) {
	return r.load()
}

func (r *savedConnectionRepository) Delete(id string) error {
	connections, err := r.load()
	if err != nil {
		return err
	}
	filtered := make([]connection.SavedConnectionView, 0, len(connections))
	for _, item := range connections {
		if item.ID == strings.TrimSpace(id) {
			if strings.TrimSpace(item.SecretRef) != "" && r.secretStore != nil {
				if deleteErr := r.secretStore.Delete(item.SecretRef); deleteErr != nil {
					return deleteErr
				}
			}
			continue
		}
		filtered = append(filtered, item)
	}
	return r.saveAll(filtered)
}

func (r *savedConnectionRepository) Duplicate(id string) (connection.SavedConnectionView, error) {
	original, err := r.Find(id)
	if err != nil {
		return connection.SavedConnectionView{}, err
	}

	duplicate := original
	duplicate.ID = "conn-" + uuid.New().String()[:8]
	duplicate.Config.ID = duplicate.ID
	duplicate.Name = original.Name + " Copy"

	bundle, err := r.loadSecretBundle(original)
	if err != nil {
		return connection.SavedConnectionView{}, err
	}
	if bundle.hasAny() {
		ref, storeErr := r.storeSecretBundle(duplicate.ID, "", bundle)
		if storeErr != nil {
			return connection.SavedConnectionView{}, storeErr
		}
		duplicate.SecretRef = ref
		applyConnectionBundleFlags(&duplicate, bundle)
	} else {
		duplicate.SecretRef = ""
		applyConnectionBundleFlags(&duplicate, connectionSecretBundle{})
	}

	connections, err := r.load()
	if err != nil {
		return connection.SavedConnectionView{}, err
	}
	connections = append(connections, duplicate)
	if err := r.saveAll(connections); err != nil {
		return connection.SavedConnectionView{}, err
	}
	return duplicate, nil
}
