package app

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	stdRuntime "runtime"
	"sort"
	"strings"
	"time"

	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
)

func optionalDriverPublicTypeName(driverType string) string {
	switch normalizeDriverType(driverType) {
	case "diros":
		return "doris"
	default:
		return normalizeDriverType(driverType)
	}
}

func optionalDriverExecutableBaseNameForType(typeName string) string {
	base := strings.TrimSpace(typeName)
	if base == "" {
		base = "unknown"
	}
	name := fmt.Sprintf("%s-driver-agent", base)
	if stdRuntime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func optionalDriverReleaseAssetNameForType(typeName string, goos string, goarch string) string {
	base := strings.TrimSpace(typeName)
	if base == "" {
		base = "unknown"
	}
	name := fmt.Sprintf("%s-driver-agent-%s-%s", base, goos, goarch)
	if strings.EqualFold(goos, "windows") {
		return name + ".exe"
	}
	return name
}

func optionalDriverNameStemCandidates(driverType string, selectedVersion string) []string {
	candidates := make([]string, 0, 3)
	seen := make(map[string]struct{}, 3)
	appendStem := func(stem string) {
		trimmed := strings.TrimSpace(stem)
		if trimmed == "" {
			return
		}
		if _, ok := seen[trimmed]; ok {
			return
		}
		seen[trimmed] = struct{}{}
		candidates = append(candidates, trimmed)
	}

	base := fmt.Sprintf("%s-driver-agent", optionalDriverPublicTypeName(driverType))
	if normalizeDriverType(driverType) == "mongodb" {
		switch resolveMongoDriverMajorFromVersion(selectedVersion) {
		case 1:
			appendStem(base + "-v1")
		case 2:
			appendStem(base + "-v2")
			appendStem(base)
		default:
			appendStem(base)
		}
		return candidates
	}

	appendStem(base)
	return candidates
}

func optionalDriverExecutableBaseNamesForVersion(driverType string, selectedVersion string) []string {
	names := make([]string, 0, 2)
	seen := make(map[string]struct{}, 2)
	appendName := func(stem string) {
		name := strings.TrimSpace(stem)
		if strings.TrimSpace(name) == "" {
			return
		}
		if stdRuntime.GOOS == "windows" {
			name += ".exe"
		}
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}

	for _, stem := range optionalDriverNameStemCandidates(driverType, selectedVersion) {
		appendName(stem)
	}
	return names
}

func optionalDriverExecutableBaseNames(driverType string) []string {
	return optionalDriverExecutableBaseNamesForVersion(driverType, "")
}

func optionalDriverReleaseAssetNamesForVersion(driverType string, selectedVersion string) []string {
	names := make([]string, 0, 2)
	seen := make(map[string]struct{}, 2)
	appendName := func(stem string) {
		trimmedStem := strings.TrimSpace(stem)
		if trimmedStem == "" {
			return
		}
		name := fmt.Sprintf("%s-%s-%s", trimmedStem, stdRuntime.GOOS, stdRuntime.GOARCH)
		if strings.EqualFold(stdRuntime.GOOS, "windows") {
			name += ".exe"
		}
		if strings.TrimSpace(name) == "" {
			return
		}
		if _, ok := seen[name]; ok {
			return
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}

	for _, stem := range optionalDriverNameStemCandidates(driverType, selectedVersion) {
		appendName(stem)
	}
	return names
}

func optionalDriverReleaseAssetNames(driverType string) []string {
	return optionalDriverReleaseAssetNamesForVersion(driverType, "")
}

func optionalDriverExecutableBaseName(driverType string) string {
	names := optionalDriverExecutableBaseNames(driverType)
	if len(names) == 0 {
		return optionalDriverExecutableBaseNameForType("")
	}
	return names[0]
}

func optionalDriverReleaseAssetName(driverType string) string {
	names := optionalDriverReleaseAssetNames(driverType)
	if len(names) == 0 {
		return optionalDriverReleaseAssetNameForType("", stdRuntime.GOOS, stdRuntime.GOARCH)
	}
	return names[0]
}

func optionalDriverReleaseAssetNameForVersion(driverType string, selectedVersion string) string {
	names := optionalDriverReleaseAssetNamesForVersion(driverType, selectedVersion)
	if len(names) == 0 {
		return optionalDriverReleaseAssetNameForType("", stdRuntime.GOOS, stdRuntime.GOARCH)
	}
	return names[0]
}

func currentDriverReleaseTag() string {
	currentVersion := normalizeVersion(getCurrentVersion())
	if currentVersion == "" || currentVersion == "0.0.0" {
		return ""
	}
	if isDevelopmentDriverReleaseVersion(currentVersion) {
		return driverReleaseDevTag
	}
	return "v" + currentVersion
}

func isDevelopmentDriverReleaseVersion(version string) bool {
	normalized := strings.ToLower(strings.TrimSpace(normalizeVersion(version)))
	if normalized == "" || normalized == "0.0.0" {
		return false
	}
	if strings.HasPrefix(normalized, "dev-") {
		return true
	}
	for _, marker := range []string{"-dev", "-test", "-local", "-snapshot"} {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}

func driverReleaseDownloadURL(tag string, assetName string) string {
	tagName := strings.TrimSpace(tag)
	asset := strings.TrimSpace(assetName)
	if tagName == "" || asset == "" {
		return ""
	}
	return fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", driverReleaseRepo, url.PathEscape(tagName), url.PathEscape(asset))
}

func driverReleaseLatestDownloadURL(assetName string) string {
	asset := strings.TrimSpace(assetName)
	if asset == "" {
		return ""
	}
	return fmt.Sprintf("https://github.com/%s/releases/latest/download/%s", driverReleaseRepo, url.PathEscape(asset))
}

func findReleaseAssetByName(release *githubRelease, assetNames []string) (githubAsset, bool) {
	if release == nil || len(release.Assets) == 0 || len(assetNames) == 0 {
		return githubAsset{}, false
	}
	for _, expected := range assetNames {
		trimmed := strings.TrimSpace(expected)
		if trimmed == "" {
			continue
		}
		for _, asset := range release.Assets {
			if strings.EqualFold(strings.TrimSpace(asset.Name), trimmed) {
				return asset, true
			}
		}
	}
	return githubAsset{}, false
}

func driverReleaseAssetAPIURL(asset githubAsset) string {
	urlText := strings.TrimSpace(asset.URL)
	if urlText != "" {
		name := strings.TrimSpace(asset.Name)
		if name == "" {
			return urlText
		}
		parsed, err := url.Parse(urlText)
		if err != nil {
			return urlText
		}
		parsed.Fragment = name
		return parsed.String()
	}
	urlText = strings.TrimSpace(asset.BrowserDownloadURL)
	if urlText == "" {
		return ""
	}
	return urlText
}

func optionalDriverBundlePlatformDir(goos string) string {
	switch strings.ToLower(strings.TrimSpace(goos)) {
	case "windows":
		return "Windows"
	case "darwin":
		return "MacOS"
	case "linux":
		return "Linux"
	default:
		return "Unknown"
	}
}

func optionalDriverBundleEntryPathsForVersion(driverType string, selectedVersion string) []string {
	platformDir := optionalDriverBundlePlatformDir(stdRuntime.GOOS)
	assetNames := optionalDriverReleaseAssetNamesForVersion(driverType, selectedVersion)
	result := make([]string, 0, len(assetNames))
	seen := make(map[string]struct{}, len(assetNames))
	for _, assetName := range assetNames {
		entry := filepath.ToSlash(filepath.Join(platformDir, assetName))
		if _, ok := seen[entry]; ok {
			continue
		}
		seen[entry] = struct{}{}
		result = append(result, entry)
	}
	return result
}

func optionalDriverBundleEntryPaths(driverType string) []string {
	return optionalDriverBundleEntryPathsForVersion(driverType, "")
}

func optionalDriverBundleEntryPathForVersion(driverType string, selectedVersion string) string {
	paths := optionalDriverBundleEntryPathsForVersion(driverType, selectedVersion)
	if len(paths) == 0 {
		return filepath.ToSlash(filepath.Join(optionalDriverBundlePlatformDir(stdRuntime.GOOS), optionalDriverReleaseAssetNameForVersion(driverType, selectedVersion)))
	}
	return paths[0]
}

func optionalDriverBundleEntryPath(driverType string) string {
	return optionalDriverBundleEntryPathForVersion(driverType, "")
}

func resolveOptionalDriverAssetSize(sizeByAsset map[string]int64, driverType string) int64 {
	if len(sizeByAsset) == 0 {
		return 0
	}
	for _, assetName := range optionalDriverReleaseAssetNames(driverType) {
		sizeBytes := sizeByAsset[assetName]
		if sizeBytes > 0 {
			return sizeBytes
		}
	}
	return 0
}

func resolveOptionalDriverAssetSizeForVersion(sizeByAsset map[string]int64, driverType string, version string) int64 {
	if len(sizeByAsset) == 0 {
		return 0
	}
	for _, assetName := range optionalDriverReleaseAssetNamesForVersion(driverType, version) {
		sizeBytes := sizeByAsset[assetName]
		if sizeBytes > 0 {
			return sizeBytes
		}
	}
	return 0
}

func resolveOptionalDriverBundleDownloadURLs() []string {
	candidates := make([]string, 0, 2)
	seen := make(map[string]struct{}, 2)
	appendURL := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		if _, ok := seen[trimmed]; ok {
			return
		}
		seen[trimmed] = struct{}{}
		candidates = append(candidates, trimmed)
	}

	if tag := currentDriverReleaseTag(); tag != "" {
		if release, err := fetchReleaseByTag(tag); err == nil {
			if asset, ok := findReleaseAssetByName(release, []string{optionalDriverBundleAssetName}); ok {
				appendURL(driverReleaseAssetAPIURL(asset))
			}
		}
		appendURL(driverReleaseDownloadURL(tag, optionalDriverBundleAssetName))
	}
	if release, err := fetchLatestReleaseForDriverAssets(); err == nil {
		if asset, ok := findReleaseAssetByName(release, []string{optionalDriverBundleAssetName}); ok {
			appendURL(driverReleaseAssetAPIURL(asset))
		}
	}
	appendURL(driverReleaseLatestDownloadURL(optionalDriverBundleAssetName))
	return candidates
}

func optionalDriverBundleCacheDir() (string, error) {
	cacheDir := filepath.Join(os.TempDir(), "gonavi-driver-bundle-cache")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return "", err
	}
	return cacheDir, nil
}

func optionalDriverBundleCachePath(bundleURL string) (string, error) {
	cacheDir, err := optionalDriverBundleCacheDir()
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(strings.TrimSpace(bundleURL)))
	return filepath.Join(cacheDir, hex.EncodeToString(sum[:])+".zip"), nil
}

func cleanupOptionalDriverBundleCache(keepPaths ...string) {
	cacheDir, err := optionalDriverBundleCacheDir()
	if err != nil {
		return
	}

	keep := make(map[string]struct{}, len(keepPaths)+4)
	for _, path := range keepPaths {
		if strings.TrimSpace(path) != "" {
			keep[filepath.Clean(path)] = struct{}{}
		}
	}
	optionalDriverBundleDownloadMu.Lock()
	for _, state := range optionalDriverBundleDownloads {
		if state != nil && strings.TrimSpace(state.path) != "" {
			keep[filepath.Clean(state.path)] = struct{}{}
		}
	}
	optionalDriverBundleDownloadMu.Unlock()

	type cacheFile struct {
		path    string
		modTime time.Time
	}
	cacheFiles := make([]cacheFile, 0)
	now := time.Now()
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(cacheDir, entry.Name())
		cleanPath := filepath.Clean(path)
		if _, ok := keep[cleanPath]; ok {
			continue
		}
		info, statErr := entry.Info()
		if statErr != nil {
			continue
		}
		name := strings.ToLower(strings.TrimSpace(entry.Name()))
		if strings.HasSuffix(name, ".tmp") {
			if now.Sub(info.ModTime()) > 24*time.Hour {
				_ = os.Remove(path)
			}
			continue
		}
		if !strings.HasSuffix(name, ".zip") {
			continue
		}
		if now.Sub(info.ModTime()) > optionalDriverBundleCacheMaxAge {
			_ = os.Remove(path)
			continue
		}
		cacheFiles = append(cacheFiles, cacheFile{path: path, modTime: info.ModTime()})
	}
	if len(cacheFiles) <= optionalDriverBundleCacheMaxFiles {
		return
	}
	sort.Slice(cacheFiles, func(i, j int) bool {
		return cacheFiles[i].modTime.After(cacheFiles[j].modTime)
	})
	for _, item := range cacheFiles[optionalDriverBundleCacheMaxFiles:] {
		_ = os.Remove(item.path)
	}
}

func downloadOptionalDriverBundleToCache(bundleURL string, onProgress func(downloaded, total int64)) (string, error) {
	cachePath, err := optionalDriverBundleCachePath(bundleURL)
	if err != nil {
		return "", err
	}
	tempPath := cachePath + fmt.Sprintf(".%d.tmp", time.Now().UnixNano())
	_ = os.Remove(tempPath)
	if _, err := downloadFileWithHashWithTimeout(bundleURL, tempPath, onProgress, optionalDriverBundleDownloadTimeout); err != nil {
		_ = os.Remove(tempPath)
		return "", err
	}
	if err := os.Remove(cachePath); err != nil && !os.IsNotExist(err) {
		_ = os.Remove(tempPath)
		return "", err
	}
	if err := os.Rename(tempPath, cachePath); err != nil {
		_ = os.Remove(tempPath)
		return "", err
	}
	reader, err := zip.OpenReader(cachePath)
	if err != nil {
		_ = os.Remove(cachePath)
		return "", fmt.Errorf("打开驱动总包失败：%w", err)
	}
	if err := reader.Close(); err != nil {
		_ = os.Remove(cachePath)
		return "", fmt.Errorf("关闭驱动总包失败：%w", err)
	}
	cleanupOptionalDriverBundleCache(cachePath)
	return cachePath, nil
}

func acquireOptionalDriverBundlePath(bundleURL string, onProgress func(downloaded, total int64), onWaiting func()) (string, error) {
	trimmedURL := strings.TrimSpace(bundleURL)
	if trimmedURL == "" {
		return "", fmt.Errorf("驱动总包下载地址为空")
	}

	for {
		optionalDriverBundleDownloadMu.Lock()
		state, ok := optionalDriverBundleDownloads[trimmedURL]
		if ok {
			if state.finished {
				path := strings.TrimSpace(state.path)
				err := state.err
				if err == nil && path != "" && fileExists(path) {
					optionalDriverBundleDownloadMu.Unlock()
					return path, nil
				}
				delete(optionalDriverBundleDownloads, trimmedURL)
				optionalDriverBundleDownloadMu.Unlock()
				continue
			}
			done := state.done
			optionalDriverBundleDownloadMu.Unlock()
			if onWaiting != nil {
				onWaiting()
			}
			<-done
			optionalDriverBundleDownloadMu.Lock()
			path := strings.TrimSpace(state.path)
			err := state.err
			if err == nil && path != "" && fileExists(path) {
				optionalDriverBundleDownloadMu.Unlock()
				return path, nil
			}
			if current, exists := optionalDriverBundleDownloads[trimmedURL]; exists && current == state {
				delete(optionalDriverBundleDownloads, trimmedURL)
			}
			optionalDriverBundleDownloadMu.Unlock()
			if err == nil {
				err = fmt.Errorf("驱动总包缓存文件不可用")
			}
			return "", err
		}

		state = &optionalDriverBundleDownloadState{done: make(chan struct{})}
		optionalDriverBundleDownloads[trimmedURL] = state
		optionalDriverBundleDownloadMu.Unlock()

		path, err := downloadOptionalDriverBundleToCache(trimmedURL, onProgress)
		optionalDriverBundleDownloadMu.Lock()
		state.path = path
		state.err = err
		state.finished = true
		if err != nil {
			delete(optionalDriverBundleDownloads, trimmedURL)
		}
		close(state.done)
		optionalDriverBundleDownloadMu.Unlock()

		if err != nil {
			return "", err
		}
		return path, nil
	}
}

func resolveOptionalDriverAgentDownloadURLs(definition driverDefinition, rawURL string, selectedVersion string) []string {
	candidates := make([]string, 0, 3)
	seen := make(map[string]struct{}, 3)
	driverType := normalizeDriverType(definition.Type)
	appendURL := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		if _, ok := seen[trimmed]; ok {
			return
		}
		seen[trimmed] = struct{}{}
		candidates = append(candidates, trimmed)
	}

	restrictToExplicitArtifact := shouldRestrictToExplicitVersionArtifact(definition, selectedVersion)
	appendPublishedURLs := func() {
		if tag := currentDriverReleaseTag(); tag != "" {
			if publishedURL, ok := resolvePublishedDriverDownloadURLForTag(definition, selectedVersion, tag); ok {
				appendURL(publishedURL)
			}
		}
		if publishedURL, ok := resolveLatestPublishedDriverDownloadURLForVersion(definition, selectedVersion); ok {
			appendURL(publishedURL)
		}
	}

	if !restrictToExplicitArtifact && shouldPreferPublishedOptionalDriverDownloads(driverType) {
		appendPublishedURLs()
	}

	if parsed, err := url.Parse(strings.TrimSpace(rawURL)); err == nil {
		switch strings.ToLower(strings.TrimSpace(parsed.Scheme)) {
		case "http", "https":
			appendURL(parsed.String())
		}
	}
	if restrictToExplicitArtifact {
		return candidates
	}

	if !shouldPreferPublishedOptionalDriverDownloads(driverType) {
		appendPublishedURLs()
	}
	return candidates
}

func findExistingOptionalDriverAgentCandidate(definition driverDefinition, targetPath string) (string, bool) {
	driverType := normalizeDriverType(definition.Type)
	targetAbs, _ := filepath.Abs(targetPath)
	candidates := resolveOptionalDriverAgentCandidatePaths(definition)
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		absPath, err := filepath.Abs(candidate)
		if err != nil || absPath == "" {
			continue
		}
		if targetAbs != "" && absPath == targetAbs {
			continue
		}
		info, statErr := os.Stat(absPath)
		if statErr != nil || info.IsDir() {
			continue
		}
		if validateErr := validateOptionalDriverAgentExecutableFunc(driverType, absPath); validateErr != nil {
			continue
		}
		if !isReusableOptionalDriverAgentCandidateRevisionAcceptable(driverType, absPath) {
			continue
		}
		return absPath, true
	}
	return "", false
}

func isReusableOptionalDriverAgentCandidateRevisionAcceptable(driverType string, executablePath string) bool {
	expected := strings.TrimSpace(db.OptionalDriverAgentRevision(driverType))
	if expected == "" {
		return true
	}
	actual, current, err := optionalDriverAgentRevisionCurrent(driverType, executablePath)
	displayName := resolveDriverDisplayName(driverDefinition{Type: driverType})
	if err != nil {
		logger.Warnf("可复用 %s 驱动代理候选版本元数据不可用，仍允许安装：path=%s err=%v；建议在驱动管理中重装", displayName, executablePath, err)
		return true
	}
	if !current {
		actualLabel := strings.TrimSpace(actual)
		if actualLabel == "" {
			actualLabel = "空"
		}
		logger.Warnf("可复用 %s 驱动代理候选 revision 不匹配，仍允许安装：path=%s actual=%s expected=%s；建议在驱动管理中重装", displayName, executablePath, actualLabel, expected)
		return true
	}
	return true
}

func resolveOptionalDriverAgentCandidatePaths(definition driverDefinition) []string {
	driverType := normalizeDriverType(definition.Type)
	names := optionalDriverExecutableBaseNames(driverType)
	assetNames := optionalDriverReleaseAssetNames(driverType)
	pathTypeNames := make([]string, 0, 2)
	seenPathType := make(map[string]struct{}, 2)
	appendPathType := func(typeName string) {
		trimmed := strings.TrimSpace(typeName)
		if trimmed == "" {
			return
		}
		if _, ok := seenPathType[trimmed]; ok {
			return
		}
		seenPathType[trimmed] = struct{}{}
		pathTypeNames = append(pathTypeNames, trimmed)
	}
	appendPathType(optionalDriverPublicTypeName(driverType))

	candidates := make([]string, 0, 12)
	appendPath := func(pathText string) {
		trimmed := strings.TrimSpace(pathText)
		if trimmed != "" {
			candidates = append(candidates, trimmed)
		}
	}

	if exePath, err := os.Executable(); err == nil && strings.TrimSpace(exePath) != "" {
		resolved := exePath
		if evalPath, evalErr := filepath.EvalSymlinks(exePath); evalErr == nil && strings.TrimSpace(evalPath) != "" {
			resolved = evalPath
		}
		exeDir := filepath.Dir(resolved)
		for _, name := range names {
			appendPath(filepath.Join(exeDir, name))
		}
		for _, assetName := range assetNames {
			appendPath(filepath.Join(exeDir, assetName))
		}
		for _, typeName := range pathTypeNames {
			for _, name := range names {
				appendPath(filepath.Join(exeDir, "drivers", typeName, name))
			}
			for _, assetName := range assetNames {
				appendPath(filepath.Join(exeDir, "drivers", typeName, assetName))
			}
		}

		resourcesDir := filepath.Clean(filepath.Join(exeDir, "..", "Resources"))
		for _, typeName := range pathTypeNames {
			for _, name := range names {
				appendPath(filepath.Join(resourcesDir, "drivers", typeName, name))
			}
			for _, assetName := range assetNames {
				appendPath(filepath.Join(resourcesDir, "drivers", typeName, assetName))
			}
		}
	}
	if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
		for _, assetName := range assetNames {
			appendPath(filepath.Join(wd, "dist", assetName))
			appendPath(filepath.Join(wd, assetName))
		}
	}

	unique := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, item := range candidates {
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		unique = append(unique, item)
	}
	return unique
}

func resolveDriverDisplayName(definition driverDefinition) string {
	if strings.TrimSpace(definition.Name) != "" {
		return strings.TrimSpace(definition.Name)
	}
	if strings.TrimSpace(definition.Type) != "" {
		return strings.TrimSpace(definition.Type)
	}
	return "未知"
}

func activateOptionalDriverAgentBinary(driverType string, installPath string, runtimePath string) error {
	source := strings.TrimSpace(installPath)
	target := strings.TrimSpace(runtimePath)
	if source == "" || target == "" {
		return fmt.Errorf("agent path is empty")
	}
	if source == target {
		return nil
	}

	absSource := source
	absTarget := target
	if value, err := filepath.Abs(source); err == nil && strings.TrimSpace(value) != "" {
		absSource = value
	}
	if value, err := filepath.Abs(target); err == nil && strings.TrimSpace(value) != "" {
		absTarget = value
	}
	if strings.EqualFold(absSource, absTarget) {
		return nil
	}
	if err := copyAgentBinary(source, target); err != nil {
		return err
	}
	return copyOptionalDriverSupportFilesFromDirectory(driverType, filepath.Dir(source), filepath.Dir(target))
}

func copyAgentBinary(sourcePath, targetPath string) error {
	src, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer src.Close()

	tempPath := targetPath + ".tmp"
	_ = os.Remove(tempPath)
	dst, err := os.Create(tempPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := dst.Sync(); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if chmodErr := os.Chmod(tempPath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		_ = os.Remove(tempPath)
		return chmodErr
	}
	if err := renameTempFileOverTarget(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if chmodErr := os.Chmod(targetPath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		return chmodErr
	}
	return nil
}

func extractZipFileToPath(file *zip.File, targetPath string) error {
	if file == nil {
		return fmt.Errorf("zip 条目为空")
	}
	src, err := file.Open()
	if err != nil {
		return err
	}
	defer src.Close()
	tempPath := targetPath + ".tmp"
	_ = os.Remove(tempPath)
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}
	dst, err := os.Create(tempPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := dst.Sync(); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if err := renameTempFileOverTarget(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	return nil
}

func copyOptionalDriverSupportFile(sourcePath, targetPath string) error {
	src, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer src.Close()

	tempPath := targetPath + ".tmp"
	_ = os.Remove(tempPath)
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}
	dst, err := os.Create(tempPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := dst.Sync(); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if err := renameTempFileOverTarget(tempPath, targetPath); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	return nil
}

func renameTempFileOverTarget(tempPath, targetPath string) error {
	if err := os.Rename(tempPath, targetPath); err == nil {
		return nil
	} else {
		firstErr := err
		if removeErr := os.Remove(targetPath); removeErr != nil && !os.IsNotExist(removeErr) {
			return firstErr
		}
		if retryErr := os.Rename(tempPath, targetPath); retryErr != nil {
			return retryErr
		}
		return nil
	}
}

func copyOptionalDriverSupportFilesFromDirectory(driverType string, sourceDir string, targetDir string) error {
	names := optionalDriverSupportFileNames(driverType)
	if len(names) == 0 {
		return nil
	}
	sourceRoot := strings.TrimSpace(sourceDir)
	targetRoot := strings.TrimSpace(targetDir)
	if sourceRoot == "" || targetRoot == "" {
		return fmt.Errorf("运行时依赖目录为空")
	}
	for _, name := range names {
		sourcePath := filepath.Join(sourceRoot, name)
		targetPath := filepath.Join(targetRoot, name)
		if err := copyOptionalDriverSupportFile(sourcePath, targetPath); err != nil {
			return fmt.Errorf("复制 %s 失败：%w", name, err)
		}
	}
	return nil
}

func findOptionalDriverSupportFileInZip(files []*zip.File, agentEntryName string, supportName string) *zip.File {
	normalizedAgent := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(agentEntryName), "./"))
	agentDir := filepath.ToSlash(filepath.Dir(normalizedAgent))
	if agentDir == "." {
		agentDir = ""
	}
	candidatePaths := []string{}
	if agentDir != "" {
		candidatePaths = append(candidatePaths, filepath.ToSlash(filepath.Join(agentDir, supportName)))
	}
	candidatePaths = append(candidatePaths, supportName)

	for _, candidate := range candidatePaths {
		for _, file := range files {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			if name == candidate {
				return file
			}
		}
		for _, file := range files {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			if strings.EqualFold(name, candidate) {
				return file
			}
		}
	}
	for _, file := range files {
		name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
		if strings.EqualFold(filepath.Base(name), supportName) {
			return file
		}
	}
	return nil
}

func extractOptionalDriverSupportFilesFromZip(files []*zip.File, driverType string, agentEntryName string, targetDir string) error {
	names := optionalDriverSupportFileNames(driverType)
	if len(names) == 0 {
		return nil
	}
	targetRoot := strings.TrimSpace(targetDir)
	if targetRoot == "" {
		return fmt.Errorf("运行时依赖目标目录为空")
	}
	for _, name := range names {
		entry := findOptionalDriverSupportFileInZip(files, agentEntryName, name)
		if entry == nil {
			return fmt.Errorf("驱动包缺少运行时依赖：%s", name)
		}
		if err := extractZipFileToPath(entry, filepath.Join(targetRoot, name)); err != nil {
			return fmt.Errorf("解压运行时依赖 %s 失败：%w", name, err)
		}
	}
	return nil
}

func scaleProgress(downloaded, total, start, end int64) (int64, int64) {
	if end <= start {
		return end, 100
	}
	if total <= 0 {
		return start, 100
	}
	if downloaded < 0 {
		downloaded = 0
	}
	if downloaded > total {
		downloaded = total
	}
	span := end - start
	return start + ((downloaded * span) / total), 100
}

func preloadOptionalDriverPackageSizes(definitions []driverDefinition) map[string]int64 {
	result := make(map[string]int64)
	if len(definitions) == 0 {
		return result
	}

	needed := make([]string, 0, len(definitions))
	for _, definition := range definitions {
		normalizedType := normalizeDriverType(definition.Type)
		if normalizedType == "" || definition.BuiltIn {
			continue
		}
		if !db.IsOptionalGoDriver(normalizedType) {
			continue
		}
		if !db.IsOptionalGoDriverBuildIncluded(normalizedType) {
			continue
		}
		needed = append(needed, normalizedType)
	}
	if len(needed) == 0 {
		return result
	}

	tag := currentDriverReleaseTag()

	fillFromSizes := func(sizeByAsset map[string]int64, driverTypes []string) []string {
		missing := make([]string, 0, len(driverTypes))
		for _, driverType := range driverTypes {
			sizeBytes := resolveOptionalDriverAssetSize(sizeByAsset, driverType)
			if sizeBytes > 0 {
				result[driverType] = sizeBytes
				continue
			}
			missing = append(missing, driverType)
		}
		return missing
	}

	pending := needed
	if tag != "" {
		if sizeByAsset, _, err := loadReleaseAssetSizesCached("tag:"+tag, func() (*githubRelease, error) {
			return fetchReleaseByTag(tag)
		}); err == nil {
			pending = fillFromSizes(sizeByAsset, pending)
		}
	}
	if len(pending) == 0 {
		return result
	}
	if sizeByAsset, _, err := loadReleaseAssetSizesCached("latest", fetchLatestReleaseForDriverAssets); err == nil {
		_ = fillFromSizes(sizeByAsset, pending)
	}
	return result
}

func loadReleaseAssetSizesCached(cacheKey string, fetch func() (*githubRelease, error)) (map[string]int64, map[string]bool, error) {
	key := strings.TrimSpace(cacheKey)
	if key == "" {
		return nil, nil, fmt.Errorf("缓存 key 为空")
	}

	driverReleaseSizeMu.RLock()
	cached, ok := driverReleaseSizeMap[key]
	driverReleaseSizeMu.RUnlock()
	if ok {
		ttl := driverReleaseAssetSizeCacheTTL
		if strings.TrimSpace(cached.Err) != "" {
			ttl = driverReleaseAssetSizeErrorCacheTTL
		}
		if time.Since(cached.LoadedAt) < ttl {
			if strings.TrimSpace(cached.Err) != "" {
				return nil, nil, errors.New(strings.TrimSpace(cached.Err))
			}
			return cached.SizeByKey, cached.PublishedAssets, nil
		}
	}

	release, err := fetch()
	entry := driverReleaseAssetSizeCacheEntry{
		LoadedAt:        time.Now(),
		SizeByKey:       map[string]int64{},
		PublishedAssets: map[string]bool{},
	}
	if err != nil {
		entry.Err = err.Error()
	} else {
		entry.SizeByKey = buildReleaseAssetSizeMap(release)
		entry.PublishedAssets = buildReleaseAssetNameMap(release)
		if indexSizes, indexErr := fetchDriverBundleAssetSizeIndex(release); indexErr == nil {
			for name, size := range indexSizes {
				trimmedName := strings.TrimSpace(name)
				if trimmedName == "" || size <= 0 {
					continue
				}
				entry.SizeByKey[trimmedName] = size
			}
		}
	}

	driverReleaseSizeMu.Lock()
	driverReleaseSizeMap[key] = entry
	driverReleaseSizeMu.Unlock()

	if err != nil {
		return nil, nil, err
	}
	return entry.SizeByKey, entry.PublishedAssets, nil
}

func readReleaseAssetSizesFromCache(cacheKey string) (map[string]int64, map[string]bool, bool) {
	key := strings.TrimSpace(cacheKey)
	if key == "" {
		return nil, nil, false
	}

	driverReleaseSizeMu.RLock()
	cached, ok := driverReleaseSizeMap[key]
	driverReleaseSizeMu.RUnlock()
	if !ok {
		return nil, nil, false
	}

	ttl := driverReleaseAssetSizeCacheTTL
	if strings.TrimSpace(cached.Err) != "" {
		ttl = driverReleaseAssetSizeErrorCacheTTL
	}
	if time.Since(cached.LoadedAt) >= ttl {
		return nil, nil, false
	}
	if strings.TrimSpace(cached.Err) != "" {
		return nil, nil, false
	}
	return cached.SizeByKey, cached.PublishedAssets, true
}

func buildReleaseAssetSizeMap(release *githubRelease) map[string]int64 {
	sizes := make(map[string]int64)
	if release == nil {
		return sizes
	}
	for _, asset := range release.Assets {
		name := strings.TrimSpace(asset.Name)
		if name == "" || asset.Size <= 0 {
			continue
		}
		sizes[name] = asset.Size
	}
	return sizes
}

func buildReleaseAssetNameMap(release *githubRelease) map[string]bool {
	names := make(map[string]bool)
	if release == nil {
		return names
	}
	for _, asset := range release.Assets {
		name := strings.TrimSpace(asset.Name)
		if name == "" {
			continue
		}
		names[name] = true
	}
	return names
}

func fetchDriverBundleAssetSizeIndex(release *githubRelease) (map[string]int64, error) {
	if release == nil {
		return nil, fmt.Errorf("release 为空")
	}
	indexURL := ""
	for _, asset := range release.Assets {
		if strings.EqualFold(strings.TrimSpace(asset.Name), optionalDriverBundleIndexAssetName) {
			indexURL = strings.TrimSpace(asset.BrowserDownloadURL)
			break
		}
	}
	if indexURL == "" {
		return nil, fmt.Errorf("未找到驱动总包索引资产")
	}

	client := newHTTPClientWithGlobalProxy(driverReleaseAssetSizeProbeTimeout)
	req, err := http.NewRequest(http.MethodGet, indexURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GoNavi-DriverManager")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("拉取驱动总包索引失败：HTTP %d", resp.StatusCode)
	}

	limited := io.LimitReader(resp.Body, driverBundleIndexMaxSize)
	decoder := json.NewDecoder(limited)
	var index driverBundleAssetIndex
	if err := decoder.Decode(&index); err != nil {
		return nil, fmt.Errorf("解析驱动总包索引失败：%w", err)
	}
	if len(index.Assets) == 0 {
		return nil, fmt.Errorf("驱动总包索引为空")
	}
	return index.Assets, nil
}

func fetchLatestReleaseForDriverAssets() (*githubRelease, error) {
	return fetchDriverReleaseByURL(driverReleaseLatestAPIURL)
}

func resolveLatestPublishedDriverDownloadURL(definition driverDefinition) (string, bool) {
	return resolveLatestPublishedDriverDownloadURLForVersion(definition, "")
}

func resolveLatestPublishedDriverDownloadURLForVersion(definition driverDefinition, selectedVersion string) (string, bool) {
	driverType := normalizeDriverType(definition.Type)
	if driverType == "" {
		return "", false
	}
	if shouldUseDuckDBWindowsDynamicLibrary(driverType) {
		if sizeByAsset, publishedAssets, ok := readReleaseAssetSizesFromCache("latest"); ok {
			if publishedAssets[duckDBWindowsDriverZipAssetName] && sizeByAsset[duckDBWindowsDriverZipAssetName] > 0 {
				if release, err := fetchLatestReleaseForDriverAssets(); err == nil {
					if asset, found := findReleaseAssetByName(release, []string{duckDBWindowsDriverZipAssetName}); found {
						return driverReleaseAssetAPIURL(asset), true
					}
				}
				return driverReleaseLatestDownloadURL(duckDBWindowsDriverZipAssetName), true
			}
			return "", false
		}

		sizeByAsset, publishedAssets, err := loadReleaseAssetSizesCached("latest", fetchLatestReleaseForDriverAssets)
		if err != nil {
			return "", false
		}
		if publishedAssets[duckDBWindowsDriverZipAssetName] && sizeByAsset[duckDBWindowsDriverZipAssetName] > 0 {
			if release, relErr := fetchLatestReleaseForDriverAssets(); relErr == nil {
				if asset, found := findReleaseAssetByName(release, []string{duckDBWindowsDriverZipAssetName}); found {
					return driverReleaseAssetAPIURL(asset), true
				}
			}
			return driverReleaseLatestDownloadURL(duckDBWindowsDriverZipAssetName), true
		}
		return "", false
	}

	assetNames := optionalDriverReleaseAssetNamesForVersion(driverType, selectedVersion)
	if len(assetNames) == 0 {
		return "", false
	}

	if sizeByAsset, publishedAssets, ok := readReleaseAssetSizesFromCache("latest"); ok {
		for _, assetName := range assetNames {
			if publishedAssets[assetName] && sizeByAsset[assetName] > 0 {
				if release, err := fetchLatestReleaseForDriverAssets(); err == nil {
					if asset, found := findReleaseAssetByName(release, []string{assetName}); found {
						return driverReleaseAssetAPIURL(asset), true
					}
				}
				return driverReleaseLatestDownloadURL(assetName), true
			}
		}
		return "", false
	}

	sizeByAsset, publishedAssets, err := loadReleaseAssetSizesCached("latest", fetchLatestReleaseForDriverAssets)
	if err != nil {
		return "", false
	}
	for _, assetName := range assetNames {
		if publishedAssets[assetName] && sizeByAsset[assetName] > 0 {
			if release, relErr := fetchLatestReleaseForDriverAssets(); relErr == nil {
				if asset, found := findReleaseAssetByName(release, []string{assetName}); found {
					return driverReleaseAssetAPIURL(asset), true
				}
			}
			return driverReleaseLatestDownloadURL(assetName), true
		}
	}
	return "", false
}

func fetchReleaseByTag(tag string) (*githubRelease, error) {
	tagName := strings.TrimSpace(tag)
	if tagName == "" {
		return nil, fmt.Errorf("Tag 为空")
	}
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/releases/tags/%s", driverReleaseRepo, url.PathEscape(tagName))
	return fetchDriverReleaseByURL(apiURL)
}

func fetchDriverReleaseByURL(apiURL string) (*githubRelease, error) {
	urlText := strings.TrimSpace(apiURL)
	if urlText == "" {
		return nil, fmt.Errorf("API 地址为空")
	}

	client := newHTTPClientWithGlobalProxy(driverReleaseAssetSizeProbeTimeout)
	req, err := http.NewRequest(http.MethodGet, urlText, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GoNavi-DriverManager")
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("拉取 Release 信息失败：HTTP %d", resp.StatusCode)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &release, nil
}

func resolveDriverPackageSizeText(definition driverDefinition, pkg installedDriverPackage, packageMetaExists bool, packageSizeBytesMap map[string]int64) string {
	if definition.BuiltIn {
		return "内置"
	}

	normalizedType := normalizeDriverType(definition.Type)
	if packageMetaExists {
		sizeBytes := readInstalledPackageSizeBytes(pkg)
		if sizeBytes > 0 {
			return formatSizeMB(sizeBytes)
		}
	}
	if sizeBytes, ok := packageSizeBytesMap[normalizedType]; ok && sizeBytes > 0 {
		return formatSizeMB(sizeBytes)
	}

	if !db.IsOptionalGoDriverBuildIncluded(normalizedType) {
		return "待发布"
	}
	return "-"
}

func readInstalledPackageSizeBytes(pkg installedDriverPackage) int64 {
	pathText := strings.TrimSpace(pkg.ExecutablePath)
	if pathText == "" {
		pathText = strings.TrimSpace(pkg.FilePath)
	}
	if pathText == "" {
		return 0
	}
	info, err := os.Stat(pathText)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.Size()
}

func formatSizeMB(sizeBytes int64) string {
	if sizeBytes <= 0 {
		return "-"
	}
	sizeMB := float64(sizeBytes) / (1024 * 1024)
	return fmt.Sprintf("%.2f MB", sizeMB)
}
