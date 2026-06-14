package app

import (
	"archive/zip"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"GoNavi-Wails/internal/db"
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

	wantURL := fmt.Sprintf("https://github.com/%s/releases/download/v%s/%s", driverReleaseRepo, version, assetName)
	if gotURL != wantURL {
		t.Fatalf("expected published release URL %q, got %q", wantURL, gotURL)
	}
}

func TestMongoDBDefaultDriverVersionUsesLegacyCompatibleLine(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	if definition.PinnedVersion != "1.17.9" {
		t.Fatalf("expected MongoDB default driver version 1.17.9, got %q", definition.PinnedVersion)
	}
	if got := resolveDriverInstallVersion("", definition.DefaultDownloadURL, definition); got != "1.17.9" {
		t.Fatalf("expected builtin MongoDB install to resolve version 1.17.9, got %q", got)
	}
}

func TestCurrentDriverReleaseTagUsesDevLatestForDevBuild(t *testing.T) {
	originalVersion := AppVersion
	AppVersion = "dev-abc1234"
	t.Cleanup(func() {
		AppVersion = originalVersion
	})

	if got := currentDriverReleaseTag(); got != driverReleaseDevTag {
		t.Fatalf("expected dev driver release tag %q, got %q", driverReleaseDevTag, got)
	}
}

func TestCurrentDriverReleaseTagUsesDevLatestForLocalTestBuild(t *testing.T) {
	originalVersion := AppVersion
	t.Cleanup(func() {
		AppVersion = originalVersion
	})

	for _, version := range []string{"0.0.1-test", "0.7.9-dev", "0.7.9-local", "0.7.9-SNAPSHOT"} {
		AppVersion = version
		if got := currentDriverReleaseTag(); got != driverReleaseDevTag {
			t.Fatalf("expected %s to use dev driver release tag %q, got %q", version, driverReleaseDevTag, got)
		}
	}
}

func TestCurrentDriverReleaseTagUsesVersionedReleaseForStableBuild(t *testing.T) {
	originalVersion := AppVersion
	AppVersion = "0.7.9"
	t.Cleanup(func() {
		AppVersion = originalVersion
	})

	if got := currentDriverReleaseTag(); got != "v0.7.9" {
		t.Fatalf("expected stable driver release tag v0.7.9, got %q", got)
	}
}

func TestResolveOptionalDriverBundleDownloadURLsUsesDriverReleaseRepo(t *testing.T) {
	originalVersion := AppVersion
	AppVersion = "0.7.4"
	t.Cleanup(func() {
		AppVersion = originalVersion
	})

	urls := resolveOptionalDriverBundleDownloadURLs()
	wantTagged := driverReleaseDownloadURL("v0.7.4", optionalDriverBundleAssetName)
	wantLatest := driverReleaseLatestDownloadURL(optionalDriverBundleAssetName)
	if len(urls) < 2 {
		t.Fatalf("expected at least tagged and latest bundle URLs, got %v", urls)
	}
	foundTagged := false
	foundLatest := false
	for _, candidate := range urls {
		if candidate == wantTagged {
			foundTagged = true
		}
		if candidate == wantLatest {
			foundLatest = true
		}
	}
	if !foundTagged || !foundLatest {
		t.Fatalf("expected bundle URLs to include tagged=%q and latest=%q, got %v", wantTagged, wantLatest, urls)
	}
}

func TestDriverReleaseAssetAPIURLUsesReleaseAssetEndpoint(t *testing.T) {
	asset := githubAsset{
		Name:               "kingbase-driver-agent-darwin-arm64",
		BrowserDownloadURL: "https://github.com/Syngnat/GoNavi-DriverAgents/releases/download/dev-latest/kingbase-driver-agent-darwin-arm64",
		URL:                "https://api.github.com/repos/Syngnat/GoNavi-DriverAgents/releases/assets/123456",
		Size:               18 << 20,
	}
	if got := driverReleaseAssetAPIURL(asset); got != "https://api.github.com/repos/Syngnat/GoNavi-DriverAgents/releases/assets/123456#kingbase-driver-agent-darwin-arm64" {
		t.Fatalf("expected release asset API URL, got %q", got)
	}
}

func TestOptionalDriverDownloadZipURLAcceptsAssetAPIFragment(t *testing.T) {
	urlText := "https://api.github.com/repos/Syngnat/GoNavi-DriverAgents/releases/assets/123456#duckdb-driver.zip"
	if !isOptionalDriverDownloadZipURL(urlText) {
		t.Fatalf("expected asset API URL with zip fragment to be treated as zip download: %q", urlText)
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

	explicitURL := driverReleaseDownloadURL("v1.17.4", mongoVersionedReleaseAssetName(1))
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

func TestResolveOptionalDriverAgentDownloadURLsUsesMongoV1AssetForCompatibleDefault(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	originalVersion := AppVersion
	AppVersion = "0.7.9"
	t.Cleanup(func() {
		AppVersion = originalVersion
	})

	assetName := mongoVersionedReleaseAssetName(1)
	seedReleaseAssetSizeCache(t, "tag:v0.7.9", map[string]int64{
		assetName: 24 << 20,
	})
	seedReleaseAssetSizeCache(t, "latest", map[string]int64{})

	urls := resolveOptionalDriverAgentDownloadURLs(
		definition,
		"builtin://activate/mongodb",
		"1.17.9",
	)
	want := driverReleaseDownloadURL("v0.7.9", assetName)
	for _, got := range urls {
		if got == want {
			return
		}
	}
	t.Fatalf("expected MongoDB v1 release asset %q in candidates, got %v", want, urls)
}

func TestResolveOptionalDriverAgentDownloadURLsDoesNotUseMongoV2BaseForCompatibleDefault(t *testing.T) {
	definition, ok := resolveDriverDefinition("mongodb")
	if !ok {
		t.Fatal("expected mongodb driver definition")
	}

	originalVersion := AppVersion
	AppVersion = "0.7.9"
	t.Cleanup(func() {
		AppVersion = originalVersion
	})

	baseAssetName := optionalDriverReleaseAssetNameForType("mongodb", runtime.GOOS, runtime.GOARCH)
	seedReleaseAssetSizeCache(t, "tag:v0.7.9", map[string]int64{
		baseAssetName: 24 << 20,
	})
	seedReleaseAssetSizeCache(t, "latest", map[string]int64{
		baseAssetName: 24 << 20,
	})

	urls := resolveOptionalDriverAgentDownloadURLs(
		definition,
		"builtin://activate/mongodb",
		"1.17.9",
	)
	for _, got := range urls {
		if strings.Contains(got, baseAssetName) {
			t.Fatalf("expected MongoDB v1 install not to use ambiguous base asset %q, got %v", baseAssetName, urls)
		}
	}
}

func TestMongoDBVersionedAssetNamesDoNotFallbackToBaseForV1(t *testing.T) {
	v1AssetName := mongoVersionedReleaseAssetName(1)
	baseAssetName := optionalDriverReleaseAssetNameForType("mongodb", runtime.GOOS, runtime.GOARCH)

	v1Names := optionalDriverReleaseAssetNamesForVersion("mongodb", "1.17.9")
	if len(v1Names) != 1 || v1Names[0] != v1AssetName {
		t.Fatalf("expected MongoDB v1 to use only %q, got %v", v1AssetName, v1Names)
	}
	for _, name := range v1Names {
		if name == baseAssetName {
			t.Fatalf("MongoDB v1 must not fallback to ambiguous base asset %q", baseAssetName)
		}
	}

	v2Names := optionalDriverReleaseAssetNamesForVersion("mongodb", "2.5.0")
	if len(v2Names) < 2 || v2Names[0] != mongoVersionedReleaseAssetName(2) || v2Names[1] != baseAssetName {
		t.Fatalf("expected MongoDB v2 to prefer versioned asset then base compatibility asset, got %v", v2Names)
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

func TestShouldUseOptionalDriverBundleFallbackSkipsWhenDirectAssetExists(t *testing.T) {
	if shouldUseOptionalDriverBundleFallback("sqlserver", false, 1) {
		t.Fatal("expected published single-file driver asset to avoid 497MB bundle fallback")
	}
}

func TestShouldUseOptionalDriverBundleFallbackKeepsBundleWhenDirectAssetMissing(t *testing.T) {
	if !shouldUseOptionalDriverBundleFallback("dameng", false, 0) {
		t.Fatal("expected missing single-file driver asset to keep bundle fallback")
	}
	if shouldUseOptionalDriverBundleFallback("dameng", true, 0) {
		t.Fatal("expected explicit version artifact installs to skip bundle fallback")
	}
}

func TestFormatOptionalDriverAttemptErrorRemovesDuplicatedSourcePrefix(t *testing.T) {
	source := "https://github.com/Syngnat/GoNavi-DriverAgents/releases/download/dev-latest/kingbase-driver-agent-darwin-arm64"
	err := fmt.Errorf("%s: kingbase 驱动代理 revision 不匹配（已安装：src-old，当前需要：src-new），请安装当前版本对应的 driver-agent", source)

	got := formatOptionalDriverAttemptError(source, err)
	if strings.Count(got, source) != 1 {
		t.Fatalf("expected source to appear once, got %q", got)
	}
	if !strings.Contains(got, "kingbase 驱动代理 revision 不匹配") {
		t.Fatalf("expected revision mismatch detail, got %q", got)
	}
}

func TestAppendOptionalDriverAttemptErrorDeduplicatesIdenticalEntries(t *testing.T) {
	source := "https://github.com/Syngnat/GoNavi-DriverAgents/releases/latest/download/GoNavi-DriverAgents.zip#MacOS/kingbase-driver-agent-darwin-arm64"
	err := fmt.Errorf("kingbase 驱动代理 revision 不匹配（已安装：src-old，当前需要：src-new），请安装当前版本对应的 driver-agent")

	entries := appendOptionalDriverAttemptError(nil, source, err)
	entries = appendOptionalDriverAttemptError(entries, source, err)
	if len(entries) != 1 {
		t.Fatalf("expected duplicate driver attempt error to be collapsed, got %d entries: %v", len(entries), entries)
	}
}

func TestResolveDriverInstallVersionUsesPinnedVersionForBuiltinActivateURL(t *testing.T) {
	definition, ok := resolveDriverDefinition("sqlserver")
	if !ok {
		t.Fatal("expected sqlserver driver definition")
	}
	if normalizeVersion(definition.PinnedVersion) == "" {
		t.Fatal("expected sqlserver default definition to include builtin manifest pinned version")
	}

	got := resolveDriverInstallVersion("", "builtin://activate/sqlserver", definition)
	want := normalizeVersion(definition.PinnedVersion)
	if got != want {
		t.Fatalf("expected builtin activate URL to fall back to pinned version %q, got %q", want, got)
	}
}

func TestBuiltinActivatePinnedVersionDoesNotRestrictBundleFallback(t *testing.T) {
	definition, ok := resolveDriverDefinition("sqlserver")
	if !ok {
		t.Fatal("expected sqlserver driver definition")
	}

	selectedVersion := resolveDriverInstallVersion("", "builtin://activate/sqlserver", definition)
	if shouldRestrictToExplicitVersionArtifact(definition, selectedVersion) {
		t.Fatalf("expected builtin activate default version %q not to restrict bundle fallback", selectedVersion)
	}
}

func TestIRISDriverDefinitionUsesOptionalAgent(t *testing.T) {
	definition, ok := resolveDriverDefinition("iris")
	if !ok {
		t.Fatal("expected iris driver definition")
	}
	if definition.Name != "InterSystems IRIS" {
		t.Fatalf("unexpected iris driver name: %q", definition.Name)
	}
	if driverGoModulePathMap["iris"] != "github.com/caretdev/go-irisnative" {
		t.Fatalf("unexpected iris go module path: %q", driverGoModulePathMap["iris"])
	}
	if definition.PinnedVersion != "0.2.1" {
		t.Fatalf("unexpected iris definition pinned version: %q", definition.PinnedVersion)
	}
	if definition.DefaultDownloadURL != "builtin://activate/iris" {
		t.Fatalf("unexpected iris default download URL: %q", definition.DefaultDownloadURL)
	}
	if latestDriverVersionMap["iris"] != "0.2.1" {
		t.Fatalf("unexpected iris pinned version: %q", latestDriverVersionMap["iris"])
	}

	tags, err := optionalDriverBuildTags("iris", "")
	if err != nil {
		t.Fatalf("resolve iris build tags failed: %v", err)
	}
	if tags != "gonavi_iris_driver" {
		t.Fatalf("unexpected iris build tag: %q", tags)
	}
}

func TestElasticsearchDriverDefinitionUsesOptionalAgent(t *testing.T) {
	definition, ok := resolveDriverDefinition("elasticsearch")
	if !ok {
		t.Fatal("expected elasticsearch driver definition")
	}
	if definition.Name != "Elasticsearch" {
		t.Fatalf("unexpected elasticsearch driver name: %q", definition.Name)
	}
	if definition.BuiltIn {
		t.Fatal("expected elasticsearch to be an optional driver agent")
	}
	if driverGoModulePathMap["elasticsearch"] != "github.com/elastic/go-elasticsearch/v8" {
		t.Fatalf("unexpected elasticsearch go module path: %q", driverGoModulePathMap["elasticsearch"])
	}
	if definition.PinnedVersion != "8.19.6" {
		t.Fatalf("unexpected elasticsearch definition pinned version: %q", definition.PinnedVersion)
	}
	if definition.DefaultDownloadURL != "builtin://activate/elasticsearch" {
		t.Fatalf("unexpected elasticsearch default download URL: %q", definition.DefaultDownloadURL)
	}
	if latestDriverVersionMap["elasticsearch"] != "8.19.6" {
		t.Fatalf("unexpected elasticsearch pinned version: %q", latestDriverVersionMap["elasticsearch"])
	}

	tags, err := optionalDriverBuildTags("elasticsearch", "")
	if err != nil {
		t.Fatalf("resolve elasticsearch build tags failed: %v", err)
	}
	if tags != "gonavi_elasticsearch_driver" {
		t.Fatalf("unexpected elasticsearch build tag: %q", tags)
	}
}

func TestIoTDBDriverDefinitionUsesOptionalAgent(t *testing.T) {
	definition, ok := resolveDriverDefinition("iotdb")
	if !ok {
		t.Fatal("expected iotdb driver definition")
	}
	if definition.Name != "Apache IoTDB" {
		t.Fatalf("unexpected iotdb driver name: %q", definition.Name)
	}
	if definition.BuiltIn {
		t.Fatal("expected iotdb to be an optional driver agent")
	}
	if driverGoModulePathMap["iotdb"] != "github.com/apache/iotdb-client-go" {
		t.Fatalf("unexpected iotdb go module path: %q", driverGoModulePathMap["iotdb"])
	}
	if definition.PinnedVersion != "1.3.7" {
		t.Fatalf("unexpected iotdb definition pinned version: %q", definition.PinnedVersion)
	}
	if definition.DefaultDownloadURL != "builtin://activate/iotdb" {
		t.Fatalf("unexpected iotdb default download URL: %q", definition.DefaultDownloadURL)
	}
	if latestDriverVersionMap["iotdb"] != "1.3.7" {
		t.Fatalf("unexpected iotdb pinned version: %q", latestDriverVersionMap["iotdb"])
	}

	tags, err := optionalDriverBuildTags("iotdb", "")
	if err != nil {
		t.Fatalf("resolve iotdb build tags failed: %v", err)
	}
	if tags != "gonavi_iotdb_driver" {
		t.Fatalf("unexpected iotdb build tag: %q", tags)
	}
}

func TestKafkaDriverDefinitionIsBuiltIn(t *testing.T) {
	definition, ok := resolveDriverDefinition("apache-kafka")
	if !ok {
		t.Fatal("expected kafka driver definition")
	}
	if definition.Name != "Kafka" {
		t.Fatalf("unexpected kafka driver name: %q", definition.Name)
	}
	if !definition.BuiltIn {
		t.Fatal("expected kafka to be a built-in driver")
	}
	if definition.PinnedVersion != "" || definition.DefaultDownloadURL != "" {
		t.Fatalf("expected kafka builtin definition to omit optional-agent metadata: %#v", definition)
	}
}

func TestMQTTDriverDefinitionIsBuiltIn(t *testing.T) {
	definition, ok := resolveDriverDefinition("mqtts")
	if !ok {
		t.Fatal("expected mqtt driver definition")
	}
	if definition.Name != "MQTT" {
		t.Fatalf("unexpected mqtt driver name: %q", definition.Name)
	}
	if !definition.BuiltIn {
		t.Fatal("expected mqtt to be a built-in driver")
	}
	if definition.PinnedVersion != "" || definition.DefaultDownloadURL != "" {
		t.Fatalf("expected mqtt builtin definition to omit optional-agent metadata: %#v", definition)
	}
}

func TestRabbitMQDriverDefinitionIsBuiltIn(t *testing.T) {
	definition, ok := resolveDriverDefinition("rabbit-mq")
	if !ok {
		t.Fatal("expected rabbitmq driver definition")
	}
	if definition.Name != "RabbitMQ" {
		t.Fatalf("unexpected rabbitmq driver name: %q", definition.Name)
	}
	if !definition.BuiltIn {
		t.Fatal("expected rabbitmq to be a built-in driver")
	}
	if definition.PinnedVersion != "" || definition.DefaultDownloadURL != "" {
		t.Fatalf("expected rabbitmq builtin definition to omit optional-agent metadata: %#v", definition)
	}
}

func TestGoldenDBDriverDefinitionIsBuiltIn(t *testing.T) {
	definition, ok := resolveDriverDefinition("greatdb")
	if !ok {
		t.Fatal("expected goldendb driver definition")
	}
	if definition.Name != "GoldenDB" {
		t.Fatalf("unexpected goldendb driver name: %q", definition.Name)
	}
	if !definition.BuiltIn {
		t.Fatal("expected goldendb to be a built-in driver")
	}
	if definition.PinnedVersion != "" || definition.DefaultDownloadURL != "" {
		t.Fatalf("expected goldendb builtin definition to omit optional metadata: %#v", definition)
	}
	if latestDriverVersionMap["goldendb"] != "1.9.3" {
		t.Fatalf("unexpected goldendb pinned version: %q", latestDriverVersionMap["goldendb"])
	}
	if driverGoModulePathMap["goldendb"] != "github.com/go-sql-driver/mysql" {
		t.Fatalf("unexpected goldendb go module path: %q", driverGoModulePathMap["goldendb"])
	}
}

func TestGaussDBDriverDefinitionUsesOptionalAgent(t *testing.T) {
	definition, ok := resolveDriverDefinition("gaussdb")
	if !ok {
		t.Fatal("expected gaussdb driver definition")
	}
	if definition.Name != "GaussDB" {
		t.Fatalf("unexpected gaussdb driver name: %q", definition.Name)
	}
	if definition.BuiltIn {
		t.Fatal("expected gaussdb to be an optional driver agent")
	}
	if driverGoModulePathMap["gaussdb"] != "github.com/HuaweiCloudDeveloper/gaussdb-go" {
		t.Fatalf("unexpected gaussdb go module path: %q", driverGoModulePathMap["gaussdb"])
	}
	if definition.PinnedVersion != "v1.0.0-rc1" {
		t.Fatalf("unexpected gaussdb definition pinned version: %q", definition.PinnedVersion)
	}
	if definition.DefaultDownloadURL != "builtin://activate/gaussdb" {
		t.Fatalf("unexpected gaussdb default download URL: %q", definition.DefaultDownloadURL)
	}
	if latestDriverVersionMap["gaussdb"] != "v1.0.0-rc1" {
		t.Fatalf("unexpected gaussdb pinned version: %q", latestDriverVersionMap["gaussdb"])
	}

	tags, err := optionalDriverBuildTags("gaussdb", "")
	if err != nil {
		t.Fatalf("resolve gaussdb build tags failed: %v", err)
	}
	if tags != "gonavi_gaussdb_driver" {
		t.Fatalf("unexpected gaussdb build tag: %q", tags)
	}
}

func TestBuildOptionalDriverInstallPlanMessagePrefersDirectThenBundle(t *testing.T) {
	message := buildOptionalDriverInstallPlanMessage("SQL Server", "1.9.6", false, false, false, false, 1, 2)
	if !strings.Contains(message, "先尝试 1 个预编译直链") {
		t.Fatalf("expected direct-download hint, got %q", message)
	}
	if !strings.Contains(message, "失败后转入 2 个驱动总包源") {
		t.Fatalf("expected bundle fallback hint, got %q", message)
	}
}

func TestBuildOptionalDriverFallbackProgressMessageReportsBundleFallback(t *testing.T) {
	message := buildOptionalDriverFallbackProgressMessage("SQL Server", 1, 2, false)
	if !strings.Contains(message, "预编译直链未命中") {
		t.Fatalf("expected direct miss hint, got %q", message)
	}
	if !strings.Contains(message, "转入驱动总包兜底") {
		t.Fatalf("expected bundle fallback hint, got %q", message)
	}
}

func TestDuckDBWindowsBuildUsesDynamicLibraryTag(t *testing.T) {
	if runtime.GOOS != "windows" || runtime.GOARCH != "amd64" {
		t.Skip("DuckDB Windows dynamic library flow only applies on windows/amd64")
	}

	tags, err := optionalDriverBuildTags("duckdb", "")
	if err != nil {
		t.Fatalf("resolve DuckDB build tags failed: %v", err)
	}
	if !strings.Contains(tags, "gonavi_duckdb_driver") || !strings.Contains(tags, "duckdb_use_lib") {
		t.Fatalf("expected DuckDB Windows build tags to include dynamic library tag, got %q", tags)
	}
	if !shouldPreferSourceBuildBeforeDownload("duckdb", "") {
		t.Fatal("expected DuckDB Windows install to try local dynamic-library build before downloads")
	}
	if !shouldSkipReusableAgentCandidate("duckdb", "") {
		t.Fatal("expected DuckDB Windows install to skip reusable static agent candidates")
	}
	seedReleaseAssetCacheEntry(t, "latest", map[string]int64{
		duckDBWindowsDriverZipAssetName: 19 << 20,
	}, map[string]int64{
		duckDBWindowsDriverZipAssetName: 19 << 20,
	})
	legacyDirectURL := "https://example.com/duckdb-driver-agent-windows-amd64.exe"
	urls := resolveOptionalDriverAgentDownloadURLs(driverDefinition{Type: "duckdb"}, legacyDirectURL, "")
	if len(urls) < 2 {
		t.Fatalf("expected DuckDB Windows install to keep dedicated zip ahead of legacy direct candidate, got %v", urls)
	}
	if urls[0] != driverReleaseLatestDownloadURL(duckDBWindowsDriverZipAssetName) {
		t.Fatalf("expected DuckDB Windows dedicated zip candidate first, got %v", urls)
	}
	if urls[1] != legacyDirectURL {
		t.Fatalf("expected DuckDB Windows to keep legacy direct candidate after dedicated zip, got %v", urls)
	}
}

func TestDuckDBWindowsDynamicLibraryCGOLDFlagsIncludeSupportLibraries(t *testing.T) {
	flags := duckDBWindowsDynamicLibraryCGOLDFlags(`C:\tmp\duckdb lib`)
	for _, expected := range []string{
		`-LC:/tmp/duckdb lib`,
		"-lduckdb",
		"-lstdc++",
		"-lm",
		"-lws2_32",
		"-lwsock32",
		"-lrstrtmgr",
	} {
		if !strings.Contains(flags, expected) {
			t.Fatalf("expected flags %q to contain %q", flags, expected)
		}
	}
}

func TestInstallOptionalDriverAgentFromLocalZipExtractsDuckDBDLL(t *testing.T) {
	if runtime.GOOS != "windows" || runtime.GOARCH != "amd64" {
		t.Skip("DuckDB DLL support file is only required on windows/amd64")
	}

	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, "duckdb-driver.zip")
	zipFile, err := os.Create(zipPath)
	if err != nil {
		t.Fatalf("create zip failed: %v", err)
	}
	zw := zip.NewWriter(zipFile)
	for name, content := range map[string]string{
		"Windows/duckdb-driver-agent-windows-amd64.exe": "agent",
		"Windows/duckdb.dll":                            "dll",
	} {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create zip entry %s failed: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write zip entry %s failed: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer failed: %v", err)
	}
	if err := zipFile.Close(); err != nil {
		t.Fatalf("close zip file failed: %v", err)
	}

	target := filepath.Join(tmpDir, "install", "duckdb-driver-agent.exe")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatalf("create install dir failed: %v", err)
	}
	entryName, err := installOptionalDriverAgentFromLocalZip(zipPath, driverDefinition{Type: "duckdb", Name: "DuckDB"}, target, "")
	if err != nil {
		t.Fatalf("install local DuckDB zip failed: %v", err)
	}
	if entryName != "Windows/duckdb-driver-agent-windows-amd64.exe" {
		t.Fatalf("unexpected extracted agent entry: %q", entryName)
	}
	dllBytes, err := os.ReadFile(filepath.Join(filepath.Dir(target), "duckdb.dll"))
	if err != nil {
		t.Fatalf("expected duckdb.dll to be extracted: %v", err)
	}
	if string(dllBytes) != "dll" {
		t.Fatalf("unexpected duckdb.dll content: %q", string(dllBytes))
	}
}

func TestDownloadOptionalDriverAgentBinaryInstallsDuckDBDedicatedZip(t *testing.T) {
	if runtime.GOOS != "windows" || runtime.GOARCH != "amd64" {
		t.Skip("DuckDB dedicated zip flow only applies on windows/amd64")
	}

	originalValidateFunc := validateOptionalDriverAgentExecutableFunc
	validateOptionalDriverAgentExecutableFunc = func(driverType string, executablePath string) error {
		return nil
	}
	t.Cleanup(func() {
		validateOptionalDriverAgentExecutableFunc = originalValidateFunc
	})

	tmpDir := t.TempDir()
	zipPath := filepath.Join(tmpDir, duckDBWindowsDriverZipAssetName)
	zipFile, err := os.Create(zipPath)
	if err != nil {
		t.Fatalf("create zip failed: %v", err)
	}
	zw := zip.NewWriter(zipFile)
	for name, content := range map[string]string{
		"Windows/duckdb-driver-agent-windows-amd64.exe": "agent",
		"Windows/duckdb.dll":                            "dll",
	} {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create zip entry %s failed: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write zip entry %s failed: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip writer failed: %v", err)
	}
	if err := zipFile.Close(); err != nil {
		t.Fatalf("close zip file failed: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, zipPath)
	}))
	defer server.Close()
	proxySnapshot := currentGlobalProxyConfig()
	if _, err := setGlobalProxyConfig(false, proxySnapshot.Proxy); err != nil {
		t.Fatalf("disable global proxy failed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = setGlobalProxyConfig(proxySnapshot.Enabled, proxySnapshot.Proxy)
	})

	target := filepath.Join(tmpDir, "install", "duckdb-driver-agent.exe")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatalf("create install dir failed: %v", err)
	}

	hash, err := downloadOptionalDriverAgentBinary(nil, driverDefinition{Type: "duckdb", Name: "DuckDB"}, server.URL+"/"+duckDBWindowsDriverZipAssetName+"?source=release", target)
	if err != nil {
		t.Fatalf("download dedicated zip failed: %v", err)
	}
	if strings.TrimSpace(hash) == "" {
		t.Fatal("expected hash for installed duckdb agent")
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("expected duckdb agent to be installed: %v", err)
	}
	dllBytes, err := os.ReadFile(filepath.Join(filepath.Dir(target), "duckdb.dll"))
	if err != nil {
		t.Fatalf("expected duckdb.dll to be installed: %v", err)
	}
	if string(dllBytes) != "dll" {
		t.Fatalf("unexpected duckdb.dll content: %q", string(dllBytes))
	}
}

func TestOptionalDriverDownloadZipURLAcceptsQueryString(t *testing.T) {
	if !isOptionalDriverDownloadZipURL("https://example.com/duckdb-driver.zip?token=abc") {
		t.Fatal("expected signed zip URL to be treated as zip download")
	}
	if isOptionalDriverDownloadZipURL("https://example.com/duckdb-driver-agent.exe?token=abc") {
		t.Fatal("expected exe URL with query to remain non-zip download")
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
	if shouldForceSourceBuildForResolvedDownload("mongodb", "1.17.4", "builtin://activate/mongodb?channel=history&version=1.17.4") {
		t.Fatal("expected mongodb v1 builtin install to try published assets before source build")
	}

	explicitURL := driverReleaseDownloadURL("v1.17.4", mongoVersionedReleaseAssetName(1))
	if shouldForceSourceBuildForResolvedDownload("mongodb", "1.17.4", explicitURL) {
		t.Fatal("expected mongodb v1 published asset install to skip forced source build")
	}

	if shouldForceSourceBuildForResolvedDownload("mongodb", "2.5.0", "builtin://activate/mongodb?channel=latest&version=2.5.0") {
		t.Fatal("expected mongodb v2 install not to force source build")
	}
}

func TestShouldPreferSourceBuildBeforeDownloadDoesNotPreferKingbase(t *testing.T) {
	if shouldPreferSourceBuildBeforeDownload("kingbase", "0.0.0-20201021123113-29bd62a876c3") {
		t.Fatal("expected kingbase release install not to prefer source build before download")
	}
}

func TestShouldPreferSourceBuildBeforeDownloadForDevelopmentBuild(t *testing.T) {
	if shouldPreferSourceBuildBeforeDownloadForBuildType("dev", "mariadb", "1.9.3") {
		t.Fatal("expected development release build to prefer published MariaDB driver-agent before source fallback")
	}
	if shouldPreferSourceBuildBeforeDownloadForBuildType("development", "clickhouse", "2.43.1") && !shouldUseDuckDBWindowsDynamicLibrary("clickhouse") {
		t.Fatal("expected development build alias not to prefer source build for ClickHouse")
	}
	if shouldPreferSourceBuildBeforeDownloadForBuildType("production", "mariadb", "1.9.3") {
		t.Fatal("expected production build not to prefer source build for MariaDB")
	}
	if shouldPreferSourceBuildBeforeDownloadForBuildType("dev", "mysql", "") {
		t.Fatal("expected built-in drivers not to prefer optional driver-agent source build")
	}
}

func TestShouldRequireSourceBuildBeforeDownloadForDevelopmentBuild(t *testing.T) {
	if shouldRequireSourceBuildBeforeDownloadForBuildType("dev", "duckdb", "2.5.6") {
		t.Fatal("expected development build to allow DuckDB release bundle fallback after local build failure")
	}
	if shouldUseDuckDBWindowsDynamicLibrary("duckdb") {
		if !shouldPreferSourceBuildBeforeDownloadForBuildType("dev", "duckdb", "2.5.6") {
			t.Fatal("expected DuckDB Windows dynamic-library install to prefer local source build before bundle fallback")
		}
	} else if shouldPreferSourceBuildBeforeDownloadForBuildType("dev", "duckdb", "2.5.6") {
		t.Fatal("expected development build not to prefer DuckDB source build on non-Windows dynamic-library platforms")
	}
	if shouldRequireSourceBuildBeforeDownloadForBuildType("development", "mariadb", "1.9.3") {
		t.Fatal("expected development build alias to allow published MariaDB driver-agent fallback")
	}
	if shouldRequireSourceBuildBeforeDownloadForBuildType("production", "duckdb", "2.5.6") {
		t.Fatal("expected production build to allow DuckDB release bundle fallback")
	}
	if shouldRequireSourceBuildBeforeDownloadForBuildType("dev", "mysql", "") {
		t.Fatal("expected built-in drivers not to require optional driver-agent source build")
	}
}

func TestOptionalDriverInstallTimeoutsStayBounded(t *testing.T) {
	if optionalDriverBundleDownloadTimeout > 15*time.Minute {
		t.Fatalf("driver bundle download timeout should stay bounded, got %s", optionalDriverBundleDownloadTimeout)
	}
	if optionalDriverSourceBuildTimeout > 8*time.Minute {
		t.Fatalf("driver source build timeout should stay bounded, got %s", optionalDriverSourceBuildTimeout)
	}
}

func TestResolveDuckDBWindowsCGOToolchainBinFromCandidates(t *testing.T) {
	binDir := t.TempDir()
	writeSelfExecutable(t, filepath.Join(binDir, "gcc.exe"))
	writeSelfExecutable(t, filepath.Join(binDir, "g++.exe"))

	got, err := resolveDuckDBWindowsCGOToolchainBinFromCandidates([]string{
		filepath.Join(t.TempDir(), "missing"),
		binDir,
	})
	if err != nil {
		t.Fatalf("expected toolchain bin to resolve: %v", err)
	}
	if got != filepath.Clean(binDir) {
		t.Fatalf("expected %q, got %q", filepath.Clean(binDir), got)
	}
}

func TestPrependPathEnvUsesCurrentEnvPath(t *testing.T) {
	basePath := "base-path"
	firstPath := "first-path"
	secondPath := "second-path"
	env := []string{"PATH=" + basePath}
	env = prependPathEnv(env, firstPath)
	env = prependPathEnv(env, secondPath)

	got := envValue(env, "PATH")
	want := strings.Join([]string{secondPath, firstPath, basePath}, string(os.PathListSeparator))
	if got != want {
		t.Fatalf("expected PATH %q, got %q", want, got)
	}
}

func TestResolveOptionalDriverAgentDownloadURLsIncludesPublishedKingbaseAsset(t *testing.T) {
	definition, ok := resolveDriverDefinition("kingbase")
	if !ok {
		t.Fatal("expected kingbase driver definition")
	}

	version := normalizeVersion(definition.PinnedVersion)
	assetName := optionalDriverReleaseAssetNameForVersion("kingbase", version)
	publishedAssets := map[string]int64{
		assetName: 18 << 20,
	}
	seedReleaseAssetCacheEntry(t, "tag:v"+version, publishedAssets, publishedAssets)
	seedReleaseAssetCacheEntry(t, "latest", publishedAssets, publishedAssets)

	urls := resolveOptionalDriverAgentDownloadURLs(definition, "builtin://activate/kingbase", version)
	if len(urls) == 0 {
		t.Fatal("expected kingbase pinned install to include published download candidates")
	}

	if !strings.Contains(urls[0], assetName) {
		t.Fatalf("expected first kingbase download URL to contain %q, got %q", assetName, urls[0])
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

func TestDownloadOptionalDriverAgentFromBundleSharesConcurrentDownload(t *testing.T) {
	resetOptionalDriverBundleDownloadCacheForTest(t)
	proxySnapshot := currentGlobalProxyConfig()
	if _, err := setGlobalProxyConfig(false, proxySnapshot.Proxy); err != nil {
		t.Fatalf("disable global proxy failed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = setGlobalProxyConfig(proxySnapshot.Enabled, proxySnapshot.Proxy)
	})

	bundlePath := filepath.Join(t.TempDir(), "GoNavi-DriverAgents.zip")
	writeZipWithSelfExecutableEntries(t, bundlePath, []string{
		optionalDriverBundleEntryPath("clickhouse"),
		optionalDriverBundleEntryPath("mongodb"),
	})

	var requestCount int32
	releaseDownload := make(chan struct{})
	var releaseOnce sync.Once
	release := func() {
		releaseOnce.Do(func() {
			close(releaseDownload)
		})
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requestCount, 1)
		<-releaseDownload
		http.ServeFile(w, r, bundlePath)
	}))
	defer server.Close()
	defer release()

	errCh := make(chan error, 2)
	clickhouseTarget := filepath.Join(t.TempDir(), optionalDriverExecutableBaseName("clickhouse"))
	mongodbTarget := filepath.Join(t.TempDir(), optionalDriverExecutableBaseName("mongodb"))
	go func() {
		_, _, err := downloadOptionalDriverAgentFromBundle(
			nil,
			driverDefinition{Type: "clickhouse", Name: "ClickHouse"},
			server.URL,
			clickhouseTarget,
		)
		errCh <- err
	}()

	deadline := time.Now().Add(2 * time.Second)
	for atomic.LoadInt32(&requestCount) == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if atomic.LoadInt32(&requestCount) != 1 {
		t.Fatalf("expected first bundle request to start, got %d", atomic.LoadInt32(&requestCount))
	}

	go func() {
		_, _, err := downloadOptionalDriverAgentFromBundle(
			nil,
			driverDefinition{Type: "mongodb", Name: "MongoDB"},
			server.URL,
			mongodbTarget,
		)
		errCh <- err
	}()

	time.Sleep(100 * time.Millisecond)
	if got := atomic.LoadInt32(&requestCount); got != 1 {
		t.Fatalf("expected concurrent bundle install to wait for first download, got %d requests", got)
	}
	release()

	for i := 0; i < 2; i++ {
		if err := <-errCh; err != nil {
			t.Fatalf("bundle install failed: %v", err)
		}
	}
	if got := atomic.LoadInt32(&requestCount); got != 1 {
		t.Fatalf("expected one shared bundle download, got %d requests", got)
	}
}

func TestInstallOptionalDriverAgentPackageAcceptsStaleDownloadRevision(t *testing.T) {
	originalProbe := optionalDriverAgentMetadataProbe
	t.Cleanup(func() {
		optionalDriverAgentMetadataProbe = originalProbe
	})

	tmpDir := t.TempDir()
	staleAgent := filepath.Join(tmpDir, "stale-driver-agent")
	if runtime.GOOS == "windows" {
		staleAgent += ".exe"
	}
	writeSelfExecutable(t, staleAgent)

	staleServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, staleAgent)
	}))
	defer staleServer.Close()
	proxySnapshot := currentGlobalProxyConfig()
	if _, err := setGlobalProxyConfig(false, proxySnapshot.Proxy); err != nil {
		t.Fatalf("disable global proxy failed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = setGlobalProxyConfig(proxySnapshot.Enabled, proxySnapshot.Proxy)
	})

	optionalDriverAgentMetadataProbe = func(driverType string, executablePath string) (db.OptionalDriverAgentMetadata, error) {
		return db.OptionalDriverAgentMetadata{
			DriverType:    driverType,
			AgentRevision: "src-stale-agent",
		}, nil
	}

	meta, err := installOptionalDriverAgentPackage(
		nil,
		driverDefinition{Type: "sqlserver", Name: "SQL Server"},
		"1.9.6",
		filepath.Join(tmpDir, "drivers"),
		staleServer.URL,
	)
	if err != nil {
		t.Fatalf("expected stale direct download to be installed with an update hint, got %v", err)
	}
	if meta.DownloadURL != staleServer.URL {
		t.Fatalf("expected direct download source to be preserved, got %q", meta.DownloadURL)
	}
	if meta.AgentRevision != "src-stale-agent" {
		t.Fatalf("expected stale agent revision to be recorded, got %q", meta.AgentRevision)
	}
	if _, err := os.Stat(meta.ExecutablePath); err != nil {
		t.Fatalf("expected runtime executable to stay installed, got %v", err)
	}
	needsUpdate, reason, expectedRevision := optionalDriverAgentRevisionStatus("sqlserver", meta, true)
	if !needsUpdate {
		t.Fatalf("expected stale installed revision to be surfaced as needsUpdate; expected=%q", expectedRevision)
	}
	if !strings.Contains(reason, "强烈建议重装") {
		t.Fatalf("expected advisory reinstall reason, got %q", reason)
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
	writeZipWithSelfExecutableEntries(t, zipPath, []string{entryName})
}

func writeZipWithSelfExecutableEntries(t *testing.T, zipPath string, entryNames []string) {
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
	for _, entryName := range entryNames {
		entry, err := writer.Create(entryName)
		if err != nil {
			t.Fatalf("create zip entry failed: %v", err)
		}
		if _, err := entry.Write(content); err != nil {
			t.Fatalf("write zip entry failed: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zip writer failed: %v", err)
	}
}

func resetOptionalDriverBundleDownloadCacheForTest(t *testing.T) {
	t.Helper()
	reset := func() {
		optionalDriverBundleDownloadMu.Lock()
		paths := make([]string, 0, len(optionalDriverBundleDownloads))
		for _, state := range optionalDriverBundleDownloads {
			if state != nil && strings.TrimSpace(state.path) != "" {
				paths = append(paths, state.path)
			}
		}
		optionalDriverBundleDownloads = make(map[string]*optionalDriverBundleDownloadState)
		optionalDriverBundleDownloadMu.Unlock()
		for _, path := range paths {
			_ = os.Remove(path)
		}
	}
	reset()
	t.Cleanup(reset)
}
