package app

import (
	"archive/zip"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestResolveVersionedDriverOptionUsesPublishedMongoV1Release(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	version := "1.17.4"
	assetName := mongoVersionedReleaseAssetName(1)
	seedReleaseAssetSizeCache(t, "tag:v"+version, map[string]int64{
		assetName: 24 << 20,
	})
	chdirTemp(t)

	gotVersion, gotURL, ok := resolveVersionedDriverOption(definition, version, "history")
	if !ok {
		t.Fatal("expected published mongodb v1 option to remain available")
	}
	if gotVersion != version {
		t.Fatalf("expected version %q, got %q", version, gotVersion)
	}

	wantURL := fmt.Sprintf("https://github.com/%s/releases/download/v%s/%s", updateRepo, version, assetName)
	if gotURL != wantURL {
		t.Fatalf("expected published release URL %q, got %q", wantURL, gotURL)
	}
}

func TestDriverVersionSupportRangeForMongoDB(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	if err := validateDriverSelectedVersion(definition, "1.17.4"); err != nil {
		t.Fatalf("expected 1.17.4 to stay supported, got %v", err)
	}
	if err := validateDriverSelectedVersion(definition, "2.5.0"); err != nil {
		t.Fatalf("expected 2.5.0 to stay supported, got %v", err)
	}
	if err := validateDriverSelectedVersion(definition, "1.16.1"); err == nil {
		t.Fatal("expected 1.16.1 to be rejected by MongoDB support range")
	}
}

func TestResolveVersionedDriverOptionSkipsMongoV1WithoutPublishedReleaseOrSourceBuild(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	version := "1.17.4"
	seedReleaseAssetSizeCache(t, "tag:v"+version, map[string]int64{})
	chdirTemp(t)

	_, _, ok = resolveVersionedDriverOption(definition, version, "history")
	if ok {
		t.Fatal("expected unpublished mongodb v1 option to be filtered out when source build is unavailable")
	}
}

func TestResolveVersionedDriverOptionRejectsUnsupportedMongoV1Range(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	seedReleaseAssetSizeCache(t, "tag:v1.16.1", map[string]int64{
		mongoVersionedReleaseAssetName(1): 24 << 20,
	})

	_, _, ok = resolveVersionedDriverOption(definition, "1.16.1", "history")
	if ok {
		t.Fatal("expected MongoDB 1.16.1 to be hidden from the selectable version list")
	}
}

func TestResolveDriverVersionPackageSizeBytesReadsMongoV1VersionedAsset(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	version := "1.17.4"
	assetName := mongoVersionedReleaseAssetName(1)
	const wantSize int64 = 31 << 20
	seedReleaseAssetSizeCache(t, "tag:v"+version, map[string]int64{
		assetName: wantSize,
	})

	got := resolveDriverVersionPackageSizeBytes(definition, driverVersionOptionItem{
		Version: version,
		Source:  "history",
	})
	if got != wantSize {
		t.Fatalf("expected size %d, got %d", wantSize, got)
	}
}

func TestResolveOptionalDriverAgentDownloadURLsDoesNotFallbackForHistoricalVersion(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	explicitURL := fmt.Sprintf("https://github.com/Syngnat/GoNavi/releases/download/v1.17.4/%s", mongoVersionedReleaseAssetName(1))
	urls := resolveOptionalDriverAgentDownloadURLs(
		definition,
		explicitURL,
		"1.17.4",
	)
	if len(urls) != 1 {
		t.Fatalf("expected only explicit historical URL, got %d candidates: %v", len(urls), urls)
	}
	if urls[0] != explicitURL {
		t.Fatalf("unexpected historical URL candidate: %v", urls)
	}
}

func TestResolveOptionalDriverAgentDownloadURLsSkipsBundleOnlyDamengAsset(t *testing.T) {
	definition, ok := resolveDriverDefinition("dameng")
	if !ok {
		t.Fatal("expected dameng driver definition")
	}

	version := normalizeVersion(definition.PinnedVersion)
	assetName := optionalDriverReleaseAssetNameForVersion("dameng", version)
	seedReleaseAssetCacheEntry(t, "tag:v"+version, map[string]int64{
		assetName: 23 << 20,
	}, nil)
	seedReleaseAssetCacheEntry(t, "latest", map[string]int64{
		assetName: 23 << 20,
	}, nil)

	urls := resolveOptionalDriverAgentDownloadURLs(definition, "builtin://activate/dameng", version)
	if len(urls) != 0 {
		t.Fatalf("expected bundle-only dameng install to skip direct asset URLs, got %v", urls)
	}
}

func TestDownloadDriverPackageRejectsUnsupportedMongoVersion(t *testing.T) {
	app := &App{}

	result := app.DownloadDriverPackage("mongodb", "1.16.1", "builtin://activate/mongodb?channel=history&version=1.16.1", t.TempDir())
	if result.Success {
		t.Fatal("expected unsupported MongoDB 1.16.1 install to be rejected")
	}
	if !strings.Contains(result.Message, "仅支持 1.17.x 和 2.x") {
		t.Fatalf("expected support-range error, got %q", result.Message)
	}
}

func TestResolveRecentDriverVersionMetasIncludesHistoricalTDengineVersionsFromCache(t *testing.T) {
	seedGoModuleVersionCache(t, "github.com/taosdata/driver-go/v3", []string{
		"3.8.0",
		"3.7.8",
		"3.7.7",
		"3.7.6",
		"3.7.5",
		"3.7.4",
		"3.7.3",
		"3.7.2",
		"3.7.1",
		"3.7.0",
		"3.6.0",
		"3.5.8",
		"3.5.7",
		"3.5.6",
		"3.5.5",
		"3.5.4",
		"3.5.3",
		"3.5.2",
		"3.5.1",
		"3.5.0",
		"3.3.1",
		"3.1.0",
		"3.0.4",
		"3.0.3",
		"3.0.2",
		"3.0.1",
		"3.0.0",
	})

	metas := resolveRecentDriverVersionMetas("tdengine", driverRecentVersionLimit)
	versions := make([]string, 0, len(metas))
	for _, meta := range metas {
		versions = append(versions, meta.Version)
	}

	if !containsVersion(versions, "3.5.8") {
		t.Fatalf("expected tdengine historical version 3.5.8 to remain selectable, got %v", versions)
	}
	if !containsVersion(versions, "3.3.1") {
		t.Fatalf("expected tdengine historical version 3.3.1 to remain selectable, got %v", versions)
	}
}

func TestResolveRecentDriverVersionMetasFallsBackToHistoricalTDengineMatrix(t *testing.T) {
	driverModuleVersionMu.Lock()
	original := driverModuleVersionMap
	driverModuleVersionMap = map[string]goModuleVersionListCacheEntry{}
	driverModuleVersionMu.Unlock()
	t.Cleanup(func() {
		driverModuleVersionMu.Lock()
		driverModuleVersionMap = original
		driverModuleVersionMu.Unlock()
	})

	metas := resolveRecentDriverVersionMetas("tdengine", driverRecentVersionLimit)
	versions := make([]string, 0, len(metas))
	for _, meta := range metas {
		versions = append(versions, meta.Version)
	}

	if !containsVersion(versions, "3.5.8") {
		t.Fatalf("expected tdengine fallback list to include 3.5.8, got %v", versions)
	}
	if !containsVersion(versions, "3.3.1") {
		t.Fatalf("expected tdengine fallback list to include 3.3.1, got %v", versions)
	}
}

func TestShouldForceSourceBuildForResolvedDownload(t *testing.T) {
	if !shouldForceSourceBuildForResolvedDownload("mongodb", "1.17.4", "builtin://activate/mongodb?channel=history&version=1.17.4") {
		t.Fatal("expected mongodb v1 builtin install to keep source build mode")
	}

	explicitURL := fmt.Sprintf("https://github.com/%s/releases/download/v1.17.4/%s", updateRepo, mongoVersionedReleaseAssetName(1))
	if shouldForceSourceBuildForResolvedDownload("mongodb", "1.17.4", explicitURL) {
		t.Fatal("expected mongodb v1 published asset install to skip forced source build")
	}

	if shouldForceSourceBuildForResolvedDownload("mongodb", "2.5.0", "builtin://activate/mongodb?channel=latest&version=2.5.0") {
		t.Fatal("expected mongodb v2 install not to force source build")
	}
}

func TestInstallOptionalDriverAgentFromLocalPathSupportsMongoV1DirectoryImport(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	packageRoot := t.TempDir()
	platformDir := filepath.Join(packageRoot, optionalDriverBundlePlatformDir(runtime.GOOS))
	if err := os.MkdirAll(platformDir, 0o755); err != nil {
		t.Fatalf("mkdir package dir failed: %v", err)
	}

	assetName := mongoVersionedReleaseAssetName(1)
	writeSelfExecutable(t, filepath.Join(platformDir, assetName))

	installRoot := filepath.Join(t.TempDir(), "drivers")
	meta, err := installOptionalDriverAgentFromLocalPath(definition, packageRoot, installRoot, "1.17.4")
	if err != nil {
		t.Fatalf("expected mongodb v1 directory import to succeed, got %v", err)
	}
	if meta.Version != "1.17.4" {
		t.Fatalf("expected imported version to stay 1.17.4, got %q", meta.Version)
	}
	if filepath.Base(meta.FilePath) != assetName {
		t.Fatalf("expected source file %q, got %q", assetName, meta.FilePath)
	}
	if !strings.Contains(meta.DownloadURL, assetName) {
		t.Fatalf("expected download source to reference %q, got %q", assetName, meta.DownloadURL)
	}
	if _, err := os.Stat(meta.ExecutablePath); err != nil {
		t.Fatalf("expected imported executable to exist, got %v", err)
	}
}

func TestInstallOptionalDriverAgentFromLocalPathSupportsMongoV1ZipImport(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	assetName := mongoVersionedReleaseAssetName(1)
	zipPath := filepath.Join(t.TempDir(), "mongodb-v1.zip")
	writeZipWithSelfExecutable(t, zipPath, filepath.ToSlash(filepath.Join(optionalDriverBundlePlatformDir(runtime.GOOS), assetName)))

	installRoot := filepath.Join(t.TempDir(), "drivers")
	meta, err := installOptionalDriverAgentFromLocalPath(definition, zipPath, installRoot, "1.17.4")
	if err != nil {
		t.Fatalf("expected mongodb v1 zip import to succeed, got %v", err)
	}
	if meta.Version != "1.17.4" {
		t.Fatalf("expected imported version to stay 1.17.4, got %q", meta.Version)
	}
	if !strings.Contains(meta.DownloadURL, assetName) {
		t.Fatalf("expected zip download source to reference %q, got %q", assetName, meta.DownloadURL)
	}
	if _, err := os.Stat(meta.ExecutablePath); err != nil {
		t.Fatalf("expected imported executable to exist, got %v", err)
	}
}

func seedReleaseAssetSizeCache(t *testing.T, cacheKey string, sizeByKey map[string]int64) {
	t.Helper()

	seedReleaseAssetCacheEntry(t, cacheKey, sizeByKey, sizeByKey)
}

func seedReleaseAssetCacheEntry(t *testing.T, cacheKey string, sizeByKey map[string]int64, publishedAssets map[string]int64) {
	t.Helper()

	driverReleaseSizeMu.Lock()
	original := cloneReleaseAssetSizeCache(driverReleaseSizeMap)
	driverReleaseSizeMap[cacheKey] = driverReleaseAssetSizeCacheEntry{
		LoadedAt:        time.Now(),
		SizeByKey:       cloneInt64Map(sizeByKey),
		PublishedAssets: cloneBoolMapFromSizes(publishedAssets),
	}
	driverReleaseSizeMu.Unlock()

	t.Cleanup(func() {
		driverReleaseSizeMu.Lock()
		driverReleaseSizeMap = original
		driverReleaseSizeMu.Unlock()
	})
}

func cloneReleaseAssetSizeCache(src map[string]driverReleaseAssetSizeCacheEntry) map[string]driverReleaseAssetSizeCacheEntry {
	cloned := make(map[string]driverReleaseAssetSizeCacheEntry, len(src))
	for key, value := range src {
		cloned[key] = driverReleaseAssetSizeCacheEntry{
			LoadedAt:        value.LoadedAt,
			SizeByKey:       cloneInt64Map(value.SizeByKey),
			PublishedAssets: cloneBoolMap(value.PublishedAssets),
			Err:             value.Err,
		}
	}
	return cloned
}

func cloneBoolMap(src map[string]bool) map[string]bool {
	if len(src) == 0 {
		return map[string]bool{}
	}
	cloned := make(map[string]bool, len(src))
	for key, value := range src {
		cloned[key] = value
	}
	return cloned
}

func cloneBoolMapFromSizes(src map[string]int64) map[string]bool {
	if len(src) == 0 {
		return map[string]bool{}
	}
	cloned := make(map[string]bool, len(src))
	for key := range src {
		cloned[key] = true
	}
	return cloned
}

func cloneInt64Map(src map[string]int64) map[string]int64 {
	if len(src) == 0 {
		return map[string]int64{}
	}
	cloned := make(map[string]int64, len(src))
	for key, value := range src {
		cloned[key] = value
	}
	return cloned
}

func seedGoModuleVersionCache(t *testing.T, modulePath string, versions []string) {
	t.Helper()

	driverModuleVersionMu.Lock()
	original := make(map[string]goModuleVersionListCacheEntry, len(driverModuleVersionMap))
	for key, value := range driverModuleVersionMap {
		original[key] = goModuleVersionListCacheEntry{
			LoadedAt: value.LoadedAt,
			Versions: append([]goModuleVersionMeta(nil), value.Versions...),
			Err:      value.Err,
		}
	}
	driverModuleVersionMap[modulePath] = goModuleVersionListCacheEntry{
		LoadedAt: time.Now(),
		Versions: mapVersionsToMetas(versions),
	}
	driverModuleVersionMu.Unlock()

	t.Cleanup(func() {
		driverModuleVersionMu.Lock()
		driverModuleVersionMap = original
		driverModuleVersionMu.Unlock()
	})
}

func mapVersionsToMetas(versions []string) []goModuleVersionMeta {
	result := make([]goModuleVersionMeta, 0, len(versions))
	for _, version := range versions {
		result = append(result, goModuleVersionMeta{Version: version})
	}
	return result
}

func containsVersion(versions []string, target string) bool {
	for _, version := range versions {
		if version == target {
			return true
		}
	}
	return false
}

func chdirTemp(t *testing.T) {
	t.Helper()

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd failed: %v", err)
	}
	tempDir := t.TempDir()
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("chdir temp failed: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(wd); err != nil {
			t.Fatalf("restore cwd failed: %v", err)
		}
	})
}

func mongoVersionedReleaseAssetName(major int) string {
	name := fmt.Sprintf("mongodb-driver-agent-v%d-%s-%s", major, runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func writeSelfExecutable(t *testing.T, targetPath string) {
	t.Helper()

	selfPath, err := os.Executable()
	if err != nil {
		t.Fatalf("executable path failed: %v", err)
	}
	content, err := os.ReadFile(selfPath)
	if err != nil {
		t.Fatalf("read self executable failed: %v", err)
	}
	if err := os.WriteFile(targetPath, content, 0o755); err != nil {
		t.Fatalf("write executable failed: %v", err)
	}
}

func writeZipWithSelfExecutable(t *testing.T, zipPath string, entryName string) {
	t.Helper()

	selfPath, err := os.Executable()
	if err != nil {
		t.Fatalf("executable path failed: %v", err)
	}
	content, err := os.ReadFile(selfPath)
	if err != nil {
		t.Fatalf("read self executable failed: %v", err)
	}

	file, err := os.Create(zipPath)
	if err != nil {
		t.Fatalf("create zip failed: %v", err)
	}
	defer file.Close()

	writer := zip.NewWriter(file)
	entry, err := writer.Create(entryName)
	if err != nil {
		t.Fatalf("create zip entry failed: %v", err)
	}
	if _, err := entry.Write(content); err != nil {
		t.Fatalf("write zip entry failed: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zip writer failed: %v", err)
	}
}
