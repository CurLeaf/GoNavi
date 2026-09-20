package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

const (
	modeSeedSecureStorage = "seed-secure-storage"
)

const (
	testConnectionID       = "manualtest-postgres"
	testBackupDirName      = "manual-test-backups"
	connectionsFileName    = "connections.json"
	globalProxyFileName    = "global_proxy.json"
	securityUpdateFileName = "config-security-update.json"
)

type backupManifest struct {
	CreatedAt string               `json:"createdAt"`
	ConfigDir string               `json:"configDir"`
	Files     []backupManifestFile `json:"files"`
}

type backupManifestFile struct {
	RelativePath string `json:"relativePath"`
	Existed      bool   `json:"existed"`
}

func main() {
	mode := flag.String("mode", modeSeedSecureStorage, "seed mode: seed-secure-storage")
	flag.Parse()

	configDir, err := resolveConfigDir()
	if err != nil {
		fatalf("resolve config dir failed: %v", err)
	}

	store := secretstore.NewKeyringStore()
	if err := store.HealthCheck(); err != nil {
		fatalf("secret store unavailable: %v", err)
	}

	backupDir, err := backupConfigFiles(configDir)
	if err != nil {
		fatalf("backup config files failed: %v", err)
	}

	switch strings.TrimSpace(*mode) {
	case modeSeedSecureStorage:
		if err := seedSecureStorage(configDir, store); err != nil {
			fatalf("seed secure storage failed: %v", err)
		}
		fmt.Printf("mode=%s\nbackup=%s\nconnectionId=%s\n", modeSeedSecureStorage, backupDir, testConnectionID)
	default:
		fatalf("unsupported mode: %s", *mode)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func resolveConfigDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".gonavi"), nil
}

func backupConfigFiles(configDir string) (string, error) {
	backupDir := filepath.Join(configDir, testBackupDirName, time.Now().Format("20060102-150405"))
	files := []string{
		connectionsFileName,
		globalProxyFileName,
		filepath.Join("migrations", securityUpdateFileName),
	}

	manifest := backupManifest{
		CreatedAt: time.Now().Format(time.RFC3339),
		ConfigDir: configDir,
		Files:     make([]backupManifestFile, 0, len(files)),
	}

	for _, relativePath := range files {
		srcPath := filepath.Join(configDir, relativePath)
		info, err := os.Stat(srcPath)
		if err != nil {
			if os.IsNotExist(err) {
				manifest.Files = append(manifest.Files, backupManifestFile{
					RelativePath: relativePath,
					Existed:      false,
				})
				continue
			}
			return "", err
		}
		if info.IsDir() {
			continue
		}

		dstPath := filepath.Join(backupDir, relativePath)
		if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
			return "", err
		}
		data, err := os.ReadFile(srcPath)
		if err != nil {
			return "", err
		}
		if err := os.WriteFile(dstPath, data, 0o644); err != nil {
			return "", err
		}
		manifest.Files = append(manifest.Files, backupManifestFile{
			RelativePath: relativePath,
			Existed:      true,
		})
	}

	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return "", err
	}
	manifestData, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(backupDir, "manifest.json"), manifestData, 0o644); err != nil {
		return "", err
	}
	return backupDir, nil
}

func seedSecureStorage(_ string, store secretstore.SecretStore) error {
	if err := cleanupKnownTestSecrets(store); err != nil {
		return err
	}

	appService := app.NewAppWithSecretStore(store)
	_ = appService.DeleteConnection(testConnectionID)

	if _, err := appService.SaveConnection(connection.SavedConnectionInput{
		ID:   testConnectionID,
		Name: "手工测试 PostgreSQL",
		Config: connection.ConnectionConfig{
			ID:       testConnectionID,
			Type:     "postgres",
			Host:     "127.0.0.1",
			Port:     5432,
			User:     "postgres",
			Password: "manualtest-pg-secret",
			Database: "postgres",
		},
	}); err != nil {
		return err
	}

	if _, err := appService.SaveGlobalProxy(connection.SaveGlobalProxyInput{
		Enabled:  true,
		Type:     "http",
		Host:     "127.0.0.1",
		Port:     7890,
		User:     "manual-test",
		Password: "manualtest-proxy-secret",
	}); err != nil {
		return err
	}

	return nil
}

func cleanupKnownTestSecrets(store secretstore.SecretStore) error {
	type secretRef struct {
		kind string
		id   string
	}
	refs := []secretRef{
		{kind: "connection", id: testConnectionID},
		{kind: "global-proxy", id: "default"},
	}

	for _, item := range refs {
		ref, err := secretstore.BuildRef(item.kind, item.id)
		if err != nil {
			return err
		}
		if err := store.Delete(ref); err != nil && !isIgnorableDeleteError(err) {
			return err
		}
	}
	return nil
}

func isIgnorableDeleteError(err error) bool {
	if err == nil || os.IsNotExist(err) {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "could not be found") ||
		strings.Contains(message, "not be found in the keyring") ||
		strings.Contains(message, "element not found")
}
