package app

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"GoNavi-Wails/internal/connection"

	"golang.org/x/image/font/sfnt"
)

const maxScannedFontFiles = 4096

type installedFontFamily struct {
	Family string `json:"family"`
	Path   string `json:"path,omitempty"`
}

func (a *App) ListInstalledFontFamilies() connection.QueryResult {
	families, err := listInstalledFontFamilies()
	if err != nil {
		return connection.QueryResult{
			Success: false,
			Message: err.Error(),
		}
	}
	return connection.QueryResult{
		Success: true,
		Data:    families,
	}
}

func listInstalledFontFamilies() ([]installedFontFamily, error) {
	fontPaths := resolveSystemFontDirs()
	if len(fontPaths) == 0 {
		return []installedFontFamily{}, nil
	}

	seenDirs := make(map[string]struct{}, len(fontPaths))
	familyByName := make(map[string]installedFontFamily)
	scannedFiles := 0

	for _, rawDir := range fontPaths {
		dir := strings.TrimSpace(rawDir)
		if dir == "" {
			continue
		}
		absDir, err := filepath.Abs(dir)
		if err != nil {
			absDir = dir
		}
		cleanDir := filepath.Clean(absDir)
		if _, ok := seenDirs[cleanDir]; ok {
			continue
		}
		seenDirs[cleanDir] = struct{}{}

		info, err := os.Stat(cleanDir)
		if err != nil || !info.IsDir() {
			continue
		}

		walkErr := filepath.WalkDir(cleanDir, func(path string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if d.IsDir() {
				return nil
			}
			if scannedFiles >= maxScannedFontFiles {
				return fs.SkipAll
			}
			if !isFontFile(path) {
				return nil
			}
			scannedFiles++
			family := readFontFamilyName(path)
			if family == "" {
				return nil
			}
			if _, exists := familyByName[family]; exists {
				return nil
			}
			familyByName[family] = installedFontFamily{
				Family: family,
				Path:   path,
			}
			return nil
		})
		if walkErr == fs.SkipAll {
			break
		}
	}

	result := make([]installedFontFamily, 0, len(familyByName))
	for _, item := range familyByName {
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i].Family) < strings.ToLower(result[j].Family)
	})
	return result, nil
}

func resolveSystemFontDirs() []string {
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		return []string{
			"/System/Library/Fonts",
			"/Library/Fonts",
			filepath.Join(home, "Library", "Fonts"),
		}
	case "windows":
		winDir := os.Getenv("WINDIR")
		localAppData := os.Getenv("LOCALAPPDATA")
		return []string{
			filepath.Join(winDir, "Fonts"),
			filepath.Join(localAppData, "Microsoft", "Windows", "Fonts"),
		}
	default:
		home, _ := os.UserHomeDir()
		return []string{
			"/usr/share/fonts",
			"/usr/local/share/fonts",
			filepath.Join(home, ".fonts"),
			filepath.Join(home, ".local", "share", "fonts"),
		}
	}
}

func isFontFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".ttf", ".otf", ".ttc", ".otc":
		return true
	default:
		return false
	}
}

func readFontFamilyName(path string) string {
	file, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer func() { _ = file.Close() }()

	collection, err := sfnt.ParseCollectionReaderAt(file)
	if err != nil {
		return ""
	}
	var buf sfnt.Buffer
	fontCount := collection.NumFonts()
	for i := range fontCount {
		font, fontErr := collection.Font(i)
		if fontErr != nil {
			continue
		}
		for _, nameID := range []sfnt.NameID{sfnt.NameIDTypographicFamily, sfnt.NameIDFamily} {
			family, nameErr := font.Name(&buf, nameID)
			if nameErr == nil && strings.TrimSpace(family) != "" {
				return strings.TrimSpace(family)
			}
		}
	}
	return ""
}
