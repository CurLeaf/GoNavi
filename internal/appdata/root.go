package appdata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const bootstrapFileName = "storage_root.json"

type bootstrapConfig struct {
	DataRoot string `json:"dataRoot"`
}

func DefaultRoot() string {
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		return "."
	}
	return filepath.Join(homeDir, ".gonavi")
}

func BootstrapPath() string {
	return filepath.Join(DefaultRoot(), bootstrapFileName)
}

func normalizeRoot(root string) (string, error) {
	trimmed := strings.TrimSpace(root)
	if trimmed == "" {
		trimmed = DefaultRoot()
	}
	abs, err := filepath.Abs(trimmed)
	if err != nil {
		return "", err
	}
	return abs, nil
}

func ResolveRoot(root string) (string, error) {
	return normalizeRoot(root)
}

func ResolveActiveRoot() (string, error) {
	defaultRoot, err := normalizeRoot(DefaultRoot())
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(BootstrapPath())
	if err != nil {
		if os.IsNotExist(err) {
			return defaultRoot, nil
		}
		return "", err
	}
	var cfg bootstrapConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return "", err
	}
	if strings.TrimSpace(cfg.DataRoot) == "" {
		return defaultRoot, nil
	}
	return normalizeRoot(cfg.DataRoot)
}

func MustResolveActiveRoot() string {
	root, err := ResolveActiveRoot()
	if err != nil {
		return DefaultRoot()
	}
	return root
}

func DriverRoot(activeRoot string) string {
	root := strings.TrimSpace(activeRoot)
	if root == "" {
		root = MustResolveActiveRoot()
	}
	return filepath.Join(root, "drivers")
}

func SetActiveRoot(root string) (string, error) {
	targetRoot, err := normalizeRoot(root)
	if err != nil {
		return "", err
	}
	defaultRoot, err := normalizeRoot(DefaultRoot())
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		return "", fmt.Errorf("创建数据目录失败：%w", err)
	}
	if targetRoot == defaultRoot {
		if err := os.Remove(BootstrapPath()); err != nil && !os.IsNotExist(err) {
			return "", err
		}
		return defaultRoot, nil
	}
	if err := os.MkdirAll(defaultRoot, 0o755); err != nil {
		return "", fmt.Errorf("创建默认引导目录失败：%w", err)
	}
	payload, err := json.MarshalIndent(bootstrapConfig{DataRoot: targetRoot}, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(BootstrapPath(), payload, 0o644); err != nil {
		return "", err
	}
	return targetRoot, nil
}
