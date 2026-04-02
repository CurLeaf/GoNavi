package app

import (
	"fmt"
	"os"
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

func seedReleaseAssetSizeCache(t *testing.T, cacheKey string, sizeByKey map[string]int64) {
	t.Helper()

	driverReleaseSizeMu.Lock()
	original := cloneReleaseAssetSizeCache(driverReleaseSizeMap)
	driverReleaseSizeMap[cacheKey] = driverReleaseAssetSizeCacheEntry{
		LoadedAt:  time.Now(),
		SizeByKey: cloneInt64Map(sizeByKey),
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
			LoadedAt:  value.LoadedAt,
			SizeByKey: cloneInt64Map(value.SizeByKey),
			Err:       value.Err,
		}
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
