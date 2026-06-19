package app

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	stdRuntime "runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/buildutil"
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/mod/semver"
)

var (
	goBinaryLookPath = exec.LookPath
	goBinaryStat     = os.Stat
	goBinaryCommand  = func(name string, arg ...string) *exec.Cmd {
		return exec.Command(name, arg...)
	}
	goBinaryCommandOutput = func(cmd *exec.Cmd) ([]byte, error) {
		return cmd.Output()
	}
	optionalDriverAgentMetadataProbe = db.ProbeOptionalDriverAgentMetadata
)

type optionalDriverBundleDownloadState struct {
	done     chan struct{}
	path     string
	err      error
	finished bool
}

var (
	optionalDriverBundleDownloadMu sync.Mutex
	optionalDriverBundleDownloads  = make(map[string]*optionalDriverBundleDownloadState)
)

var (
	errOptionalDriverAgentMetadataUnavailable = errors.New("driver-agent metadata unavailable")
	errLocalDriverPackageJDBCJarUnsupported   = errors.New("JDBC Jar unsupported")
)

type driverBuildUnavailableError struct {
	Name string
}

func (e *driverBuildUnavailableError) Error() string {
	return fmt.Sprintf("%s 当前发行包为精简构建，未内置该驱动；如需使用请安装 Full 版", strings.TrimSpace(e.Name))
}

type driverVersionValidationError struct {
	DriverType string
	Version    string
}

func (e *driverVersionValidationError) Error() string {
	driverType := normalizeDriverType(e.DriverType)
	versionText := normalizeVersion(strings.TrimSpace(e.Version))
	switch driverType {
	case "mongodb":
		return fmt.Sprintf("MongoDB 版本 %s 当前不受支持；仅支持 1.17.x 和 2.x", versionText)
	default:
		return fmt.Sprintf("%s 版本 %s 当前不受支持", driverType, versionText)
	}
}

// resolveGoBinaryPath 定位 Go 可执行文件，兼容 macOS 图形应用未继承 shell PATH 的场景 by AI.Coding
func resolveGoBinaryPath() (string, error) {
	if goPath, err := goBinaryLookPath("go"); err == nil {
		return goPath, nil
	}

	// 修复点：GUI 进程常拿不到终端里的 PATH，这里补充常见安装位置兜底。
	commonCandidates := []string{
		"/opt/homebrew/bin/go",
		"/usr/local/go/bin/go",
		"/usr/local/bin/go",
	}
	for _, candidate := range commonCandidates {
		if info, err := goBinaryStat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	for _, shell := range candidateShellsForCommandLookup() {
		cmd := goBinaryCommand(shell, "-lc", "command -v go")
		output, err := goBinaryCommandOutput(cmd)
		if err != nil {
			continue
		}
		goPath := resolveExistingPathFromCommandOutput(output)
		if goPath == "" {
			continue
		}
		if info, err := goBinaryStat(goPath); err == nil && !info.IsDir() {
			return goPath, nil
		}
	}

	return "", exec.ErrNotFound
}

// resolveExistingPathFromCommandOutput 从命令输出中提取真实存在的路径，避免 shell 启动脚本输出污染探测结果 by AI.Coding
func resolveExistingPathFromCommandOutput(value []byte) string {
	for _, line := range bytes.Split(value, []byte{'\n'}) {
		trimmed := strings.TrimSpace(string(line))
		if trimmed != "" {
			if info, err := goBinaryStat(trimmed); err == nil && !info.IsDir() {
				return trimmed
			}
		}
	}
	return ""
}

// candidateShellsForCommandLookup 返回可能可用的 shell，用于回收用户登录环境中的 PATH by AI.Coding
func candidateShellsForCommandLookup() []string {
	seen := make(map[string]struct{}, 4)
	result := make([]string, 0, 4)
	appendShell := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		if _, ok := seen[trimmed]; ok {
			return
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}

	appendShell(os.Getenv("SHELL"))
	appendShell("/bin/zsh")
	appendShell("/bin/bash")
	appendShell("/bin/sh")
	return result
}

type driverDefinition struct {
	Type               string `json:"type"`
	Name               string `json:"name"`
	Engine             string `json:"engine,omitempty"`
	BuiltIn            bool   `json:"builtIn"`
	PinnedVersion      string `json:"pinnedVersion,omitempty"`
	DefaultDownloadURL string `json:"defaultDownloadUrl,omitempty"`
	DownloadSHA256     string `json:"downloadSha256,omitempty"`
	ChecksumPolicy     string `json:"checksumPolicy,omitempty"`
}

type installedDriverPackage struct {
	DriverType     string `json:"driverType"`
	Version        string `json:"version,omitempty"`
	AgentRevision  string `json:"agentRevision,omitempty"`
	FilePath       string `json:"filePath"`
	FileName       string `json:"fileName"`
	ExecutablePath string `json:"executablePath,omitempty"`
	DownloadURL    string `json:"downloadUrl,omitempty"`
	SHA256         string `json:"sha256,omitempty"`
	DownloadedAt   string `json:"downloadedAt"`
}

type driverStatusItem struct {
	Type                string `json:"type"`
	Name                string `json:"name"`
	Engine              string `json:"engine,omitempty"`
	BuiltIn             bool   `json:"builtIn"`
	PinnedVersion       string `json:"pinnedVersion,omitempty"`
	InstalledVersion    string `json:"installedVersion,omitempty"`
	PackageSizeText     string `json:"packageSizeText,omitempty"`
	RuntimeAvailable    bool   `json:"runtimeAvailable"`
	PackageInstalled    bool   `json:"packageInstalled"`
	Connectable         bool   `json:"connectable"`
	DefaultDownloadURL  string `json:"defaultDownloadUrl,omitempty"`
	InstallDir          string `json:"installDir,omitempty"`
	PackagePath         string `json:"packagePath,omitempty"`
	PackageFileName     string `json:"packageFileName,omitempty"`
	ExecutablePath      string `json:"executablePath,omitempty"`
	DownloadedAt        string `json:"downloadedAt,omitempty"`
	AgentRevision       string `json:"agentRevision,omitempty"`
	ExpectedRevision    string `json:"expectedRevision,omitempty"`
	NeedsUpdate         bool   `json:"needsUpdate,omitempty"`
	UpdateReason        string `json:"updateReason,omitempty"`
	AffectedConnections int    `json:"affectedConnections,omitempty"`
	ReasonCode          string `json:"reasonCode,omitempty"`
	Message             string `json:"message,omitempty"`
}

const driverDownloadProgressEvent = "driver:download-progress"

type driverDownloadProgressPayload struct {
	DriverType string  `json:"driverType"`
	Status     string  `json:"status"`
	Percent    float64 `json:"percent"`
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Message    string  `json:"message,omitempty"`
}

type driverNetworkProbeItem struct {
	ProbeCode   string `json:"probeCode,omitempty"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Reachable   bool   `json:"reachable"`
	HTTPStatus  int    `json:"httpStatus,omitempty"`
	LatencyMs   int64  `json:"latencyMs,omitempty"`
	TCPLatency  int64  `json:"tcpLatencyMs,omitempty"`
	HTTPLatency int64  `json:"httpLatencyMs,omitempty"`
	Method      string `json:"method,omitempty"`
	Error       string `json:"error,omitempty"`
}

const (
	driverStatusReasonSlimBuildMissingDriver = "slim_build_missing_driver"
	driverNetworkProbeCodeGitHubAPI          = "github_api"
	driverNetworkProbeCodeGitHubRelease      = "github_release"
	driverNetworkProbeCodeGitHubReleaseAsset = "github_release_asset"
	driverNetworkProbeCodeGoModuleProxy      = "go_module_proxy"
)

type pinnedDriverPackage struct {
	Version     string
	DownloadURL string
	SHA256      string
	Policy      string
	Engine      string
}

type driverManifestFile struct {
	Engine         string                        `json:"engine"`
	DefaultEngine  string                        `json:"defaultEngine"`
	DefaultEngine2 string                        `json:"default_engine"`
	Drivers        map[string]driverManifestItem `json:"drivers"`
}

type driverManifestItem struct {
	Version         string                      `json:"version"`
	DownloadURL     string                      `json:"downloadUrl"`
	DownloadURL2    string                      `json:"download_url"`
	SHA256          string                      `json:"sha256"`
	ChecksumPolicy  string                      `json:"checksumPolicy"`
	ChecksumPolicy2 string                      `json:"checksum_policy"`
	Engine          string                      `json:"engine"`
	Versions        []driverManifestVersionItem `json:"versions"`
	VersionList     []driverManifestVersionItem `json:"versionList"`
	VersionList2    []driverManifestVersionItem `json:"version_list"`
	VersionOptions  []driverManifestVersionItem `json:"versionOptions"`
	VersionOptions2 []driverManifestVersionItem `json:"version_options"`
}

type driverManifestVersionItem struct {
	Version         string `json:"version"`
	DownloadURL     string `json:"downloadUrl"`
	DownloadURL2    string `json:"download_url"`
	SHA256          string `json:"sha256"`
	ChecksumPolicy  string `json:"checksumPolicy"`
	ChecksumPolicy2 string `json:"checksum_policy"`
	Engine          string `json:"engine"`
}

type driverManifestCacheEntry struct {
	LoadedAt time.Time
	Packages map[string]pinnedDriverPackage
	Versions map[string][]pinnedDriverPackage
	Err      string
}

type driverVersionOptionItem struct {
	Version          string `json:"version"`
	DownloadURL      string `json:"downloadUrl"`
	SHA256           string `json:"sha256,omitempty"`
	PackageSizeBytes int64  `json:"packageSizeBytes,omitempty"`
	PackageSizeText  string `json:"packageSizeText,omitempty"`
	Recommended      bool   `json:"recommended,omitempty"`
	Source           string `json:"source,omitempty"`
	Year             string `json:"year,omitempty"`
	DisplayLabel     string `json:"displayLabel,omitempty"`
}

type driverReleaseAssetSizeCacheEntry struct {
	LoadedAt        time.Time
	SizeByKey       map[string]int64
	PublishedAssets map[string]bool
	Err             string
}

type goModuleLatestVersionCacheEntry struct {
	LoadedAt time.Time
	Version  string
	Err      string
}

type goModuleLatestVersionResponse struct {
	Version string `json:"Version"`
}

type goModuleVersionListCacheEntry struct {
	LoadedAt time.Time
	Versions []goModuleVersionMeta
	Err      string
}

type goModuleVersionMeta struct {
	Version string
	Year    string
}

type driverBundleAssetIndex struct {
	Assets map[string]int64 `json:"assets"`
}

const (
	// 默认使用内置 manifest，避免依赖网络与外部仓库 404。
	defaultDriverManifestURLValue       = "builtin://manifest"
	driverReleaseRepo                   = "Syngnat/GoNavi-DriverAgents"
	driverReleaseLatestAPIURL           = "https://api.github.com/repos/" + driverReleaseRepo + "/releases/latest"
	driverReleaseDevTag                 = "dev-latest"
	optionalDriverBundleAssetName       = "GoNavi-DriverAgents.zip"
	duckDBWindowsDriverZipAssetName     = "duckdb-driver.zip"
	optionalDriverBundleIndexAssetName  = "GoNavi-DriverAgents-Index.json"
	optionalDriverBundleDownloadTimeout = 15 * time.Minute
	optionalDriverBundleCacheMaxAge     = 7 * 24 * time.Hour
	optionalDriverBundleCacheMaxFiles   = 4
	driverManifestCacheTTL              = 5 * time.Minute
	driverReleaseAssetSizeCacheTTL      = 30 * time.Minute
	driverReleaseAssetSizeErrorCacheTTL = 30 * time.Second
	driverReleaseAssetSizeProbeTimeout  = 4 * time.Second
	driverReleaseListProbeTimeout       = 6 * time.Second
	driverModuleLatestCacheTTL          = 6 * time.Hour
	driverModuleLatestErrorCacheTTL     = 2 * time.Minute
	driverModuleLatestProbeTimeout      = 4 * time.Second
	driverModuleVersionInspectLimit     = 30
	driverModuleVersionListMaxSize      = 4 << 20
	driverRecentVersionLimit            = 5
	driverModuleVersionFetchLimit       = 64
	driverVersionWarmupMinInterval      = 30 * time.Second
	driverBundleIndexMaxSize            = 1 << 20
	driverManifestMaxSize               = 2 << 20
	driverNetworkProbeTimeout           = 4 * time.Second
	driverNetworkProbeTCPTimeout        = 3 * time.Second
	localDriverDirectoryScanMaxEntries  = 20000
	driverChecksumPolicyStrict          = "strict"
	driverChecksumPolicyWarn            = "warn"
	driverChecksumPolicyOff             = "off"
	driverEngineGo                      = "go"
	driverEngineExternal                = "external"
	duckDBWindowsLibraryVersion         = "v1.4.4"
	duckDBWindowsLibraryArchiveURL      = "https://github.com/duckdb/duckdb/releases/download/" + duckDBWindowsLibraryVersion + "/libduckdb-windows-amd64.zip"
	duckDBWindowsSupportDLLName         = "duckdb.dll"
)

const builtinDriverManifestJSON = `{
  "engine": "go",
  "drivers": {
    "mysql":     { "engine": "go", "version": "1.9.3", "checksumPolicy": "off" },
    "goldendb":  { "engine": "go", "version": "1.9.3", "checksumPolicy": "off" },
    "mariadb":   { "engine": "go", "version": "1.9.3", "checksumPolicy": "off", "downloadUrl": "builtin://activate/mariadb" },
    "oceanbase": { "engine": "go", "version": "1.9.3", "checksumPolicy": "off", "downloadUrl": "builtin://activate/oceanbase" },
    "doris":     { "engine": "go", "version": "1.9.3", "checksumPolicy": "off", "downloadUrl": "builtin://activate/doris" },
    "starrocks": { "engine": "go", "version": "1.9.3", "checksumPolicy": "off", "downloadUrl": "builtin://activate/starrocks" },
    "sphinx":    { "engine": "go", "version": "1.9.3", "checksumPolicy": "off", "downloadUrl": "builtin://activate/sphinx" },
    "sqlserver": { "engine": "go", "version": "1.9.6", "checksumPolicy": "off", "downloadUrl": "builtin://activate/sqlserver" },
    "sqlite":    { "engine": "go", "version": "1.44.3", "checksumPolicy": "off", "downloadUrl": "builtin://activate/sqlite" },
    "duckdb":    { "engine": "go", "version": "2.5.6", "checksumPolicy": "off", "downloadUrl": "builtin://activate/duckdb" },
    "dameng":    { "engine": "go", "version": "1.8.22", "checksumPolicy": "off", "downloadUrl": "builtin://activate/dameng" },
    "kingbase":  { "engine": "go", "version": "0.0.0-20201021123113-29bd62a876c3", "checksumPolicy": "off", "downloadUrl": "builtin://activate/kingbase" },
    "highgo":    { "engine": "go", "version": "0.0.0-local", "checksumPolicy": "off", "downloadUrl": "builtin://activate/highgo" },
    "vastbase":  { "engine": "go", "version": "1.11.1", "checksumPolicy": "off", "downloadUrl": "builtin://activate/vastbase" },
    "opengauss": { "engine": "go", "version": "1.11.1", "checksumPolicy": "off", "downloadUrl": "builtin://activate/opengauss" },
    "gaussdb":   { "engine": "go", "version": "v1.0.0-rc1", "checksumPolicy": "off", "downloadUrl": "builtin://activate/gaussdb" },
    "iris":      { "engine": "go", "version": "0.2.1", "checksumPolicy": "off", "downloadUrl": "builtin://activate/iris" },
    "mongodb":   { "engine": "go", "version": "1.17.9", "checksumPolicy": "off", "downloadUrl": "builtin://activate/mongodb" },
    "tdengine":  { "engine": "go", "version": "3.7.8", "checksumPolicy": "off", "downloadUrl": "builtin://activate/tdengine" },
    "iotdb":     { "engine": "go", "version": "1.3.7", "checksumPolicy": "off", "downloadUrl": "builtin://activate/iotdb" },
    "clickhouse": { "engine": "go", "version": "2.43.1", "checksumPolicy": "off", "downloadUrl": "builtin://activate/clickhouse" },
    "elasticsearch": { "engine": "go", "version": "8.19.6", "checksumPolicy": "off", "downloadUrl": "builtin://activate/elasticsearch" }
  }
}`

var (
	driverManifestCacheMu      sync.RWMutex
	driverManifestCache        = make(map[string]driverManifestCacheEntry)
	driverReleaseSizeMu        sync.RWMutex
	driverReleaseSizeMap       = make(map[string]driverReleaseAssetSizeCacheEntry)
	driverReleaseListMu        sync.RWMutex
	driverReleaseList          = driverManifestReleaseListCache{}
	driverModuleLatestMu       sync.RWMutex
	driverModuleLatestMap      = make(map[string]goModuleLatestVersionCacheEntry)
	driverModuleVersionMu      sync.RWMutex
	driverModuleVersionMap     = make(map[string]goModuleVersionListCacheEntry)
	driverVersionWarmupMu      sync.Mutex
	driverVersionWarmup        = driverVersionWarmupState{}
	errLocalDriverDirScanLimit = errors.New("local_driver_directory_scan_limit_exceeded")
)

var optionalDriverSourceBuildTimeout = 8 * time.Minute

var validateOptionalDriverAgentExecutableFunc = db.ValidateOptionalDriverAgentExecutable
var resolveOptionalDriverAgentExecutablePathFunc = db.ResolveOptionalDriverAgentExecutablePath

type driverVersionWarmupState struct {
	Running     bool
	LastStarted time.Time
}

type driverManifestReleaseListCache struct {
	LoadedAt time.Time
	Releases []githubRelease
	Err      string
}

var pinnedDriverPackageMap = map[string]pinnedDriverPackage{
	"postgres": {
		Version: "go-embedded",
		Policy:  driverChecksumPolicyOff,
		Engine:  driverEngineGo,
	},
}

var latestDriverVersionMap = map[string]string{
	"mysql":         "1.9.3",
	"goldendb":      "1.9.3",
	"mariadb":       "1.9.3",
	"oceanbase":     "1.9.3",
	"diros":         "1.9.3",
	"starrocks":     "1.9.3",
	"sphinx":        "1.9.3",
	"sqlserver":     "1.9.6",
	"sqlite":        "1.46.1",
	"duckdb":        "2.5.6",
	"dameng":        "1.8.22",
	"kingbase":      "0.0.0-20201021123113-29bd62a876c3",
	"highgo":        "0.0.0-local",
	"vastbase":      "1.11.2",
	"opengauss":     "1.11.1",
	"gaussdb":       "v1.0.0-rc1",
	"iris":          "0.2.1",
	"mongodb":       "2.5.0",
	"tdengine":      "3.7.8",
	"iotdb":         "1.3.7",
	"clickhouse":    "2.43.1",
	"elasticsearch": "8.19.6",
	"oracle":        "2.9.0",
	"postgres":      "1.11.2",
	"redis":         "9.17.3",
}

var driverGoModulePathMap = map[string]string{
	"goldendb":      "github.com/go-sql-driver/mysql",
	"mariadb":       "github.com/go-sql-driver/mysql",
	"oceanbase":     "github.com/go-sql-driver/mysql",
	"diros":         "github.com/go-sql-driver/mysql",
	"starrocks":     "github.com/go-sql-driver/mysql",
	"sphinx":        "github.com/go-sql-driver/mysql",
	"sqlserver":     "github.com/microsoft/go-mssqldb",
	"sqlite":        "modernc.org/sqlite",
	"duckdb":        "github.com/duckdb/duckdb-go/v2",
	"dameng":        "gitee.com/chunanyong/dm",
	"kingbase":      "gitea.com/kingbase/gokb",
	"highgo":        "github.com/highgo/pq-sm3",
	"vastbase":      "github.com/lib/pq",
	"opengauss":     "github.com/lib/pq",
	"gaussdb":       "github.com/HuaweiCloudDeveloper/gaussdb-go",
	"iris":          "github.com/caretdev/go-irisnative",
	"mongodb":       "go.mongodb.org/mongo-driver/v2",
	"tdengine":      "github.com/taosdata/driver-go/v3",
	"iotdb":         "github.com/apache/iotdb-client-go",
	"clickhouse":    "github.com/ClickHouse/clickhouse-go/v2",
	"elasticsearch": "github.com/elastic/go-elasticsearch/v8",
}

var driverGoModuleAliasPathMap = map[string][]string{
	"oceanbase": {
		"github.com/sijms/go-ora/v2",
	},
	"mongodb": {
		"go.mongodb.org/mongo-driver",
	},
}

var driverExtraHistoryLimitMap = map[string]int{
	"mongodb":  10,
	"tdengine": 30,
}

var fallbackRecentDriverVersionsMap = map[string][]goModuleVersionMeta{
	"mongodb": {
		{Version: "2.5.0"},
		{Version: "2.4.2"},
		{Version: "2.4.1"},
		{Version: "2.4.0"},
		{Version: "2.3.1"},
		{Version: "1.17.9"},
		{Version: "1.17.8"},
		{Version: "1.17.7"},
		{Version: "1.17.6"},
		{Version: "1.17.4"},
		{Version: "1.17.3"},
		{Version: "1.17.2"},
		{Version: "1.17.1"},
		{Version: "1.17.0"},
		{Version: "1.16.1"},
	},
	"tdengine": {
		{Version: "3.8.0"},
		{Version: "3.7.8"},
		{Version: "3.7.7"},
		{Version: "3.7.6"},
		{Version: "3.7.5"},
		{Version: "3.7.4"},
		{Version: "3.7.3"},
		{Version: "3.7.2"},
		{Version: "3.7.1"},
		{Version: "3.7.0"},
		{Version: "3.6.0"},
		{Version: "3.5.8"},
		{Version: "3.5.7"},
		{Version: "3.5.6"},
		{Version: "3.5.5"},
		{Version: "3.5.4"},
		{Version: "3.5.3"},
		{Version: "3.5.2"},
		{Version: "3.5.1"},
		{Version: "3.5.0"},
		{Version: "3.3.1"},
		{Version: "3.1.0"},
		{Version: "3.0.4"},
		{Version: "3.0.3"},
		{Version: "3.0.2"},
		{Version: "3.0.1"},
		{Version: "3.0.0"},
	},
}

func (a *App) SelectDriverDownloadDirectory(currentDir string) connection.QueryResult {
	defaultDir := strings.TrimSpace(currentDir)
	if defaultDir == "" {
		defaultDir = defaultDriverDownloadDirectory()
	} else if !filepath.IsAbs(defaultDir) {
		if abs, err := filepath.Abs(defaultDir); err == nil {
			defaultDir = abs
		}
	}

	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                a.appText("driver_manager.backend.dialog.select_download_directory", nil),
		DefaultDirectory:     defaultDir,
		CanCreateDirectories: true,
	})
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if strings.TrimSpace(selection) == "" {
		return connection.QueryResult{Success: false, Message: "已取消"}
	}

	resolved, err := resolveDriverDownloadDirectory(selection)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{
		Success: true,
		Data: map[string]interface{}{
			"path":          resolved,
			"defaultPath":   defaultDriverDownloadDirectory(),
			"isDefaultPath": false,
		},
	}
}

func validateLocalDriverPackagePath(path string) error {
	pathText := strings.TrimSpace(path)
	if pathText == "" {
		return nil
	}
	if strings.EqualFold(filepath.Ext(pathText), ".jar") {
		return errLocalDriverPackageJDBCJarUnsupported
	}
	return nil
}

func (a *App) localizeLocalDriverPackagePathError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, errLocalDriverPackageJDBCJarUnsupported) {
		return errors.New(a.appText("driver_manager.backend.message.jdbc_jar_unsupported", nil))
	}
	return err
}

func (a *App) localizeDriverSelectionError(definition driverDefinition, err error) error {
	if err == nil {
		return nil
	}
	var buildErr *driverBuildUnavailableError
	if errors.As(err, &buildErr) {
		return errors.New(a.appText("driver_manager.backend.status.slim_build_required", map[string]any{
			"name": a.driverStatusDisplayName(definition),
		}))
	}
	var versionErr *driverVersionValidationError
	if errors.As(err, &versionErr) && normalizeDriverType(versionErr.DriverType) == "mongodb" {
		return errors.New(a.appText("driver_manager.backend.error.mongo_version_unsupported", map[string]any{
			"version": normalizeVersion(strings.TrimSpace(versionErr.Version)),
		}))
	}
	return err
}

func (a *App) driverOperationErrorMessage(err error, format string, args ...interface{}) string {
	message := a.localizedDriverOperationDetail(err)
	logger.Error(err, format, args...)
	return message
}

func (a *App) localizedDriverOperationDetail(err error) string {
	message := normalizeErrorMessage(err)
	if strings.TrimSpace(message) == "" {
		message = a.appText("driver_manager.backend.error.unknown", nil)
	}
	return strings.TrimSpace(message) + a.localizedDriverLogHint()
}

func (a *App) localizedDriverLogHint() string {
	path := strings.TrimSpace(logger.Path())
	if path == "" {
		return ""
	}
	return a.appText("driver_manager.backend.message.log_hint", map[string]any{"path": path})
}

func (a *App) driverStatusDisplayName(definition driverDefinition) string {
	name := strings.TrimSpace(definition.Name)
	if name != "" {
		return name
	}
	name = strings.TrimSpace(definition.Type)
	if name != "" {
		return name
	}
	return a.appText("driver_manager.backend.driver_fallback_name", nil)
}

func parseDriverAgentArchIncompatibleDetail(detail string) (string, string, bool) {
	const prefix = "可执行文件架构不兼容（文件="
	const middle = "，当前进程="

	start := strings.Index(detail, prefix)
	if start < 0 {
		return "", "", false
	}
	rest := detail[start+len(prefix):]
	mid := strings.Index(rest, middle)
	if mid < 0 {
		return "", "", false
	}
	fileText := strings.TrimSpace(rest[:mid])
	processText := rest[mid+len(middle):]
	end := strings.Index(processText, "）")
	if end < 0 {
		return "", "", false
	}
	processText = strings.TrimSpace(processText[:end])
	if fileText == "" || processText == "" {
		return "", "", false
	}
	return fileText, processText, true
}

func parseDriverAgentUnavailableDetail(reason string, name string) (string, bool) {
	const suffix = "；请在驱动管理中重新安装启用"
	prefix := strings.TrimSpace(name) + " 驱动代理不可用："
	if !strings.HasPrefix(reason, prefix) || !strings.HasSuffix(reason, suffix) {
		return "", false
	}
	detail := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(reason, prefix), suffix))
	if detail == "" {
		return "", false
	}
	return detail, true
}

func (a *App) localizeDriverRuntimeReason(definition driverDefinition, reason string) string {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return ""
	}

	name := a.driverStatusDisplayName(definition)
	switch reason {
	case "未识别的数据源类型":
		return a.appText("driver_manager.backend.status.unrecognized_driver_type", nil)
	case fmt.Sprintf("%s 当前发行包为精简构建，未内置该驱动；如需使用请安装 Full 版", name):
		return a.appText("driver_manager.backend.status.slim_build_required", map[string]any{"name": name})
	case fmt.Sprintf("%s 驱动代理路径解析失败，请在驱动管理中重新安装启用", name),
		fmt.Sprintf("%s 驱动代理路径为空；请在驱动管理中重新安装启用", name):
		return a.appText("driver_manager.backend.status.agent_path_failed", map[string]any{"name": name})
	case fmt.Sprintf("%s 驱动代理缺失，请在驱动管理中重新安装启用", name):
		return a.appText("driver_manager.backend.status.agent_missing", map[string]any{"name": name})
	case fmt.Sprintf("%s 纯 Go 驱动未启用，请先在驱动管理中点击“安装启用”", name):
		return a.appText("driver_manager.backend.status.optional_disabled", map[string]any{"name": name})
	}

	if detail, ok := parseDriverAgentUnavailableDetail(reason, name); ok {
		if fileText, processText, ok := parseDriverAgentArchIncompatibleDetail(detail); ok {
			return a.appText("driver_manager.backend.status.agent_arch_incompatible_detail", map[string]any{
				"name":    name,
				"file":    fileText,
				"process": processText,
			})
		}
		return a.appText("driver_manager.backend.status.agent_unavailable_reinstall", map[string]any{
			"name":   name,
			"detail": detail,
		})
	}

	return reason
}

func (a *App) localizedDriverNeedsUpdateTexts(actual string, expected string, affectedConnections int) (string, string) {
	reasonParts := []string{a.appText("driver_manager.backend.status.needs_update", nil)}
	if strings.TrimSpace(actual) != "" {
		reasonParts = append(reasonParts, a.appText("driver_manager.backend.status.installed_revision", map[string]any{"revision": strings.TrimSpace(actual)}))
	}
	if strings.TrimSpace(expected) != "" {
		reasonParts = append(reasonParts, a.appText("driver_manager.backend.status.expected_revision", map[string]any{"revision": strings.TrimSpace(expected)}))
	}
	reason := strings.Join(reasonParts, " ")
	messageParts := []string{reason}
	if affectedConnections > 0 {
		messageParts = append(messageParts, a.appText("driver_manager.backend.status.affected_connections", map[string]any{"count": affectedConnections}))
	}
	return reason, strings.Join(messageParts, " ")
}

func (a *App) SelectDriverPackageFile(currentPath string) connection.QueryResult {
	defaultDir := strings.TrimSpace(currentPath)
	if defaultDir == "" {
		defaultDir = defaultDriverDownloadDirectory()
	}
	if filepath.Ext(defaultDir) != "" {
		defaultDir = filepath.Dir(defaultDir)
	}
	if !filepath.IsAbs(defaultDir) {
		if abs, err := filepath.Abs(defaultDir); err == nil {
			defaultDir = abs
		}
	}

	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            a.appText("driver_manager.backend.dialog.select_package_file", nil),
		DefaultDirectory: defaultDir,
	})
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if strings.TrimSpace(selection) == "" {
		return connection.QueryResult{Success: false, Message: "已取消"}
	}

	if abs, err := filepath.Abs(selection); err == nil {
		selection = abs
	}
	if err := a.localizeLocalDriverPackagePathError(validateLocalDriverPackagePath(selection)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: map[string]interface{}{"path": selection}}
}

func (a *App) SelectDriverPackageDirectory(currentPath string) connection.QueryResult {
	defaultDir := strings.TrimSpace(currentPath)
	if defaultDir == "" {
		defaultDir = defaultDriverDownloadDirectory()
	}
	if filepath.Ext(defaultDir) != "" {
		defaultDir = filepath.Dir(defaultDir)
	}
	if !filepath.IsAbs(defaultDir) {
		if abs, err := filepath.Abs(defaultDir); err == nil {
			defaultDir = abs
		}
	}

	selection, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            a.appText("driver_manager.backend.dialog.select_package_directory", nil),
		DefaultDirectory: defaultDir,
	})
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if strings.TrimSpace(selection) == "" {
		return connection.QueryResult{Success: false, Message: "已取消"}
	}
	if abs, err := filepath.Abs(selection); err == nil {
		selection = abs
	}
	return connection.QueryResult{Success: true, Data: map[string]interface{}{"path": selection}}
}

func (a *App) OpenDriverDownloadDirectory(directory string) connection.QueryResult {
	resolved, err := resolveDriverDownloadDirectory(directory)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if err := os.MkdirAll(resolved, 0o755); err != nil {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.create_directory_failed", map[string]any{"detail": err.Error()})}
	}

	var cmd *exec.Cmd
	switch stdRuntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", resolved)
	case "windows":
		cmd = exec.Command("explorer", resolved)
	case "linux":
		cmd = exec.Command("xdg-open", resolved)
	default:
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.open_directory_unsupported", map[string]any{"platform": stdRuntime.GOOS})}
	}
	if err := cmd.Start(); err != nil {
		logger.Error(err, "打开驱动目录失败")
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.open_directory_failed", map[string]any{"detail": err.Error()})}
	}
	return connection.QueryResult{
		Success: true,
		Message: a.appText("driver_manager.backend.message.opened_directory", map[string]any{"path": resolved}),
		Data:    map[string]interface{}{"path": resolved},
	}
}

func (a *App) ResolveDriverDownloadDirectory(directory string) connection.QueryResult {
	resolved, err := resolveDriverDownloadDirectory(directory)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: map[string]interface{}{"path": resolved}}
}

func (a *App) ConfigureDriverRuntimeDirectory(directory string) connection.QueryResult {
	resolved, err := resolveDriverDownloadDirectory(directory)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	db.SetExternalDriverDownloadDirectory(resolved)
	return connection.QueryResult{
		Success: true,
		Data: map[string]interface{}{
			"path":          resolved,
			"defaultPath":   defaultDriverDownloadDirectory(),
			"isDefaultPath": strings.TrimSpace(directory) == "",
		},
		Message: a.appText("driver_manager.backend.message.runtime_directory_configured", nil),
	}
}

func (a *App) ResolveDriverRepositoryURL(repositoryURL string) connection.QueryResult {
	resolved, err := resolveDriverRepositoryURL(repositoryURL)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: map[string]interface{}{"url": resolved}}
}

func (a *App) ResolveDriverPackageDownloadURL(driverType string, repositoryURL string) connection.QueryResult {
	effectivePackages, manifestErr := resolveEffectiveDriverPackages(repositoryURL)
	definition, ok := resolveDriverDefinitionWithPackages(driverType, effectivePackages)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.unsupported_driver_type", nil)}
	}
	engine := effectiveDriverEngine(definition)
	if definition.BuiltIn {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.builtin_download_not_required", nil)}
	}
	if err := a.localizeDriverSelectionError(definition, ensureOptionalDriverBuildAvailable(definition)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if engine == driverEngineGo && !definition.BuiltIn {
		urlText := strings.TrimSpace(definition.DefaultDownloadURL)
		if urlText == "" {
			urlText = fmt.Sprintf("builtin://activate/%s", optionalDriverPublicTypeName(definition.Type))
		}
		data := map[string]interface{}{
			"url":           urlText,
			"driverType":    definition.Type,
			"driverName":    definition.Name,
			"engine":        engine,
			"manifestError": errorMessage(manifestErr),
		}
		if strings.TrimSpace(definition.DownloadSHA256) != "" {
			data["sha256"] = strings.TrimSpace(definition.DownloadSHA256)
		}
		return connection.QueryResult{Success: true, Data: data}
	}
	return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.optional_go_only", nil)}
}

func (a *App) GetDriverVersionList(driverType string, repositoryURL string) connection.QueryResult {
	effectivePackages, manifestErr := resolveEffectiveDriverPackages(repositoryURL)
	definition, ok := resolveDriverDefinitionWithPackages(driverType, effectivePackages)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.unsupported_driver_type", nil)}
	}
	if definition.BuiltIn {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.builtin_version_not_required", nil)}
	}
	if err := a.localizeDriverSelectionError(definition, ensureOptionalDriverBuildAvailable(definition)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	options, err := resolveDriverVersionOptions(definition, repositoryURL)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{
		Success: true,
		Data: map[string]interface{}{
			"driverType":    definition.Type,
			"driverName":    definition.Name,
			"pinnedVersion": definition.PinnedVersion,
			"manifestError": errorMessage(manifestErr),
			"versions":      options,
		},
	}
}

func (a *App) GetDriverVersionPackageSize(driverType string, version string) connection.QueryResult {
	definition, ok := resolveDriverDefinition(driverType)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.unsupported_driver_type", nil)}
	}
	if definition.BuiltIn {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.builtin_package_not_required", nil)}
	}

	normalizedType := normalizeDriverType(definition.Type)
	if normalizedType == "" || !db.IsOptionalGoDriver(normalizedType) {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.package_size_unsupported", nil)}
	}

	normalizedVersion := normalizeVersion(strings.TrimSpace(version))
	if normalizedVersion == "" {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.version_empty", nil)}
	}
	if err := a.localizeDriverSelectionError(definition, validateDriverSelectedVersion(definition, normalizedVersion)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	assetName := optionalDriverReleaseAssetNameForVersion(normalizedType, normalizedVersion)
	if strings.TrimSpace(assetName) == "" {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.asset_name_empty", nil)}
	}

	tag := "v" + normalizedVersion
	sizeBytes := int64(0)
	sizeSource := ""
	if sizeByAsset, _, err := loadReleaseAssetSizesCached("tag:"+tag, func() (*githubRelease, error) {
		return fetchReleaseByTag(tag)
	}); err == nil {
		sizeBytes = resolveOptionalDriverAssetSizeForVersion(sizeByAsset, normalizedType, normalizedVersion)
		if sizeBytes > 0 {
			sizeSource = "tag"
		}
	}
	allowLatestFallback := sameDriverVersion(normalizedVersion, definition.PinnedVersion) || sameDriverVersion(normalizedVersion, latestDriverVersionMap[normalizedType])
	if sizeBytes <= 0 && allowLatestFallback {
		if sizeByAsset, _, err := loadReleaseAssetSizesCached("latest", fetchLatestReleaseForDriverAssets); err == nil {
			sizeBytes = resolveOptionalDriverAssetSizeForVersion(sizeByAsset, normalizedType, normalizedVersion)
			if sizeBytes > 0 {
				sizeSource = "latest"
			}
		}
	}
	data := map[string]interface{}{
		"driverType":       normalizedType,
		"version":          normalizedVersion,
		"packageSizeBytes": sizeBytes,
		"packageSizeText":  "",
		"releaseAssetName": assetName,
		"releaseAssetTag":  tag,
		"sizeSource":       sizeSource,
	}
	if sizeBytes > 0 {
		data["packageSizeText"] = formatSizeMB(sizeBytes)
	}
	return connection.QueryResult{Success: true, Data: data}
}

func (a *App) GetDriverStatusList(downloadDir string, manifestURL string) connection.QueryResult {
	resolvedDir, err := resolveDriverDownloadDirectory(downloadDir)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	db.SetExternalDriverDownloadDirectory(resolvedDir)

	effectivePackages, manifestErr := resolveEffectiveDriverPackages(manifestURL)
	definitions := allDriverDefinitionsWithPackages(effectivePackages)
	triggerDriverVersionMetadataWarmup(definitions)
	packageSizeBytesMap := preloadOptionalDriverPackageSizes(definitions)
	usageCounts := a.savedConnectionDriverUsageCounts()
	items := make([]driverStatusItem, 0, len(definitions))
	for _, definition := range definitions {
		engine := effectiveDriverEngine(definition)
		runtimeAvailable, runtimeReason := db.DriverRuntimeSupportStatus(definition.Type)
		pkg, packageMetaExists := readInstalledDriverPackage(resolvedDir, definition.Type)
		needsUpdate, updateReason, expectedRevision := optionalDriverPackageUpdateStatus(definition, pkg, packageMetaExists)
		packageInstalled := definition.BuiltIn || packageMetaExists
		if runtimeAvailable && db.IsOptionalGoDriver(definition.Type) {
			packageInstalled = true
		}

		item := driverStatusItem{
			Type:                definition.Type,
			Name:                definition.Name,
			Engine:              engine,
			BuiltIn:             definition.BuiltIn,
			PinnedVersion:       definition.PinnedVersion,
			InstalledVersion:    strings.TrimSpace(pkg.Version),
			PackageSizeText:     resolveDriverPackageSizeText(definition, pkg, packageMetaExists, packageSizeBytesMap),
			RuntimeAvailable:    runtimeAvailable,
			PackageInstalled:    packageInstalled,
			Connectable:         runtimeAvailable,
			DefaultDownloadURL:  definition.DefaultDownloadURL,
			InstallDir:          driverInstallDir(resolvedDir, definition.Type),
			AgentRevision:       strings.TrimSpace(pkg.AgentRevision),
			ExpectedRevision:    expectedRevision,
			NeedsUpdate:         needsUpdate,
			UpdateReason:        updateReason,
			AffectedConnections: usageCounts[normalizeDriverType(definition.Type)],
		}
		if !runtimeAvailable && db.IsOptionalGoDriver(definition.Type) && !db.IsOptionalGoDriverBuildIncluded(definition.Type) {
			item.ReasonCode = driverStatusReasonSlimBuildMissingDriver
		}
		if packageMetaExists {
			item.PackagePath = pkg.FilePath
			item.PackageFileName = pkg.FileName
			item.DownloadedAt = pkg.DownloadedAt
			item.ExecutablePath = pkg.ExecutablePath
		}
		runtimeReason = a.localizeDriverRuntimeReason(definition, runtimeReason)
		if needsUpdate {
			item.UpdateReason, item.Message = a.localizedDriverNeedsUpdateTexts(item.AgentRevision, expectedRevision, item.AffectedConnections)
		}

		switch {
		case definition.BuiltIn:
			item.Message = a.appText("driver_manager.backend.status.built_in_available", nil)
		case needsUpdate:
			// item.UpdateReason / item.Message already localized above.
		case runtimeAvailable:
			item.Message = a.appText("driver_manager.backend.status.optional_enabled", nil)
		case packageInstalled && strings.TrimSpace(runtimeReason) != "":
			item.Message = runtimeReason
		case packageInstalled:
			if item.InstalledVersion != "" {
				item.Message = a.appText("driver_manager.backend.status.installed_pending_with_version", map[string]any{"version": item.InstalledVersion})
			} else {
				item.Message = a.appText("driver_manager.backend.status.installed_pending", nil)
			}
		case strings.TrimSpace(runtimeReason) != "":
			item.Message = runtimeReason
		default:
			if strings.TrimSpace(definition.PinnedVersion) != "" {
				item.Message = a.appText("driver_manager.backend.status.optional_disabled_with_version", map[string]any{"version": strings.TrimSpace(definition.PinnedVersion)})
			} else {
				item.Message = a.appText("driver_manager.backend.status.optional_disabled_generic", nil)
			}
		}

		items = append(items, item)
	}

	return connection.QueryResult{
		Success: true,
		Data: map[string]interface{}{
			"downloadDir":   resolvedDir,
			"drivers":       items,
			"manifestURL":   resolveManifestURLForView(manifestURL),
			"manifestError": errorMessage(manifestErr),
		},
	}
}

func (a *App) CheckDriverNetworkStatus() connection.QueryResult {
	checks := []driverNetworkProbeItem{
		{
			ProbeCode: driverNetworkProbeCodeGitHubAPI,
			Name:      "GitHub API",
			URL:       "https://api.github.com/rate_limit",
		},
		{
			ProbeCode: driverNetworkProbeCodeGitHubRelease,
			Name:      a.appText("driver_manager.backend.network.probe.github_driver_release", nil),
			URL:       driverReleaseLatestDownloadURL(optionalDriverBundleAssetName),
		},
		{
			ProbeCode: driverNetworkProbeCodeGitHubReleaseAsset,
			Name:      a.appText("driver_manager.backend.network.probe.github_release_asset_domain", nil),
			URL:       "https://release-assets.githubusercontent.com/",
		},
		{
			ProbeCode: driverNetworkProbeCodeGoModuleProxy,
			Name:      a.appText("driver_manager.backend.network.probe.go_module_proxy", nil),
			URL:       "https://proxy.golang.org/github.com/go-sql-driver/mysql/@v/list",
		},
	}

	client := newHTTPClientWithGlobalProxy(driverNetworkProbeTimeout)
	allReachable := true
	for index := range checks {
		checks[index] = probeDriverNetworkEndpoint(client, checks[index])
		if !checks[index].Reachable {
			allReachable = false
		}
	}
	findProbe := func(probeCode string) (driverNetworkProbeItem, bool) {
		for _, item := range checks {
			if strings.EqualFold(strings.TrimSpace(item.ProbeCode), strings.TrimSpace(probeCode)) {
				return item, true
			}
		}
		return driverNetworkProbeItem{}, false
	}
	githubAPICheck, _ := findProbe(driverNetworkProbeCodeGitHubAPI)
	githubReleaseCheck, _ := findProbe(driverNetworkProbeCodeGitHubRelease)
	releaseAssetsCheck, _ := findProbe(driverNetworkProbeCodeGitHubReleaseAsset)
	downloadChainReachable := githubReleaseCheck.Reachable && releaseAssetsCheck.Reachable

	proxyEnv := collectDriverProxyEnv()
	proxyConfigured := len(proxyEnv) > 0
	summary := a.appText("driver_manager.network.summary.reachable", nil)
	if githubAPICheck.Reachable && !downloadChainReachable {
		summary = a.appText("driver_manager.backend.network.summary.download_chain_unreachable", nil)
	} else if !allReachable {
		if proxyConfigured {
			summary = a.appText("driver_manager.network.summary.unreachable_proxy_configured", nil)
		} else {
			summary = a.appText("driver_manager.network.summary.proxy_recommended", nil)
		}
	}

	data := map[string]interface{}{
		"reachable":              allReachable,
		"summary":                summary,
		"recommendedProxy":       !allReachable,
		"proxyConfigured":        proxyConfigured,
		"proxyEnv":               proxyEnv,
		"downloadChainReachable": downloadChainReachable,
		"downloadRequiredHosts": []string{
			"github.com",
			"api.github.com",
			"release-assets.githubusercontent.com",
			"objects.githubusercontent.com",
			"raw.githubusercontent.com",
		},
		"checkedAt": time.Now().Format(time.RFC3339),
		"checks":    checks,
	}
	if logPath := strings.TrimSpace(logger.Path()); logPath != "" {
		data["logPath"] = logPath
	}
	return connection.QueryResult{
		Success: true,
		Data:    data,
	}
}

func (a *App) InstallLocalDriverPackage(driverType string, filePath string, downloadDir string, version string) connection.QueryResult {
	definition, ok := resolveDriverDefinition(driverType)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.unsupported_driver_type", nil)}
	}
	if definition.BuiltIn {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.builtin_install_not_required", nil)}
	}
	if err := a.localizeLocalDriverPackagePathError(validateLocalDriverPackagePath(filePath)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if err := a.localizeDriverSelectionError(definition, ensureOptionalDriverBuildAvailable(definition)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	engine := effectiveDriverEngine(definition)
	if !(engine == driverEngineGo && !definition.BuiltIn) {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.optional_go_only", nil)}
	}

	resolvedDir, err := resolveDriverDownloadDirectory(downloadDir)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	db.SetExternalDriverDownloadDirectory(resolvedDir)

	a.emitDriverDownloadProgress(definition.Type, "start", 0, 100, "开始安装本地驱动包")
	selectedVersion := resolveDriverInstallVersion(version, "local://manual", definition)
	if err := a.localizeDriverSelectionError(definition, validateDriverSelectedVersion(definition, selectedVersion)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	meta, installErr := installOptionalDriverAgentFromLocalPath(definition, filePath, resolvedDir, selectedVersion)
	if installErr != nil {
		errText := normalizeErrorMessage(installErr)
		a.emitDriverDownloadProgress(definition.Type, "error", 0, 0, errText)
		return connection.QueryResult{
			Success: false,
			Message: a.appText("driver_manager.backend.message.local_import_failed_detail", map[string]any{
				"detail": a.driverOperationErrorMessage(installErr, "导入本地驱动包失败，driver=%s file=%s", definition.Type, strings.TrimSpace(filePath)),
			}),
		}
	}
	a.emitDriverDownloadProgress(definition.Type, "downloading", 90, 100, "写入驱动元数据")
	if err := writeInstalledDriverPackage(resolvedDir, definition.Type, meta); err != nil {
		errText := normalizeErrorMessage(err)
		a.emitDriverDownloadProgress(definition.Type, "error", 0, 0, errText)
		return connection.QueryResult{
			Success: false,
			Message: a.appText("driver_manager.backend.message.metadata_write_failed_detail", map[string]any{
				"detail": a.driverOperationErrorMessage(err, "写入本地驱动元数据失败，driver=%s", definition.Type),
			}),
		}
	}
	a.emitDriverDownloadProgress(definition.Type, "done", 100, 100, "本地驱动包导入完成")

	return connection.QueryResult{Success: true, Message: a.appText("driver_manager.backend.message.driver_install_success", nil), Data: map[string]interface{}{
		"driverType": definition.Type,
		"driverName": definition.Name,
		"engine":     engine,
	}}
}

func (a *App) DownloadDriverPackage(driverType string, version string, downloadURL string, downloadDir string) connection.QueryResult {
	definition, ok := resolveDriverDefinition(driverType)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.unsupported_driver_type", nil)}
	}
	engine := effectiveDriverEngine(definition)
	if definition.BuiltIn {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.builtin_download_not_required", nil)}
	}
	if err := a.localizeDriverSelectionError(definition, ensureOptionalDriverBuildAvailable(definition)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if !(engine == driverEngineGo && !definition.BuiltIn) {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.optional_go_only", nil)}
	}

	urlText := strings.TrimSpace(downloadURL)
	if urlText == "" {
		urlText = strings.TrimSpace(definition.DefaultDownloadURL)
	}
	if urlText == "" {
		urlText = fmt.Sprintf("builtin://activate/%s", optionalDriverPublicTypeName(definition.Type))
	}
	selectedVersion := resolveDriverInstallVersion(version, urlText, definition)
	if err := a.localizeDriverSelectionError(definition, validateDriverSelectedVersion(definition, selectedVersion)); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	resolvedDir, err := resolveDriverDownloadDirectory(downloadDir)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	db.SetExternalDriverDownloadDirectory(resolvedDir)

	if db.IsOptionalGoDriver(definition.Type) {
		displayName := a.driverStatusDisplayName(definition)
		a.emitDriverDownloadProgress(definition.Type, "start", 0, 100, a.appText("driver_manager.progress.agent_install_start", map[string]any{"name": displayName}))
		meta, installErr := installOptionalDriverAgentPackage(a, definition, selectedVersion, resolvedDir, urlText)
		if installErr != nil {
			errText := normalizeErrorMessage(installErr)
			a.emitDriverDownloadProgress(definition.Type, "error", 0, 0, errText)
			return connection.QueryResult{
				Success: false,
				Message: a.appText("driver_manager.backend.message.download_failed_detail", map[string]any{
					"detail": a.driverOperationErrorMessage(installErr, "驱动下载安装失败，driver=%s version=%s url=%s", definition.Type, selectedVersion, urlText),
				}),
			}
		}
		a.emitDriverDownloadProgress(definition.Type, "downloading", 95, 100, a.appText("driver_manager.progress.metadata_write", nil))
		if writeErr := writeInstalledDriverPackage(resolvedDir, definition.Type, meta); writeErr != nil {
			errText := normalizeErrorMessage(writeErr)
			a.emitDriverDownloadProgress(definition.Type, "error", 0, 0, errText)
			return connection.QueryResult{
				Success: false,
				Message: a.appText("driver_manager.backend.message.metadata_write_failed_detail", map[string]any{
					"detail": a.driverOperationErrorMessage(writeErr, "写入驱动元数据失败，driver=%s version=%s", definition.Type, selectedVersion),
				}),
			}
		}
		a.emitDriverDownloadProgress(definition.Type, "done", 100, 100, a.appText("driver_manager.progress.agent_install_done", map[string]any{"name": displayName}))
		return connection.QueryResult{Success: true, Message: a.appText("driver_manager.backend.message.driver_install_success", nil), Data: map[string]interface{}{
			"driverType": definition.Type,
			"driverName": definition.Name,
			"engine":     engine,
		}}
	}

	a.emitDriverDownloadProgress(definition.Type, "start", 0, 0, a.appText("driver_manager.progress.install_start", nil))
	meta := installedDriverPackage{
		DriverType:   definition.Type,
		Version:      selectedVersion,
		FilePath:     "",
		FileName:     "embedded-go-driver",
		DownloadURL:  urlText,
		SHA256:       "",
		DownloadedAt: time.Now().Format(time.RFC3339),
	}
	if err := writeInstalledDriverPackage(resolvedDir, definition.Type, meta); err != nil {
		errText := normalizeErrorMessage(err)
		a.emitDriverDownloadProgress(definition.Type, "error", 0, 0, errText)
		return connection.QueryResult{
			Success: false,
			Message: a.appText("driver_manager.backend.message.metadata_write_failed_detail", map[string]any{
				"detail": a.driverOperationErrorMessage(err, "写入驱动元数据失败，driver=%s version=%s", definition.Type, selectedVersion),
			}),
		}
	}
	a.emitDriverDownloadProgress(definition.Type, "done", 1, 1, a.appText("driver_manager.progress.pure_go_enabled", nil))

	return connection.QueryResult{Success: true, Message: a.appText("driver_manager.backend.message.driver_install_success", nil), Data: map[string]interface{}{
		"driverType": definition.Type,
		"driverName": definition.Name,
		"engine":     engine,
	}}
}

func (a *App) RemoveDriverPackage(driverType string, downloadDir string) connection.QueryResult {
	definition, ok := resolveDriverDefinition(driverType)
	if !ok {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.unsupported_driver_type", nil)}
	}
	if definition.BuiltIn {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.builtin_remove_not_allowed", nil)}
	}

	resolvedDir, err := resolveDriverDownloadDirectory(downloadDir)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	db.SetExternalDriverDownloadDirectory(resolvedDir)

	driverDir := driverInstallDir(resolvedDir, definition.Type)
	if err := os.RemoveAll(driverDir); err != nil {
		return connection.QueryResult{Success: false, Message: a.appText("driver_manager.backend.error.remove_package_failed", map[string]any{
			"detail": a.driverOperationErrorMessage(err, "移除驱动包失败，driver=%s path=%s", definition.Type, driverDir),
		})}
	}

	return connection.QueryResult{Success: true, Message: a.appText("driver_manager.backend.message.package_removed", nil), Data: map[string]interface{}{
		"driverType": definition.Type,
		"driverName": definition.Name,
	}}
}

func (a *App) emitDriverDownloadProgress(driverType string, status string, downloaded, total int64, message string) {
	if a.ctx == nil {
		return
	}
	payload := driverDownloadProgressPayload{
		DriverType: normalizeDriverType(driverType),
		Status:     strings.TrimSpace(status),
		Percent:    0,
		Downloaded: downloaded,
		Total:      total,
		Message:    strings.TrimSpace(message),
	}
	if payload.DriverType == "" {
		payload.DriverType = "unknown"
	}
	if payload.Status == "" {
		payload.Status = "downloading"
	}
	if total > 0 {
		payload.Percent = (float64(downloaded) / float64(total)) * 100
		if payload.Percent < 0 {
			payload.Percent = 0
		}
		if payload.Percent > 100 {
			payload.Percent = 100
		}
	}
	if payload.Status == "done" && payload.Percent < 100 {
		payload.Percent = 100
	}
	runtime.EventsEmit(a.ctx, driverDownloadProgressEvent, payload)
}

func probeDriverNetworkEndpoint(client *http.Client, item driverNetworkProbeItem) driverNetworkProbeItem {
	probed := item
	probed.Reachable = false
	probed.HTTPStatus = 0
	probed.Error = ""
	probed.LatencyMs = 0
	probed.TCPLatency = 0
	probed.HTTPLatency = 0
	probed.Method = ""

	urlText := strings.TrimSpace(item.URL)
	if urlText == "" {
		probed.Error = "检测地址为空"
		return probed
	}

	if tcpLatency, tcpErr := probeDriverTCPLatency(urlText); tcpErr == nil {
		probed.TCPLatency = tcpLatency
		probed.LatencyMs = tcpLatency
	}

	if client == nil {
		client = newHTTPClientWithGlobalProxy(driverNetworkProbeTimeout)
	}
	start := time.Now()
	resp, method, err := doDriverProbeRequest(client, urlText, http.MethodGet)
	if err != nil || shouldFallbackHeadProbe(resp) {
		if resp != nil {
			_ = resp.Body.Close()
		}
		// 回退到 HEAD 时重置计时，避免把失败重试耗时累计到最终延迟指标里。
		start = time.Now()
		resp, method, err = doDriverProbeRequest(client, urlText, http.MethodHead)
	}
	probed.HTTPLatency = time.Since(start).Milliseconds()
	if probed.LatencyMs <= 0 {
		probed.LatencyMs = probed.HTTPLatency
	}
	if err != nil {
		probed.Error = normalizeDriverNetworkError(err)
		return probed
	}
	defer resp.Body.Close()
	probed.Method = method

	probed.HTTPStatus = resp.StatusCode
	if resp.StatusCode >= 500 {
		probed.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
		return probed
	}
	probed.Reachable = true
	return probed
}

func probeDriverTCPLatency(rawURL string) (int64, error) {
	dialAddr, err := resolveDriverProbeDialAddress(rawURL)
	if err != nil {
		return 0, err
	}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", dialAddr, driverNetworkProbeTCPTimeout)
	elapsed := time.Since(start)
	latency := elapsed.Milliseconds()
	if elapsed > 0 && latency <= 0 {
		latency = 1
	}
	if err != nil {
		return latency, err
	}
	_ = conn.Close()
	return latency, nil
}

func resolveDriverProbeDialAddress(rawURL string) (string, error) {
	urlText := strings.TrimSpace(rawURL)
	if urlText == "" {
		return "", fmt.Errorf("检测地址为空")
	}
	parsed, err := url.Parse(urlText)
	if err != nil {
		return "", err
	}

	targetHost := strings.TrimSpace(parsed.Hostname())
	if targetHost == "" {
		return "", fmt.Errorf("检测地址缺少主机")
	}
	targetPort := strings.TrimSpace(parsed.Port())
	if targetPort == "" {
		if strings.EqualFold(parsed.Scheme, "http") {
			targetPort = "80"
		} else {
			targetPort = "443"
		}
	}

	if proxyURL := resolveDriverProbeProxyURL(parsed); proxyURL != nil {
		proxyHost := strings.TrimSpace(proxyURL.Hostname())
		if proxyHost == "" {
			return net.JoinHostPort(targetHost, targetPort), nil
		}
		proxyPort := strings.TrimSpace(proxyURL.Port())
		if proxyPort == "" {
			proxyPort = defaultPortForScheme(proxyURL.Scheme)
		}
		return net.JoinHostPort(proxyHost, proxyPort), nil
	}

	return net.JoinHostPort(targetHost, targetPort), nil
}

func resolveDriverProbeProxyURL(target *url.URL) *url.URL {
	if target == nil {
		return nil
	}

	snapshot := currentGlobalProxyConfig()
	if snapshot.Enabled {
		proxyURL, err := buildProxyURLFromConfig(snapshot.Proxy)
		if err == nil {
			return proxyURL
		}
	}

	req := &http.Request{URL: target}
	proxyURL, err := http.ProxyFromEnvironment(req)
	if err != nil {
		return nil
	}
	return proxyURL
}

func defaultPortForScheme(scheme string) string {
	switch strings.ToLower(strings.TrimSpace(scheme)) {
	case "https":
		return "443"
	case "socks5", "socks5h":
		return "1080"
	case "http":
		fallthrough
	default:
		return "80"
	}
}

func doDriverProbeRequest(client *http.Client, urlText string, method string) (*http.Response, string, error) {
	req, err := http.NewRequest(method, urlText, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "GoNavi-DriverManager")
	// 用 GET+Range 探测可更接近真实下载链路，同时避免下载正文。
	if strings.EqualFold(method, http.MethodGet) {
		req.Header.Set("Range", "bytes=0-0")
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, method, err
	}
	return resp, method, nil
}

func shouldFallbackHeadProbe(resp *http.Response) bool {
	if resp == nil {
		return false
	}
	return resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented
}

func normalizeDriverNetworkError(err error) string {
	if err == nil {
		return ""
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "网络连接超时"
	}
	return normalizeErrorMessage(err)
}

func collectDriverProxyEnv() map[string]string {
	keys := []string{
		"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
		"http_proxy", "https_proxy", "all_proxy", "no_proxy",
	}
	result := make(map[string]string)
	for _, key := range keys {
		value := strings.TrimSpace(os.Getenv(key))
		if value == "" {
			continue
		}
		result[key] = value
	}
	return result
}

func driverLogHint() string {
	path := strings.TrimSpace(logger.Path())
	if path == "" {
		return ""
	}
	return fmt.Sprintf("（详细日志：%s）", path)
}

func logDriverOperationError(err error, format string, args ...interface{}) string {
	message := normalizeErrorMessage(err)
	if strings.TrimSpace(message) == "" {
		message = "未知错误"
	}
	logger.Error(err, format, args...)
	return strings.TrimSpace(message) + driverLogHint()
}

func defaultDriverDownloadDirectory() string {
	root, err := db.ResolveExternalDriverRoot("")
	if err == nil && strings.TrimSpace(root) != "" {
		return root
	}
	return filepath.Join(os.TempDir(), "gonavi-drivers")
}

func resolveDriverDownloadDirectory(directory string) (string, error) {
	return db.ResolveExternalDriverRoot(directory)
}

func normalizeDriverType(driverType string) string {
	normalized := strings.ToLower(strings.TrimSpace(driverType))
	switch normalized {
	case "doris":
		return "diros"
	case "postgresql":
		return "postgres"
	case "opengauss", "open_gauss", "open-gauss":
		return "opengauss"
	case "gaussdb", "gauss_db", "gauss-db":
		return "gaussdb"
	case "goldendb", "greatdb", "gdb":
		return "goldendb"
	case "rocketmq", "rocket-mq", "rocket_mq", "apache-rocketmq", "apache_rocketmq", "rmq":
		return "rocketmq"
	case "mqtt", "mqtts":
		return "mqtt"
	case "kafka", "apache-kafka", "apache_kafka":
		return "kafka"
	case "rabbitmq", "rabbit-mq", "rabbit_mq":
		return "rabbitmq"
	case "intersystems", "intersystemsiris", "inter-systems-iris", "inter-systems":
		return "iris"
	default:
		return normalized
	}
}

func normalizeDriverEngine(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case driverEngineGo:
		return driverEngineGo
	case "jdbc":
		return driverEngineExternal
	case driverEngineExternal, "exec", "binary":
		return driverEngineExternal
	default:
		return ""
	}
}

func normalizeDriverChecksumPolicy(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case driverChecksumPolicyStrict:
		return driverChecksumPolicyStrict
	case driverChecksumPolicyOff:
		return driverChecksumPolicyOff
	case driverChecksumPolicyWarn:
		return driverChecksumPolicyWarn
	default:
		return driverChecksumPolicyWarn
	}
}

func effectiveDriverEngine(definition driverDefinition) string {
	if definition.BuiltIn {
		return driverEngineGo
	}
	engine := normalizeDriverEngine(definition.Engine)
	if engine == "" {
		return driverEngineExternal
	}
	return engine
}

func resolveDriverDefinition(driverType string) (driverDefinition, bool) {
	effectivePackages, err := resolveEffectiveDriverPackages("")
	if err == nil {
		return resolveDriverDefinitionWithPackages(driverType, effectivePackages)
	}
	return resolveDriverDefinitionWithPackages(driverType, nil)
}

func resolveDriverDefinitionWithPackages(driverType string, packages map[string]pinnedDriverPackage) (driverDefinition, bool) {
	normalized := normalizeDriverType(driverType)
	for _, definition := range allDriverDefinitionsWithPackages(packages) {
		if normalizeDriverType(definition.Type) == normalized {
			return definition, true
		}
	}
	return driverDefinition{}, false
}

func allDriverDefinitionsWithPackages(packages map[string]pinnedDriverPackage) []driverDefinition {
	return []driverDefinition{
		{Type: "mysql", Name: "MySQL", Engine: driverEngineGo, BuiltIn: true},
		{Type: "goldendb", Name: "GoldenDB", Engine: driverEngineGo, BuiltIn: true},
		{Type: "oracle", Name: "Oracle", Engine: driverEngineGo, BuiltIn: true},
		{Type: "redis", Name: "Redis", Engine: driverEngineGo, BuiltIn: true},
		{Type: "postgres", Name: "PostgreSQL", Engine: driverEngineGo, BuiltIn: true},
		{Type: "rocketmq", Name: "RocketMQ", Engine: driverEngineGo, BuiltIn: true},
		{Type: "mqtt", Name: "MQTT", Engine: driverEngineGo, BuiltIn: true},
		{Type: "kafka", Name: "Kafka", Engine: driverEngineGo, BuiltIn: true},
		{Type: "rabbitmq", Name: "RabbitMQ", Engine: driverEngineGo, BuiltIn: true},

		// 其他数据源需要先在驱动管理中“安装启用”。
		buildOptionalGoDriverDefinition("mariadb", "MariaDB", packages),
		buildOptionalGoDriverDefinition("oceanbase", "OceanBase", packages),
		buildOptionalGoDriverDefinition("diros", "Doris", packages),
		buildOptionalGoDriverDefinition("starrocks", "StarRocks", packages),
		buildOptionalGoDriverDefinition("sphinx", "Sphinx", packages),
		buildOptionalGoDriverDefinition("sqlserver", "SQL Server", packages),
		buildOptionalGoDriverDefinition("sqlite", "SQLite", packages),
		buildOptionalGoDriverDefinition("duckdb", "DuckDB", packages),
		buildOptionalGoDriverDefinition("dameng", "Dameng", packages),
		buildOptionalGoDriverDefinition("kingbase", "Kingbase", packages),
		buildOptionalGoDriverDefinition("highgo", "HighGo", packages),
		buildOptionalGoDriverDefinition("vastbase", "Vastbase", packages),
		buildOptionalGoDriverDefinition("opengauss", "OpenGauss", packages),
		buildOptionalGoDriverDefinition("gaussdb", "GaussDB", packages),
		buildOptionalGoDriverDefinition("iris", "InterSystems IRIS", packages),
		buildOptionalGoDriverDefinition("mongodb", "MongoDB", packages),
		buildOptionalGoDriverDefinition("tdengine", "TDengine", packages),
		buildOptionalGoDriverDefinition("iotdb", "Apache IoTDB", packages),
		buildOptionalGoDriverDefinition("clickhouse", "ClickHouse", packages),
		buildOptionalGoDriverDefinition("elasticsearch", "Elasticsearch", packages),
	}
}

func buildOptionalGoDriverDefinition(driverType string, driverName string, packages map[string]pinnedDriverPackage) driverDefinition {
	spec := resolvedPinnedPackage(driverType, packages)
	return driverDefinition{
		Type:               normalizeDriverType(driverType),
		Name:               driverName,
		Engine:             driverEngineGo,
		BuiltIn:            false,
		PinnedVersion:      strings.TrimSpace(spec.Version),
		DefaultDownloadURL: strings.TrimSpace(spec.DownloadURL),
		DownloadSHA256:     strings.TrimSpace(spec.SHA256),
		ChecksumPolicy:     normalizeDriverChecksumPolicy(spec.Policy),
	}
}

func ensureOptionalDriverBuildAvailable(definition driverDefinition) error {
	driverType := normalizeDriverType(definition.Type)
	if !db.IsOptionalGoDriver(driverType) {
		return nil
	}
	if db.IsOptionalGoDriverBuildIncluded(driverType) {
		return nil
	}
	driverName := strings.TrimSpace(definition.Name)
	if driverName == "" {
		driverName = strings.TrimSpace(definition.Type)
	}
	return &driverBuildUnavailableError{Name: driverName}
}

func driverPinnedPackage(driverType string) pinnedDriverPackage {
	spec, ok := pinnedDriverPackageMap[normalizeDriverType(driverType)]
	if !ok {
		return pinnedDriverPackage{}
	}
	spec.Version = strings.TrimSpace(spec.Version)
	spec.DownloadURL = strings.TrimSpace(spec.DownloadURL)
	spec.SHA256 = strings.TrimSpace(spec.SHA256)
	spec.Policy = normalizeDriverChecksumPolicy(spec.Policy)
	spec.Engine = normalizeDriverEngine(spec.Engine)
	return spec
}

func resolvedPinnedPackage(driverType string, packages map[string]pinnedDriverPackage) pinnedDriverPackage {
	normalizedType := normalizeDriverType(driverType)
	spec := driverPinnedPackage(normalizedType)
	if packages != nil {
		override, ok := packages[normalizedType]
		if ok {
			if strings.TrimSpace(override.Version) != "" {
				spec.Version = strings.TrimSpace(override.Version)
			}
			if strings.TrimSpace(override.DownloadURL) != "" {
				spec.DownloadURL = strings.TrimSpace(override.DownloadURL)
			}
			if strings.TrimSpace(override.SHA256) != "" {
				spec.SHA256 = strings.TrimSpace(override.SHA256)
			}
			if strings.TrimSpace(override.Policy) != "" {
				spec.Policy = normalizeDriverChecksumPolicy(override.Policy)
			}
			if strings.TrimSpace(override.Engine) != "" {
				spec.Engine = normalizeDriverEngine(override.Engine)
			}
		}
	}
	if normalizedType == "postgres" {
		spec.Engine = driverEngineGo
		if strings.TrimSpace(spec.Version) == "" {
			spec.Version = "go-embedded"
		}
		if strings.TrimSpace(spec.Policy) == "" {
			spec.Policy = driverChecksumPolicyOff
		}
	}
	return spec
}

func copyPinnedPackageMap(source map[string]pinnedDriverPackage) map[string]pinnedDriverPackage {
	if len(source) == 0 {
		return map[string]pinnedDriverPackage{}
	}
	result := make(map[string]pinnedDriverPackage, len(source))
	for key, value := range source {
		result[key] = pinnedDriverPackage{
			Version:     strings.TrimSpace(value.Version),
			DownloadURL: strings.TrimSpace(value.DownloadURL),
			SHA256:      strings.TrimSpace(value.SHA256),
			Policy:      normalizeDriverChecksumPolicy(value.Policy),
			Engine:      normalizeDriverEngine(value.Engine),
		}
	}
	return result
}

func copyVersionPackageMap(source map[string][]pinnedDriverPackage) map[string][]pinnedDriverPackage {
	if len(source) == 0 {
		return map[string][]pinnedDriverPackage{}
	}
	result := make(map[string][]pinnedDriverPackage, len(source))
	for key, values := range source {
		if len(values) == 0 {
			result[key] = []pinnedDriverPackage{}
			continue
		}
		next := make([]pinnedDriverPackage, 0, len(values))
		for _, value := range values {
			next = append(next, pinnedDriverPackage{
				Version:     strings.TrimSpace(value.Version),
				DownloadURL: strings.TrimSpace(value.DownloadURL),
				SHA256:      strings.TrimSpace(value.SHA256),
				Policy:      normalizeDriverChecksumPolicy(value.Policy),
				Engine:      normalizeDriverEngine(value.Engine),
			})
		}
		result[key] = next
	}
	return result
}

func resolveEffectiveDriverPackages(manifestURL string) (map[string]pinnedDriverPackage, error) {
	effective := copyPinnedPackageMap(pinnedDriverPackageMap)
	manifestPackages, err := resolveManifestDriverPackages(manifestURL)
	if err != nil {
		return effective, err
	}
	for driverType, item := range manifestPackages {
		normalizedType := normalizeDriverType(driverType)
		base := effective[normalizedType]
		if strings.TrimSpace(item.Version) != "" {
			base.Version = strings.TrimSpace(item.Version)
		}
		if strings.TrimSpace(item.DownloadURL) != "" {
			base.DownloadURL = strings.TrimSpace(item.DownloadURL)
		}
		if strings.TrimSpace(item.SHA256) != "" {
			base.SHA256 = strings.TrimSpace(item.SHA256)
		}
		if strings.TrimSpace(item.Policy) != "" {
			base.Policy = normalizeDriverChecksumPolicy(item.Policy)
		}
		if strings.TrimSpace(item.Engine) != "" {
			base.Engine = normalizeDriverEngine(item.Engine)
		}
		effective[normalizedType] = base
	}
	return effective, nil
}

func resolveDriverVersionOptions(definition driverDefinition, repositoryURL string) ([]driverVersionOptionItem, error) {
	driverType := normalizeDriverType(definition.Type)
	if driverType == "" {
		return nil, fmt.Errorf("驱动类型为空")
	}

	optionMap := make(map[string]driverVersionOptionItem)
	optionKeys := make([]string, 0, 16)
	appendOption := func(version, downloadURL, sha256, source, year string) {
		versionText := strings.TrimSpace(version)
		urlText := strings.TrimSpace(downloadURL)
		if urlText == "" {
			urlText = strings.TrimSpace(definition.DefaultDownloadURL)
		}
		if urlText == "" && effectiveDriverEngine(definition) == driverEngineGo {
			urlText = fmt.Sprintf("builtin://activate/%s", optionalDriverPublicTypeName(driverType))
		}
		if versionText == "" {
			versionText = resolveDriverInstallVersion("", urlText, definition)
		}
		if versionText == "" && urlText == "" {
			return
		}
		if versionText != "" {
			if err := validateDriverSelectedVersion(definition, versionText); err != nil {
				return
			}
		}
		versionKey := normalizeVersion(versionText)
		key := ""
		if versionKey != "" {
			key = "v:" + strings.ToLower(versionKey)
		} else {
			key = "u:" + urlText
		}
		if existing, ok := optionMap[key]; ok {
			if existing.Year == "" && strings.TrimSpace(year) != "" {
				existing.Year = strings.TrimSpace(year)
				optionMap[key] = existing
			}
			return
		}
		optionMap[key] = driverVersionOptionItem{
			Version:     versionText,
			DownloadURL: urlText,
			SHA256:      strings.TrimSpace(sha256),
			Source:      strings.TrimSpace(source),
			Year:        strings.TrimSpace(year),
		}
		optionKeys = append(optionKeys, key)
	}

	manifestVersions, _ := resolveManifestDriverVersionPackages(repositoryURL)
	if values := manifestVersions[driverType]; len(values) > 0 {
		expectedEngine := effectiveDriverEngine(definition)
		for _, value := range values {
			engine := normalizeDriverEngine(value.Engine)
			if engine != "" && expectedEngine != "" && engine != expectedEngine {
				continue
			}
			appendOption(value.Version, value.DownloadURL, value.SHA256, "manifest", "")
		}
	}

	appendOption(definition.PinnedVersion, definition.DefaultDownloadURL, definition.DownloadSHA256, "pinned", "")
	for _, recent := range resolveRecentDriverVersionOptions(definition, driverRecentVersionLimit) {
		if sameDriverVersion(recent.Version, definition.PinnedVersion) {
			continue
		}
		appendOption(recent.Version, recent.DownloadURL, recent.SHA256, recent.Source, recent.Year)
	}

	if len(optionKeys) == 0 {
		return nil, fmt.Errorf("未找到可用驱动版本")
	}

	recommendedVersion := strings.TrimSpace(definition.PinnedVersion)
	recommendedIndex := -1
	if recommendedVersion != "" {
		for index, key := range optionKeys {
			option := optionMap[key]
			if strings.EqualFold(strings.TrimSpace(option.Version), recommendedVersion) {
				recommendedIndex = index
				break
			}
		}
	}
	if recommendedIndex == -1 {
		recommendedIndex = 0
	}

	result := make([]driverVersionOptionItem, 0, len(optionKeys))
	for index, key := range optionKeys {
		option := optionMap[key]
		option.Recommended = index == recommendedIndex
		sizeBytes := resolveDriverVersionPackageSizeBytes(definition, option)
		if sizeBytes > 0 {
			option.PackageSizeBytes = sizeBytes
			option.PackageSizeText = formatSizeMB(sizeBytes)
		}
		option.DisplayLabel = buildDriverVersionDisplayLabel(option)
		result = append(result, option)
	}
	return result, nil
}

func buildDriverVersionDisplayLabel(option driverVersionOptionItem) string {
	label := strings.TrimSpace(option.Version)
	if label == "" {
		label = "未标注版本"
	}
	if strings.EqualFold(strings.TrimSpace(option.Source), "latest") {
		label += "（最新）"
	}
	if option.Recommended {
		label += "（推荐）"
	}
	return label
}

func resolveRecentDriverVersionOptions(definition driverDefinition, limit int) []driverVersionOptionItem {
	metas := resolveRecentDriverVersionMetas(definition.Type, limit)
	if len(metas) == 0 {
		return nil
	}
	result := make([]driverVersionOptionItem, 0, len(metas))
	for index, meta := range metas {
		source := "history"
		if index == 0 {
			source = "latest"
		}
		versionText, urlText, ok := resolveVersionedDriverOption(definition, meta.Version, source)
		if !ok {
			continue
		}
		result = append(result, driverVersionOptionItem{
			Version:     versionText,
			DownloadURL: urlText,
			Source:      source,
			Year:        strings.TrimSpace(meta.Year),
		})
	}
	return result
}

func resolveVersionedDriverOption(definition driverDefinition, version string, source string) (string, string, bool) {
	driverType := normalizeDriverType(definition.Type)
	if driverType == "" {
		return "", "", false
	}
	versionText := normalizeVersion(strings.TrimSpace(version))
	if versionText == "" {
		return "", "", false
	}
	if err := validateDriverSelectedVersion(definition, versionText); err != nil {
		return "", "", false
	}

	if publishedURL, ok := resolvePublishedDriverDownloadURL(definition, versionText); ok {
		return versionText, publishedURL, true
	}
	if !optionalDriverSourceBuildAvailable(definition, versionText) {
		return "", "", false
	}

	urlText := strings.TrimSpace(definition.DefaultDownloadURL)
	if urlText == "" && effectiveDriverEngine(definition) == driverEngineGo {
		urlText = fmt.Sprintf("builtin://activate/%s", optionalDriverPublicTypeName(driverType))
	}
	if urlText == "" {
		return "", "", false
	}

	parsed, err := url.Parse(urlText)
	if err != nil || parsed == nil {
		return versionText, urlText, true
	}
	query := parsed.Query()
	channel := strings.TrimSpace(source)
	if channel == "" {
		channel = "history"
	}
	query.Set("channel", channel)
	query.Set("version", versionText)
	parsed.RawQuery = query.Encode()
	return versionText, parsed.String(), true
}

func sameDriverVersion(left, right string) bool {
	a := normalizeVersion(strings.TrimSpace(left))
	b := normalizeVersion(strings.TrimSpace(right))
	return a != "" && a == b
}

func validateDriverSelectedVersion(definition driverDefinition, version string) error {
	driverType := normalizeDriverType(definition.Type)
	versionText := normalizeVersion(strings.TrimSpace(version))
	if driverType == "" || versionText == "" {
		return nil
	}

	switch driverType {
	case "mongodb":
		if strings.HasPrefix(versionText, "2.") {
			return nil
		}
		if strings.HasPrefix(versionText, "1.17.") {
			return nil
		}
		return &driverVersionValidationError{
			DriverType: driverType,
			Version:    versionText,
		}
	default:
		return nil
	}
}

func shouldRestrictToExplicitVersionArtifact(definition driverDefinition, selectedVersion string) bool {
	versionText := normalizeVersion(strings.TrimSpace(selectedVersion))
	if versionText == "" {
		return false
	}
	return !sameDriverVersion(versionText, definition.PinnedVersion)
}

func optionalDriverSourceBuildAvailable(definition driverDefinition, selectedVersion string) bool {
	driverType := normalizeDriverType(definition.Type)
	if driverType == "" || !db.IsOptionalGoDriver(driverType) {
		return false
	}
	if _, err := optionalDriverBuildTags(driverType, selectedVersion); err != nil {
		return false
	}
	if _, err := exec.LookPath("go"); err != nil {
		return false
	}
	if _, err := locateProjectRootForAgentBuild(); err != nil {
		return false
	}
	return true
}

func resolvePublishedDriverDownloadURL(definition driverDefinition, version string) (string, bool) {
	versionText := normalizeVersion(strings.TrimSpace(version))
	if versionText == "" {
		return "", false
	}

	return resolvePublishedDriverDownloadURLForTag(definition, versionText, "v"+versionText)
}

func resolvePublishedDriverDownloadURLForTag(definition driverDefinition, selectedVersion string, tag string) (string, bool) {
	driverType := normalizeDriverType(definition.Type)
	tagName := strings.TrimSpace(tag)
	if driverType == "" || tagName == "" {
		return "", false
	}

	assetName, ok := resolvePublishedDriverReleaseAssetName(driverType, selectedVersion, tagName)
	if !ok {
		return "", false
	}
	return driverReleaseDownloadURL(tagName, assetName), true
}

func resolvePublishedDriverReleaseAssetName(driverType string, version string, tag string) (string, bool) {
	if shouldUseDuckDBWindowsDynamicLibrary(driverType) {
		cacheKey := "tag:" + strings.TrimSpace(tag)
		if sizeByAsset, publishedAssets, ok := readReleaseAssetSizesFromCache(cacheKey); ok {
			if publishedAssets[duckDBWindowsDriverZipAssetName] && sizeByAsset[duckDBWindowsDriverZipAssetName] > 0 {
				return duckDBWindowsDriverZipAssetName, true
			}
			return "", false
		}

		sizeByAsset, publishedAssets, err := loadReleaseAssetSizesCached(cacheKey, func() (*githubRelease, error) {
			return fetchReleaseByTag(tag)
		})
		if err != nil {
			return "", false
		}
		if publishedAssets[duckDBWindowsDriverZipAssetName] && sizeByAsset[duckDBWindowsDriverZipAssetName] > 0 {
			return duckDBWindowsDriverZipAssetName, true
		}
		return "", false
	}

	assetNames := optionalDriverReleaseAssetNamesForVersion(driverType, version)
	if len(assetNames) == 0 {
		return "", false
	}

	cacheKey := "tag:" + strings.TrimSpace(tag)
	if sizeByAsset, publishedAssets, ok := readReleaseAssetSizesFromCache(cacheKey); ok {
		for _, assetName := range assetNames {
			if publishedAssets[assetName] && sizeByAsset[assetName] > 0 {
				return assetName, true
			}
		}
		return "", false
	}

	sizeByAsset, publishedAssets, err := loadReleaseAssetSizesCached(cacheKey, func() (*githubRelease, error) {
		return fetchReleaseByTag(tag)
	})
	if err != nil {
		return "", false
	}
	for _, assetName := range assetNames {
		if publishedAssets[assetName] && sizeByAsset[assetName] > 0 {
			return assetName, true
		}
	}
	return "", false
}

func resolveDriverVersionPackageSizeBytes(definition driverDefinition, option driverVersionOptionItem) int64 {
	driverType := normalizeDriverType(definition.Type)
	if driverType == "" || definition.BuiltIn {
		return 0
	}
	if !db.IsOptionalGoDriver(driverType) {
		return 0
	}

	version := normalizeVersion(strings.TrimSpace(option.Version))
	if version == "" {
		return 0
	}
	assetNames := optionalDriverReleaseAssetNamesForVersion(driverType, version)
	if len(assetNames) == 0 {
		return 0
	}

	tag := "v" + version
	if sizeByAsset, _, ok := readReleaseAssetSizesFromCache("tag:" + tag); ok {
		return resolveOptionalDriverAssetSizeForVersion(sizeByAsset, driverType, version)
	}

	// 下拉版本列表要求快速返回：仅复用已有缓存，不在这里触发网络请求。
	if strings.EqualFold(strings.TrimSpace(option.Source), "latest") {
		if sizeByAsset, _, ok := readReleaseAssetSizesFromCache("latest"); ok {
			return resolveOptionalDriverAssetSizeForVersion(sizeByAsset, driverType, version)
		}
	}
	return 0
}

func resolveRecentDriverVersionMetas(driverType string, limit int) []goModuleVersionMeta {
	if limit <= 0 {
		limit = driverRecentVersionLimit
	}
	normalized := normalizeDriverType(driverType)
	if normalized == "" {
		return nil
	}
	modulePaths := resolveDriverGoModulePaths(normalized)
	if len(modulePaths) > 0 {
		extraHistoryLimit := resolveDriverExtraHistoryLimit(normalized)
		primaryLimit := limit + extraHistoryLimit
		if primaryLimit <= 0 {
			primaryLimit = limit
		}
		result := make([]goModuleVersionMeta, 0, primaryLimit)
		seen := make(map[string]struct{}, primaryLimit)
		appendUnique := func(values []goModuleVersionMeta, maxAppend int) {
			if maxAppend <= 0 {
				return
			}
			appended := 0
			for _, meta := range values {
				version := normalizeVersion(strings.TrimSpace(meta.Version))
				if version == "" {
					continue
				}
				key := strings.ToLower(version)
				if _, ok := seen[key]; ok {
					continue
				}
				meta.Version = version
				result = append(result, meta)
				seen[key] = struct{}{}
				appended++
				if appended >= maxAppend {
					return
				}
			}
		}

		appendUnique(fetchGoModuleVersionMetasCached(modulePaths[0]), primaryLimit)

		extraLimit := extraHistoryLimit
		for _, modulePath := range modulePaths[1:] {
			if extraLimit <= 0 {
				break
			}
			before := len(result)
			appendUnique(fetchGoModuleVersionMetasCached(modulePath), extraLimit)
			extraLimit -= len(result) - before
		}
		if len(result) > 0 {
			return result
		}
	}

	fallbackLimit := limit + resolveDriverExtraHistoryLimit(normalized)
	if fallbackLimit <= 0 {
		fallbackLimit = limit
	}
	if fallback := fallbackRecentDriverVersionsMap[normalized]; len(fallback) > 0 {
		if len(fallback) > fallbackLimit {
			return append([]goModuleVersionMeta(nil), fallback[:fallbackLimit]...)
		}
		return append([]goModuleVersionMeta(nil), fallback...)
	}
	if fallback := normalizeVersion(strings.TrimSpace(latestDriverVersionMap[normalized])); fallback != "" {
		return []goModuleVersionMeta{{Version: fallback}}
	}
	return nil
}

func triggerDriverVersionMetadataWarmup(definitions []driverDefinition) {
	if len(definitions) == 0 {
		return
	}

	modulePaths := make([]string, 0, len(definitions))
	seenModule := make(map[string]struct{}, len(definitions))
	for _, definition := range definitions {
		if definition.BuiltIn {
			continue
		}
		driverType := normalizeDriverType(definition.Type)
		if driverType == "" || !db.IsOptionalGoDriver(driverType) {
			continue
		}
		for _, modulePath := range resolveDriverGoModulePaths(driverType) {
			if _, ok := seenModule[modulePath]; ok {
				continue
			}
			seenModule[modulePath] = struct{}{}
			modulePaths = append(modulePaths, modulePath)
		}
	}

	if len(modulePaths) == 0 {
		return
	}
	if !tryStartDriverVersionMetadataWarmup(time.Now()) {
		return
	}

	go func(paths []string) {
		defer finishDriverVersionMetadataWarmup()
		// 预热 latest 资产索引，便于版本列表命中大小缓存。
		_, _, _ = loadReleaseAssetSizesCached("latest", fetchLatestReleaseForDriverAssets)
		for _, modulePath := range paths {
			_ = fetchGoModuleVersionMetasCached(modulePath)
		}
	}(append([]string(nil), modulePaths...))
}

func resolveDriverGoModulePaths(driverType string) []string {
	normalized := normalizeDriverType(driverType)
	if normalized == "" {
		return nil
	}
	paths := make([]string, 0, 3)
	seen := make(map[string]struct{}, 3)
	appendPath := func(path string) {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			return
		}
		if _, ok := seen[trimmed]; ok {
			return
		}
		seen[trimmed] = struct{}{}
		paths = append(paths, trimmed)
	}

	appendPath(driverGoModulePathMap[normalized])
	for _, alias := range driverGoModuleAliasPathMap[normalized] {
		appendPath(alias)
	}
	return paths
}

func resolveDriverExtraHistoryLimit(driverType string) int {
	limit := driverExtraHistoryLimitMap[normalizeDriverType(driverType)]
	if limit < 0 {
		return 0
	}
	return limit
}

func tryStartDriverVersionMetadataWarmup(now time.Time) bool {
	driverVersionWarmupMu.Lock()
	defer driverVersionWarmupMu.Unlock()

	if driverVersionWarmup.Running {
		return false
	}
	if !driverVersionWarmup.LastStarted.IsZero() && now.Sub(driverVersionWarmup.LastStarted) < driverVersionWarmupMinInterval {
		return false
	}
	driverVersionWarmup.Running = true
	driverVersionWarmup.LastStarted = now
	return true
}

func finishDriverVersionMetadataWarmup() {
	driverVersionWarmupMu.Lock()
	driverVersionWarmup.Running = false
	driverVersionWarmupMu.Unlock()
}

func fetchGoModuleVersionMetasCached(modulePath string) []goModuleVersionMeta {
	key := strings.TrimSpace(modulePath)
	if key == "" {
		return nil
	}

	driverModuleVersionMu.RLock()
	cached, ok := driverModuleVersionMap[key]
	driverModuleVersionMu.RUnlock()
	if ok {
		ttl := driverModuleLatestCacheTTL
		if strings.TrimSpace(cached.Err) != "" {
			ttl = driverModuleLatestErrorCacheTTL
		}
		if time.Since(cached.LoadedAt) < ttl {
			if strings.TrimSpace(cached.Err) != "" {
				return nil
			}
			return append([]goModuleVersionMeta(nil), cached.Versions...)
		}
	}

	metas, err := fetchGoModuleVersionMetas(key)
	entry := goModuleVersionListCacheEntry{
		LoadedAt: time.Now(),
		Versions: append([]goModuleVersionMeta(nil), metas...),
	}
	if err != nil {
		entry.Err = err.Error()
	}

	driverModuleVersionMu.Lock()
	driverModuleVersionMap[key] = entry
	driverModuleVersionMu.Unlock()

	if err != nil {
		return nil
	}
	return append([]goModuleVersionMeta(nil), entry.Versions...)
}

func fetchGoModuleVersionMetas(modulePath string) ([]goModuleVersionMeta, error) {
	trimmed := strings.TrimSpace(modulePath)
	if trimmed == "" {
		return nil, fmt.Errorf("模块路径为空")
	}

	endpoint := fmt.Sprintf("https://proxy.golang.org/%s/@v/list", escapeGoModulePathForProxy(trimmed))
	client := newHTTPClientWithGlobalProxy(driverModuleLatestProbeTimeout)
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
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
		return nil, fmt.Errorf("拉取模块版本列表失败：HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, driverModuleVersionListMaxSize))
	if err != nil {
		return nil, fmt.Errorf("读取模块版本列表失败：%w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(body)), "\n")
	versions := make([]string, 0, len(lines))
	seen := make(map[string]struct{}, len(lines))
	for _, line := range lines {
		version := normalizeVersion(strings.TrimSpace(line))
		if version == "" {
			continue
		}
		normalizedSemver := "v" + version
		if !semver.IsValid(normalizedSemver) {
			continue
		}
		if semver.Prerelease(normalizedSemver) != "" {
			continue
		}
		if _, ok := seen[version]; ok {
			continue
		}
		seen[version] = struct{}{}
		versions = append(versions, version)
	}
	if len(versions) == 0 {
		return nil, fmt.Errorf("模块版本列表为空")
	}

	sort.SliceStable(versions, func(i, j int) bool {
		left := "v" + versions[i]
		right := "v" + versions[j]
		return semver.Compare(left, right) > 0
	})
	if len(versions) > driverModuleVersionFetchLimit {
		versions = versions[:driverModuleVersionFetchLimit]
	}

	metas := make([]goModuleVersionMeta, 0, len(versions))
	for _, version := range versions {
		metas = append(metas, goModuleVersionMeta{Version: version})
	}
	return metas, nil
}

func escapeGoModulePathForProxy(modulePath string) string {
	parts := strings.Split(modulePath, "/")
	for index, part := range parts {
		parts[index] = url.PathEscape(strings.TrimSpace(part))
	}
	return strings.Join(parts, "/")
}

func resolveDriverVersionOptionsFromReleases(definition driverDefinition) []driverVersionOptionItem {
	driverType := normalizeDriverType(definition.Type)
	if driverType == "" {
		return nil
	}

	releases, err := loadDriverReleaseListCached()
	if err != nil {
		return nil
	}

	result := make([]driverVersionOptionItem, 0, len(releases))
	for _, release := range releases {
		if release.Prerelease {
			continue
		}
		tag := strings.TrimSpace(release.TagName)
		version := normalizeVersion(tag)
		if tag == "" || version == "" {
			continue
		}
		assetName := optionalDriverReleaseAssetNameForVersion(driverType, version)
		assetNames := optionalDriverReleaseAssetNamesForVersion(driverType, version)
		if !releaseContainsAnyAsset(release, assetNames) {
			continue
		}
		result = append(result, driverVersionOptionItem{
			Version:     version,
			DownloadURL: driverReleaseDownloadURL(tag, assetName),
			Source:      "release",
		})
	}
	return result
}

func loadDriverReleaseListCached() ([]githubRelease, error) {
	driverReleaseListMu.RLock()
	cached := driverReleaseList
	driverReleaseListMu.RUnlock()
	if time.Since(cached.LoadedAt) < driverManifestCacheTTL {
		if strings.TrimSpace(cached.Err) != "" {
			return nil, errors.New(strings.TrimSpace(cached.Err))
		}
		return append([]githubRelease(nil), cached.Releases...), nil
	}

	driverReleaseListMu.Lock()
	defer driverReleaseListMu.Unlock()

	cached = driverReleaseList
	if time.Since(cached.LoadedAt) < driverManifestCacheTTL {
		if strings.TrimSpace(cached.Err) != "" {
			return nil, errors.New(strings.TrimSpace(cached.Err))
		}
		return append([]githubRelease(nil), cached.Releases...), nil
	}

	releases, err := fetchDriverReleaseList()
	entry := driverManifestReleaseListCache{
		LoadedAt: time.Now(),
		Releases: append([]githubRelease(nil), releases...),
	}
	if err != nil {
		entry.Err = err.Error()
	}
	driverReleaseList = entry

	if err != nil {
		return nil, err
	}
	return releases, nil
}

func fetchDriverReleaseList() ([]githubRelease, error) {
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=30", driverReleaseRepo)
	client := newHTTPClientWithGlobalProxy(driverReleaseListProbeTimeout)
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
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
		return nil, fmt.Errorf("拉取驱动版本列表失败：HTTP %d", resp.StatusCode)
	}

	decoder := json.NewDecoder(io.LimitReader(resp.Body, 4<<20))
	var releases []githubRelease
	if err := decoder.Decode(&releases); err != nil {
		return nil, fmt.Errorf("解析驱动版本列表失败：%w", err)
	}
	return releases, nil
}

func releaseContainsAnyAsset(release githubRelease, assetNames []string) bool {
	normalizedNames := make([]string, 0, len(assetNames))
	for _, assetName := range assetNames {
		name := strings.TrimSpace(assetName)
		if name == "" {
			continue
		}
		normalizedNames = append(normalizedNames, name)
	}
	if len(normalizedNames) == 0 {
		return false
	}
	for _, asset := range release.Assets {
		assetName := strings.TrimSpace(asset.Name)
		for _, expected := range normalizedNames {
			if strings.EqualFold(assetName, expected) {
				return true
			}
		}
	}
	return false
}

func resolveDriverInstallVersion(version, downloadURL string, definition driverDefinition) string {
	if selected := strings.TrimSpace(version); selected != "" {
		return selected
	}

	if inferred := inferDriverInstallVersionByDownloadURL(downloadURL); inferred != "" {
		return inferred
	}

	if pinned := strings.TrimSpace(definition.PinnedVersion); pinned != "" {
		return pinned
	}
	if effectiveDriverEngine(definition) == driverEngineGo {
		return "go-embedded"
	}
	return "unknown"
}

func inferDriverInstallVersionByDownloadURL(downloadURL string) string {
	urlText := strings.TrimSpace(downloadURL)
	if urlText == "" {
		return ""
	}
	parsed, err := url.Parse(urlText)
	if err == nil && parsed != nil {
		switch strings.ToLower(strings.TrimSpace(parsed.Scheme)) {
		case "builtin":
			return ""
		case "local":
			return "local"
		case "http", "https":
			if queryVersion := normalizeVersion(parsed.Query().Get("version")); queryVersion != "" {
				return queryVersion
			}
			if tag := extractReleaseTagFromPath(parsed.Path); tag != "" {
				return normalizeVersion(tag)
			}
		}
	}
	if tag := extractReleaseTagFromPath(urlText); tag != "" {
		return normalizeVersion(tag)
	}
	return ""
}

func extractReleaseTagFromPath(pathText string) string {
	segments := strings.Split(pathText, "/")
	for index := 0; index < len(segments)-1; index++ {
		if !strings.EqualFold(strings.TrimSpace(segments[index]), "download") {
			continue
		}
		tag := strings.TrimSpace(segments[index+1])
		if tag == "" || strings.EqualFold(tag, "latest") {
			continue
		}
		if decoded, err := url.PathUnescape(tag); err == nil && strings.TrimSpace(decoded) != "" {
			tag = strings.TrimSpace(decoded)
		}
		return tag
	}
	return ""
}

func resolveDriverRepositoryURL(repositoryURL string) (string, error) {
	urlText := strings.TrimSpace(repositoryURL)
	if urlText == "" {
		return defaultDriverManifestURLValue, nil
	}
	parsed, err := url.Parse(urlText)
	if err == nil && parsed.Scheme != "" {
		switch strings.ToLower(parsed.Scheme) {
		case "http", "https":
			return parsed.String(), nil
		case "file":
			if parsed.Path == "" {
				return "", fmt.Errorf("无效的文件清单地址")
			}
			return urlText, nil
		case "builtin":
			if isBuiltinManifestURL(parsed) {
				return defaultDriverManifestURLValue, nil
			}
			return "", fmt.Errorf("不支持的内置清单地址：%s", parsed.String())
		default:
			return "", fmt.Errorf("不支持的清单地址协议：%s", parsed.Scheme)
		}
	}
	absPath, absErr := filepath.Abs(urlText)
	if absErr != nil {
		return "", absErr
	}
	return absPath, nil
}

func resolveManifestURLForView(manifestURL string) string {
	resolved, err := resolveDriverRepositoryURL(manifestURL)
	if err != nil {
		return strings.TrimSpace(manifestURL)
	}
	return resolved
}

func resolveManifestDriverPackages(manifestURL string) (map[string]pinnedDriverPackage, error) {
	resolvedURL, err := resolveDriverRepositoryURL(manifestURL)
	if err != nil {
		return nil, err
	}

	driverManifestCacheMu.RLock()
	cached, ok := driverManifestCache[resolvedURL]
	driverManifestCacheMu.RUnlock()
	if ok && time.Since(cached.LoadedAt) < driverManifestCacheTTL {
		if strings.TrimSpace(cached.Err) != "" {
			return nil, errors.New(cached.Err)
		}
		return copyPinnedPackageMap(cached.Packages), nil
	}

	packages, versions, loadErr := loadManifestPackageAndVersions(resolvedURL)
	entry := driverManifestCacheEntry{
		LoadedAt: time.Now(),
		Packages: copyPinnedPackageMap(packages),
		Versions: copyVersionPackageMap(versions),
	}
	if loadErr != nil {
		entry.Err = loadErr.Error()
	}
	driverManifestCacheMu.Lock()
	driverManifestCache[resolvedURL] = entry
	driverManifestCacheMu.Unlock()

	if loadErr != nil {
		return nil, loadErr
	}
	return packages, nil
}

func resolveManifestDriverVersionPackages(manifestURL string) (map[string][]pinnedDriverPackage, error) {
	resolvedURL, err := resolveDriverRepositoryURL(manifestURL)
	if err != nil {
		return nil, err
	}

	driverManifestCacheMu.RLock()
	cached, ok := driverManifestCache[resolvedURL]
	driverManifestCacheMu.RUnlock()
	if ok && time.Since(cached.LoadedAt) < driverManifestCacheTTL {
		if strings.TrimSpace(cached.Err) != "" {
			return nil, errors.New(cached.Err)
		}
		return copyVersionPackageMap(cached.Versions), nil
	}

	packages, versions, loadErr := loadManifestPackageAndVersions(resolvedURL)
	entry := driverManifestCacheEntry{
		LoadedAt: time.Now(),
		Packages: copyPinnedPackageMap(packages),
		Versions: copyVersionPackageMap(versions),
	}
	if loadErr != nil {
		entry.Err = loadErr.Error()
	}
	driverManifestCacheMu.Lock()
	driverManifestCache[resolvedURL] = entry
	driverManifestCacheMu.Unlock()

	if loadErr != nil {
		return nil, loadErr
	}
	return versions, nil
}

func loadManifestPackageAndVersions(resolvedURL string) (map[string]pinnedDriverPackage, map[string][]pinnedDriverPackage, error) {
	content, err := loadManifestContent(resolvedURL)
	if err != nil {
		return nil, nil, err
	}

	var manifest driverManifestFile
	if err := json.Unmarshal(content, &manifest); err != nil {
		return nil, nil, fmt.Errorf("解析驱动清单失败：%w", err)
	}
	defaultEngine := normalizeDriverEngine(manifest.Engine)
	if defaultEngine == "" {
		defaultEngine = normalizeDriverEngine(manifest.DefaultEngine)
	}
	if defaultEngine == "" {
		defaultEngine = normalizeDriverEngine(manifest.DefaultEngine2)
	}

	result := make(map[string]pinnedDriverPackage)
	versionResult := make(map[string][]pinnedDriverPackage)
	for driverType, item := range manifest.Drivers {
		normalizedType := normalizeDriverType(driverType)
		if normalizedType == "" {
			continue
		}
		base := normalizeManifestDriverPackage(item.Version, item.DownloadURL, item.DownloadURL2, item.SHA256, item.ChecksumPolicy, item.ChecksumPolicy2, item.Engine, defaultEngine)
		result[normalizedType] = base
		versions := normalizeManifestDriverVersionList(item, base, defaultEngine)
		if len(versions) == 0 {
			versions = append(versions, base)
		}
		versionResult[normalizedType] = versions
	}
	return result, versionResult, nil
}

func normalizeManifestDriverPackage(version, downloadURL, downloadURL2, sha256, policy, policy2, engine, defaultEngine string) pinnedDriverPackage {
	urlText := strings.TrimSpace(downloadURL)
	if urlText == "" {
		urlText = strings.TrimSpace(downloadURL2)
	}
	policyText := strings.TrimSpace(policy)
	if policyText == "" {
		policyText = strings.TrimSpace(policy2)
	}
	engineText := normalizeDriverEngine(engine)
	if engineText == "" {
		engineText = defaultEngine
	}
	return pinnedDriverPackage{
		Version:     strings.TrimSpace(version),
		DownloadURL: urlText,
		SHA256:      strings.TrimSpace(sha256),
		Policy:      normalizeDriverChecksumPolicy(policyText),
		Engine:      engineText,
	}
}

func normalizeManifestDriverVersionList(item driverManifestItem, fallback pinnedDriverPackage, defaultEngine string) []pinnedDriverPackage {
	rawVersions := make([]driverManifestVersionItem, 0, len(item.Versions)+len(item.VersionList)+len(item.VersionList2)+len(item.VersionOptions)+len(item.VersionOptions2))
	rawVersions = append(rawVersions, item.Versions...)
	rawVersions = append(rawVersions, item.VersionList...)
	rawVersions = append(rawVersions, item.VersionList2...)
	rawVersions = append(rawVersions, item.VersionOptions...)
	rawVersions = append(rawVersions, item.VersionOptions2...)
	if len(rawVersions) == 0 {
		return nil
	}

	result := make([]pinnedDriverPackage, 0, len(rawVersions))
	seen := make(map[string]struct{}, len(rawVersions))
	for _, versionItem := range rawVersions {
		pkg := normalizeManifestDriverPackage(
			versionItem.Version,
			versionItem.DownloadURL,
			versionItem.DownloadURL2,
			versionItem.SHA256,
			versionItem.ChecksumPolicy,
			versionItem.ChecksumPolicy2,
			versionItem.Engine,
			defaultEngine,
		)
		if pkg.Version == "" {
			pkg.Version = fallback.Version
		}
		if pkg.DownloadURL == "" {
			pkg.DownloadURL = fallback.DownloadURL
		}
		if pkg.SHA256 == "" {
			pkg.SHA256 = fallback.SHA256
		}
		if pkg.Policy == "" {
			pkg.Policy = fallback.Policy
		}
		if pkg.Engine == "" {
			pkg.Engine = fallback.Engine
		}
		if pkg.Version == "" && pkg.DownloadURL == "" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(pkg.Version)) + "|" + strings.TrimSpace(pkg.DownloadURL)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, pkg)
	}
	return result
}

func loadManifestContent(resolvedURL string) ([]byte, error) {
	trimmed := strings.TrimSpace(resolvedURL)
	if trimmed == "" {
		return nil, fmt.Errorf("驱动清单地址为空")
	}
	parsed, err := url.Parse(trimmed)
	if err == nil {
		scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
		switch scheme {
		case "http", "https":
			client := newHTTPClientWithGlobalProxy(12 * time.Second)
			req, reqErr := http.NewRequest(http.MethodGet, parsed.String(), nil)
			if reqErr != nil {
				return nil, reqErr
			}
			req.Header.Set("User-Agent", "GoNavi-DriverManifest")
			resp, doErr := client.Do(req)
			if doErr != nil {
				return nil, doErr
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return nil, fmt.Errorf("拉取驱动清单失败：HTTP %d", resp.StatusCode)
			}
			limited := io.LimitReader(resp.Body, driverManifestMaxSize+1)
			body, readErr := io.ReadAll(limited)
			if readErr != nil {
				return nil, readErr
			}
			if int64(len(body)) > driverManifestMaxSize {
				return nil, fmt.Errorf("驱动清单超过大小限制")
			}
			return body, nil
		case "file":
			pathText := strings.TrimSpace(parsed.Path)
			if pathText == "" {
				return nil, fmt.Errorf("无效的本地驱动清单地址")
			}
			body, readErr := os.ReadFile(pathText)
			if readErr != nil {
				return nil, readErr
			}
			if int64(len(body)) > driverManifestMaxSize {
				return nil, fmt.Errorf("驱动清单超过大小限制")
			}
			return body, nil
		case "builtin":
			if isBuiltinManifestURL(parsed) {
				return []byte(builtinDriverManifestJSON), nil
			}
			return nil, fmt.Errorf("不支持的内置清单地址：%s", parsed.String())
		}
	}
	body, readErr := os.ReadFile(trimmed)
	if readErr != nil {
		return nil, readErr
	}
	if int64(len(body)) > driverManifestMaxSize {
		return nil, fmt.Errorf("驱动清单超过大小限制")
	}
	return body, nil
}

func isBuiltinManifestURL(parsed *url.URL) bool {
	if parsed == nil {
		return false
	}
	if strings.ToLower(strings.TrimSpace(parsed.Scheme)) != "builtin" {
		return false
	}
	if strings.ToLower(strings.TrimSpace(parsed.Host)) != "manifest" {
		return false
	}
	pathText := strings.TrimSpace(parsed.Path)
	return pathText == "" || pathText == "/"
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return strings.TrimSpace(err.Error())
}

func driverInstallDir(downloadDir string, driverType string) string {
	root, err := resolveDriverDownloadDirectory(downloadDir)
	if err != nil {
		root = defaultDriverDownloadDirectory()
	}
	return filepath.Join(root, normalizeDriverType(driverType))
}

func installedDriverMetaPath(downloadDir string, driverType string) string {
	return filepath.Join(driverInstallDir(downloadDir, driverType), "installed.json")
}

func readInstalledDriverPackage(downloadDir string, driverType string) (installedDriverPackage, bool) {
	metaPath := installedDriverMetaPath(downloadDir, driverType)
	content, err := os.ReadFile(metaPath)
	if err != nil {
		return installedDriverPackage{}, false
	}
	var meta installedDriverPackage
	if err := json.Unmarshal(content, &meta); err != nil {
		return installedDriverPackage{}, false
	}
	meta.DriverType = normalizeDriverType(meta.DriverType)
	if strings.TrimSpace(meta.DriverType) == "" {
		meta.DriverType = normalizeDriverType(driverType)
	}
	return meta, true
}

func optionalDriverAgentRevisionStatus(driverType string, pkg installedDriverPackage, packageMetaExists bool) (bool, string, string) {
	expected := db.OptionalDriverAgentRevision(driverType)
	if strings.TrimSpace(expected) == "" || !packageMetaExists || !db.IsOptionalGoDriver(driverType) || !shouldVerifyOptionalDriverAgentRevision(driverType, pkg.Version) {
		return false, "", expected
	}
	actual := strings.TrimSpace(pkg.AgentRevision)
	if actual == expected {
		return false, "", expected
	}
	displayName := resolveDriverDisplayName(driverDefinition{Type: driverType})
	updateReason := fmt.Sprintf("当前 GoNavi 版本要求更新后的 %s driver-agent（revision: %s）", displayName, expected)
	impact := "driver-agent 是独立二进制，不会随主程序自动更新；如果不重装，会继续使用旧 agent 逻辑，驱动侧已修复或优化的行为不会生效，可能继续出现旧版本问题。强烈建议重装对应驱动代理"
	if actual == "" {
		return true, fmt.Sprintf("原因：%s。影响：%s", updateReason, impact), expected
	}
	return true, fmt.Sprintf("原因：%s。影响：%s（已安装标记：%s，当前需要：%s）", updateReason, impact, actual, expected), expected
}

func optionalDriverPackageUpdateStatus(definition driverDefinition, pkg installedDriverPackage, packageMetaExists bool) (bool, string, string) {
	needsUpdate, reason, expected := optionalDriverAgentRevisionStatus(definition.Type, pkg, packageMetaExists)
	if needsUpdate {
		return true, reason, expected
	}
	if mongoDriverNeedsLegacyCompatibilityUpdate(definition, pkg, packageMetaExists) {
		pinned := strings.TrimSpace(definition.PinnedVersion)
		installed := strings.TrimSpace(pkg.Version)
		return true, fmt.Sprintf("原因：当前推荐 MongoDB 兼容驱动版本为 %s，已安装版本为 %s。影响：MongoDB 2.x driver-agent 使用官方 v2 驱动，要求服务端 MongoDB 4.2+；连接 MongoDB 4.0 会出现 wire version 7 不兼容。强烈建议重装对应驱动代理", pinned, installed), expected
	}
	return false, "", expected
}

func mongoDriverNeedsLegacyCompatibilityUpdate(definition driverDefinition, pkg installedDriverPackage, packageMetaExists bool) bool {
	if normalizeDriverType(definition.Type) != "mongodb" || !packageMetaExists {
		return false
	}
	pinned := normalizeVersion(strings.TrimSpace(definition.PinnedVersion))
	installed := normalizeVersion(strings.TrimSpace(pkg.Version))
	if pinned == "" || installed == "" {
		return false
	}
	return resolveMongoDriverMajorFromVersion(installed) == 2 && resolveMongoDriverMajorFromVersion(pinned) == 1
}

func optionalDriverAgentRevisionCurrent(driverType string, executablePath string) (string, bool, error) {
	expected := strings.TrimSpace(db.OptionalDriverAgentRevision(driverType))
	if expected == "" {
		return "", true, nil
	}
	metadata, err := optionalDriverAgentMetadataProbe(driverType, executablePath)
	if err != nil {
		return "", false, fmt.Errorf("%w: %v", errOptionalDriverAgentMetadataUnavailable, err)
	}
	actual := strings.TrimSpace(metadata.AgentRevision)
	return actual, actual == expected, nil
}

func verifyInstalledOptionalDriverAgentRevision(driverType string, executablePath string, selectedVersion ...string) (string, error) {
	version := ""
	if len(selectedVersion) > 0 {
		version = selectedVersion[0]
	}
	if !shouldVerifyOptionalDriverAgentRevision(driverType, version) {
		return "", nil
	}
	expected := strings.TrimSpace(db.OptionalDriverAgentRevision(driverType))
	actual, current, err := optionalDriverAgentRevisionCurrent(driverType, executablePath)
	if expected == "" {
		return actual, nil
	}
	displayName := resolveDriverDisplayName(driverDefinition{Type: driverType})
	if err != nil {
		return "", fmt.Errorf("%s 驱动代理版本元数据不可用，请安装当前版本对应的 driver-agent：%w", displayName, err)
	}
	if !current {
		actualLabel := strings.TrimSpace(actual)
		if actualLabel == "" {
			actualLabel = "空"
		}
		return "", fmt.Errorf("%s 驱动代理 revision 不匹配（已安装：%s，当前需要：%s），请安装当前版本对应的 driver-agent", displayName, actualLabel, expected)
	}
	return actual, nil
}

func observeInstalledOptionalDriverAgentRevision(driverType string, executablePath string, selectedVersion string) string {
	if !shouldVerifyOptionalDriverAgentRevision(driverType, selectedVersion) {
		return ""
	}
	expected := strings.TrimSpace(db.OptionalDriverAgentRevision(driverType))
	actual, current, err := optionalDriverAgentRevisionCurrent(driverType, executablePath)
	if expected == "" {
		return strings.TrimSpace(actual)
	}
	displayName := resolveDriverDisplayName(driverDefinition{Type: driverType})
	if err != nil {
		logger.Warnf("%s 驱动代理版本元数据不可用，已保留安装：path=%s version=%s err=%v；建议在驱动管理中重装",
			displayName, executablePath, normalizeVersion(selectedVersion), err)
		return ""
	}
	actual = strings.TrimSpace(actual)
	if !current {
		actualLabel := actual
		if actualLabel == "" {
			actualLabel = "空"
		}
		logger.Warnf("%s 驱动代理 revision 不匹配，已保留安装：已安装=%s 当前需要=%s path=%s version=%s；建议在驱动管理中重装",
			displayName, actualLabel, expected, executablePath, normalizeVersion(selectedVersion))
	}
	return actual
}

func shouldVerifyOptionalDriverAgentRevision(driverType string, selectedVersion string) bool {
	switch normalizeDriverType(driverType) {
	case "mongodb":
		return resolveMongoDriverMajorFromVersion(selectedVersion) != 1
	default:
		return true
	}
}

func (a *App) savedConnectionDriverUsageCounts() map[string]int {
	counts := map[string]int{}
	if a == nil || strings.TrimSpace(a.configDir) == "" {
		return counts
	}
	items, err := a.savedConnectionRepository().List()
	if err != nil {
		logger.Warnf("统计驱动连接使用数失败：%v", err)
		return counts
	}
	for _, item := range items {
		driverType := normalizeDriverType(item.Config.Type)
		if driverType == "custom" {
			driverType = normalizeDriverType(item.Config.Driver)
		}
		if driverType == "" || !db.IsOptionalGoDriver(driverType) {
			continue
		}
		counts[driverType]++
	}
	return counts
}

func writeInstalledDriverPackage(downloadDir string, driverType string, meta installedDriverPackage) error {
	driverDir := driverInstallDir(downloadDir, driverType)
	if err := os.MkdirAll(driverDir, 0o755); err != nil {
		return fmt.Errorf("创建驱动目录失败：%w", err)
	}
	meta.DriverType = normalizeDriverType(driverType)
	if meta.DownloadedAt == "" {
		meta.DownloadedAt = time.Now().Format(time.RFC3339)
	}
	payload, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return fmt.Errorf("写入驱动元数据失败：%w", err)
	}
	if err := os.WriteFile(installedDriverMetaPath(downloadDir, driverType), payload, 0o644); err != nil {
		return fmt.Errorf("写入驱动元数据失败：%w", err)
	}
	return nil
}

func hashFileSHA256(filePath string) (string, error) {
	pathText := strings.TrimSpace(filePath)
	if pathText == "" {
		return "", fmt.Errorf("文件路径为空")
	}
	file, err := os.Open(pathText)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func installOptionalDriverAgentPackage(a *App, definition driverDefinition, selectedVersion string, resolvedDir string, downloadURL string) (installedDriverPackage, error) {
	driverType := normalizeDriverType(definition.Type)
	installPath, err := db.ResolveOptionalDriverAgentExecutablePathForVersion(resolvedDir, driverType, selectedVersion)
	if err != nil {
		return installedDriverPackage{}, err
	}
	runtimePath, err := db.ResolveOptionalDriverAgentExecutablePath(resolvedDir, driverType)
	if err != nil {
		return installedDriverPackage{}, err
	}
	downloadSource, hash, err := ensureOptionalDriverAgentBinary(a, definition, installPath, downloadURL, selectedVersion)
	if err != nil {
		return installedDriverPackage{}, err
	}
	if activateErr := activateOptionalDriverAgentBinary(driverType, installPath, runtimePath); activateErr != nil {
		return installedDriverPackage{}, fmt.Errorf("activate %s driver agent failed: %w", resolveDriverDisplayName(definition), activateErr)
	}
	if strings.TrimSpace(hash) == "" {
		hash, err = hashFileSHA256(installPath)
		if err != nil {
			return installedDriverPackage{}, fmt.Errorf("计算 %s 驱动代理摘要失败：%w", resolveDriverDisplayName(definition), err)
		}
	}
	if strings.TrimSpace(downloadSource) == "" {
		downloadSource = strings.TrimSpace(downloadURL)
	}
	agentRevision := observeInstalledOptionalDriverAgentRevision(driverType, runtimePath, selectedVersion)
	return installedDriverPackage{
		DriverType:     driverType,
		Version:        strings.TrimSpace(selectedVersion),
		AgentRevision:  agentRevision,
		FilePath:       installPath,
		FileName:       filepath.Base(installPath),
		ExecutablePath: runtimePath,
		DownloadURL:    strings.TrimSpace(downloadSource),
		SHA256:         hash,
		DownloadedAt:   time.Now().Format(time.RFC3339),
	}, nil
}

func installOptionalDriverAgentFromLocalPath(definition driverDefinition, filePath string, resolvedDir string, selectedVersion string) (installedDriverPackage, error) {
	driverType := normalizeDriverType(definition.Type)
	displayName := resolveDriverDisplayName(definition)
	pathText := strings.TrimSpace(filePath)
	if pathText == "" {
		return installedDriverPackage{}, fmt.Errorf("本地驱动包路径为空")
	}
	if absPath, absErr := filepath.Abs(pathText); absErr == nil {
		pathText = absPath
	}
	info, statErr := os.Stat(pathText)
	if statErr != nil {
		return installedDriverPackage{}, fmt.Errorf("读取本地驱动包失败：%w", statErr)
	}

	executablePath, err := db.ResolveOptionalDriverAgentExecutablePath(resolvedDir, driverType)
	if err != nil {
		return installedDriverPackage{}, err
	}
	if mkErr := os.MkdirAll(filepath.Dir(executablePath), 0o755); mkErr != nil {
		return installedDriverPackage{}, fmt.Errorf("创建 %s 驱动目录失败：%w", displayName, mkErr)
	}

	sourcePath := pathText
	sourceName := filepath.Base(pathText)
	downloadSource := fmt.Sprintf("local://manual/%s", filepath.Base(pathText))
	if info.IsDir() {
		matchedPath, matchedEntry, resolveErr := resolveLocalDriverAgentFromLocalDirectory(pathText, driverType, selectedVersion)
		if resolveErr != nil {
			return installedDriverPackage{}, resolveErr
		}
		sourcePath = matchedPath
		sourceName = filepath.Base(matchedPath)
		downloadSource = fmt.Sprintf("local://manual-dir/%s", filepath.Base(pathText))
		if strings.TrimSpace(matchedEntry) != "" {
			downloadSource = downloadSource + "#" + matchedEntry
		}
	}

	if !info.IsDir() && strings.EqualFold(filepath.Ext(pathText), ".zip") {
		entryName, extractErr := installOptionalDriverAgentFromLocalZip(pathText, definition, executablePath, selectedVersion)
		if extractErr != nil {
			return installedDriverPackage{}, extractErr
		}
		if strings.TrimSpace(entryName) != "" {
			downloadSource = downloadSource + "#" + entryName
		}
	} else {
		if copyErr := copyAgentBinary(sourcePath, executablePath); copyErr != nil {
			return installedDriverPackage{}, fmt.Errorf("导入本地驱动代理失败：%w", copyErr)
		}
		if supportErr := copyOptionalDriverSupportFilesFromDirectory(driverType, filepath.Dir(sourcePath), filepath.Dir(executablePath)); supportErr != nil {
			return installedDriverPackage{}, fmt.Errorf("导入本地驱动代理运行时依赖失败：%w", supportErr)
		}
	}
	if validateErr := validateOptionalDriverAgentExecutableFunc(driverType, executablePath); validateErr != nil {
		return installedDriverPackage{}, validateErr
	}

	agentRevision := observeInstalledOptionalDriverAgentRevision(driverType, executablePath, selectedVersion)
	hash, hashErr := hashFileSHA256(executablePath)
	if hashErr != nil {
		return installedDriverPackage{}, fmt.Errorf("计算 %s 驱动代理摘要失败：%w", displayName, hashErr)
	}
	return installedDriverPackage{
		DriverType:     driverType,
		Version:        strings.TrimSpace(selectedVersion),
		AgentRevision:  agentRevision,
		FilePath:       sourcePath,
		FileName:       sourceName,
		ExecutablePath: executablePath,
		DownloadURL:    downloadSource,
		SHA256:         hash,
		DownloadedAt:   time.Now().Format(time.RFC3339),
	}, nil
}

func probeInstalledOptionalDriverAgentRevision(driverType string, executablePath string) string {
	expectedRevision := db.OptionalDriverAgentRevision(driverType)
	if strings.TrimSpace(expectedRevision) == "" {
		return ""
	}
	actualRevision, _, err := optionalDriverAgentRevisionCurrent(driverType, executablePath)
	if err != nil {
		logger.Warnf("%s 驱动代理未返回版本元数据：%v", resolveDriverDisplayName(driverDefinition{Type: driverType}), err)
		return ""
	}
	return strings.TrimSpace(actualRevision)
}

type localDriverCandidate struct {
	absPath       string
	relativePath  string
	depth         int
	inPlatformDir bool
}

func resolveLocalDriverAgentFromLocalDirectory(directoryPath string, driverType string, selectedVersion string) (string, string, error) {
	root := strings.TrimSpace(directoryPath)
	if root == "" {
		return "", "", fmt.Errorf("本地驱动目录路径为空")
	}
	if absPath, absErr := filepath.Abs(root); absErr == nil {
		root = absPath
	}
	info, statErr := os.Stat(root)
	if statErr != nil {
		return "", "", fmt.Errorf("读取本地驱动目录失败：%w", statErr)
	}
	if !info.IsDir() {
		return "", "", fmt.Errorf("本地驱动目录路径不是目录：%s", root)
	}

	normalizedType := normalizeDriverType(driverType)
	displayDefinition, found := resolveDriverDefinition(normalizedType)
	if !found {
		displayDefinition = driverDefinition{Type: normalizedType, Name: normalizedType}
	}
	displayName := resolveDriverDisplayName(displayDefinition)
	platformDir := optionalDriverBundlePlatformDir(stdRuntime.GOOS)
	assetNameCandidates := optionalDriverReleaseAssetNamesForVersion(normalizedType, selectedVersion)
	baseNameCandidates := optionalDriverExecutableBaseNamesForVersion(normalizedType, selectedVersion)
	assetName := optionalDriverReleaseAssetNameForVersion(normalizedType, selectedVersion)

	exactRelativePath := filepath.ToSlash(filepath.Join(platformDir, assetName))
	for _, candidateName := range assetNameCandidates {
		exactPath := filepath.Join(root, platformDir, candidateName)
		if exactInfo, err := os.Stat(exactPath); err == nil && !exactInfo.IsDir() {
			return exactPath, filepath.ToSlash(filepath.Join(platformDir, candidateName)), nil
		}
	}

	for _, candidateName := range assetNameCandidates {
		rootAssetPath := filepath.Join(root, candidateName)
		if rootAssetInfo, err := os.Stat(rootAssetPath); err == nil && !rootAssetInfo.IsDir() {
			return rootAssetPath, filepath.ToSlash(candidateName), nil
		}
	}

	assetCandidates := make([]localDriverCandidate, 0, 8)
	baseCandidates := make([]localDriverCandidate, 0, 8)
	visited := 0
	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		visited++
		if visited > localDriverDirectoryScanMaxEntries {
			return errLocalDriverDirScanLimit
		}
		if d.IsDir() {
			return nil
		}
		name := strings.TrimSpace(d.Name())
		if name == "" {
			return nil
		}

		relative, relErr := filepath.Rel(root, path)
		if relErr != nil {
			relative = name
		}
		normalizedRelative := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(relative), "./"))
		if normalizedRelative == "" {
			normalizedRelative = name
		}
		normalizedLower := strings.ToLower(normalizedRelative)
		platformPrefix := strings.ToLower(platformDir) + "/"
		inPlatformDir := normalizedLower == strings.ToLower(platformDir) || strings.HasPrefix(normalizedLower, platformPrefix)
		depth := strings.Count(normalizedRelative, "/")
		candidate := localDriverCandidate{
			absPath:       path,
			relativePath:  normalizedRelative,
			depth:         depth,
			inPlatformDir: inPlatformDir,
		}

		for _, candidateName := range assetNameCandidates {
			if strings.EqualFold(name, candidateName) {
				assetCandidates = append(assetCandidates, candidate)
				return nil
			}
		}
		for _, candidateName := range baseNameCandidates {
			if strings.EqualFold(name, candidateName) {
				baseCandidates = append(baseCandidates, candidate)
				return nil
			}
		}
		return nil
	})
	if errors.Is(walkErr, errLocalDriverDirScanLimit) {
		return "", "", fmt.Errorf("本地驱动目录条目过多（超过 %d），请缩小目录范围或直接选择 zip/单文件", localDriverDirectoryScanMaxEntries)
	}
	if walkErr != nil {
		return "", "", fmt.Errorf("扫描本地驱动目录失败：%w", walkErr)
	}

	selectBest := func(candidates []localDriverCandidate) (localDriverCandidate, bool) {
		if len(candidates) == 0 {
			return localDriverCandidate{}, false
		}
		sort.Slice(candidates, func(i, j int) bool {
			left := candidates[i]
			right := candidates[j]
			if left.inPlatformDir != right.inPlatformDir {
				return left.inPlatformDir
			}
			if left.depth != right.depth {
				return left.depth < right.depth
			}
			leftRelative := strings.ToLower(left.relativePath)
			rightRelative := strings.ToLower(right.relativePath)
			if leftRelative != rightRelative {
				return leftRelative < rightRelative
			}
			return strings.ToLower(left.absPath) < strings.ToLower(right.absPath)
		})
		return candidates[0], true
	}

	if candidate, ok := selectBest(assetCandidates); ok {
		return candidate.absPath, candidate.relativePath, nil
	}
	if candidate, ok := selectBest(baseCandidates); ok {
		return candidate.absPath, candidate.relativePath, nil
	}

	return "", "", fmt.Errorf(
		"目录中未找到 %s 代理文件（优先路径 %s，候选文件名 %s / %s）",
		displayName,
		exactRelativePath,
		strings.Join(assetNameCandidates, " | "),
		strings.Join(baseNameCandidates, " | "),
	)
}

func installOptionalDriverAgentFromLocalZip(zipPath string, definition driverDefinition, executablePath string, selectedVersion string) (string, error) {
	driverType := normalizeDriverType(definition.Type)
	displayName := resolveDriverDisplayName(definition)
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", fmt.Errorf("打开本地驱动包失败：%w", err)
	}
	defer reader.Close()

	entryPath := optionalDriverBundleEntryPathForVersion(driverType, selectedVersion)
	entryPaths := optionalDriverBundleEntryPathsForVersion(driverType, selectedVersion)
	expectedBaseNames := optionalDriverReleaseAssetNamesForVersion(driverType, selectedVersion)
	findEntry := func() *zip.File {
		for _, file := range reader.File {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			for _, expectedPath := range entryPaths {
				if name == expectedPath {
					return file
				}
			}
		}
		for _, file := range reader.File {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			for _, expectedPath := range entryPaths {
				if strings.EqualFold(name, expectedPath) {
					return file
				}
			}
		}
		for _, file := range reader.File {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			for _, expectedName := range expectedBaseNames {
				if strings.EqualFold(filepath.Base(name), expectedName) {
					return file
				}
			}
		}
		return nil
	}

	entry := findEntry()
	if entry == nil {
		return "", fmt.Errorf("本地驱动包内未找到 %s 代理文件（期望路径 %s）", displayName, entryPath)
	}

	src, err := entry.Open()
	if err != nil {
		return "", fmt.Errorf("读取本地驱动包条目失败：%w", err)
	}
	defer src.Close()

	tempPath := executablePath + ".tmp"
	_ = os.Remove(tempPath)
	dst, err := os.Create(tempPath)
	if err != nil {
		return "", fmt.Errorf("创建驱动代理临时文件失败：%w", err)
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("写入驱动代理失败：%w", err)
	}
	if err := dst.Sync(); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("落盘驱动代理失败：%w", err)
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("关闭驱动代理文件失败：%w", err)
	}
	if chmodErr := os.Chmod(tempPath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("设置驱动代理权限失败：%w", chmodErr)
	}
	if err := os.Rename(tempPath, executablePath); err != nil {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("替换驱动代理失败：%w", err)
	}
	if chmodErr := os.Chmod(executablePath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		return "", fmt.Errorf("设置驱动代理权限失败：%w", chmodErr)
	}
	if supportErr := extractOptionalDriverSupportFilesFromZip(reader.File, driverType, entry.Name, filepath.Dir(executablePath)); supportErr != nil {
		return "", supportErr
	}
	return filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(entry.Name), "./")), nil
}

func buildOptionalDriverInstallPlanMessage(displayName string, selectedVersion string, forceSourceBuild bool, preferSourceBuildBeforeDownload bool, requireSourceBuildBeforeDownload bool, restrictToExplicitArtifact bool, directURLCount int, bundleURLCount int) string {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "驱动"
	}
	versionText := normalizeVersion(strings.TrimSpace(selectedVersion))
	if versionText == "" {
		versionText = "未标注版本"
	}

	if forceSourceBuild {
		return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；当前版本仅允许本地源码构建", name, versionText)
	}
	if requireSourceBuildBeforeDownload {
		return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；开发态使用本地源码构建，失败后不使用发布包兜底", name, versionText)
	}
	if preferSourceBuildBeforeDownload {
		return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；先尝试本地源码构建，失败后继续下载兜底", name, versionText)
	}
	if directURLCount > 0 && !restrictToExplicitArtifact && bundleURLCount > 0 {
		return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；先尝试 %d 个预编译直链，失败后转入 %d 个驱动总包源", name, versionText, directURLCount, bundleURLCount)
	}
	if directURLCount > 0 && restrictToExplicitArtifact {
		return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；仅允许显式版本资产，先尝试 %d 个预编译直链", name, versionText, directURLCount)
	}
	if directURLCount > 0 {
		return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；先尝试 %d 个预编译直链", name, versionText, directURLCount)
	}
	if !restrictToExplicitArtifact && bundleURLCount > 0 {
		return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；未提供预编译直链，直接尝试 %d 个驱动总包源", name, versionText, bundleURLCount)
	}
	return fmt.Sprintf("准备安装 %s 驱动代理（版本 %s）；未命中发布资产时将回退到本地源码构建", name, versionText)
}

func buildOptionalDriverFallbackProgressMessage(displayName string, directURLCount int, bundleURLCount int, restrictToExplicitArtifact bool) string {
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "驱动"
	}
	if directURLCount > 0 && !restrictToExplicitArtifact && bundleURLCount > 0 {
		return fmt.Sprintf("预编译直链未命中，转入驱动总包兜底（%s，剩余 %d 个总包源）", name, bundleURLCount)
	}
	if directURLCount > 0 && restrictToExplicitArtifact {
		return fmt.Sprintf("预编译直链未命中；当前版本仅允许显式资产，跳过驱动总包（%s）", name)
	}
	if !restrictToExplicitArtifact && bundleURLCount > 0 {
		return fmt.Sprintf("直链不可用，转入驱动总包兜底（%s，剩余 %d 个总包源）", name, bundleURLCount)
	}
	return fmt.Sprintf("发布资产未命中，准备回退到本地源码构建（%s）", name)
}

func ensureOptionalDriverAgentBinary(a *App, definition driverDefinition, executablePath string, downloadURL string, selectedVersion string) (string, string, error) {
	driverType := normalizeDriverType(definition.Type)
	displayName := resolveDriverDisplayName(definition)
	forceSourceBuild := shouldForceSourceBuildForResolvedDownload(driverType, selectedVersion, downloadURL)
	buildType := ""
	if a != nil {
		buildType = currentBuildType(a.ctx)
	}
	preferSourceBuildBeforeDownload := shouldPreferSourceBuildBeforeDownloadForBuildType(buildType, driverType, selectedVersion)
	requireSourceBuildBeforeDownload := shouldRequireSourceBuildBeforeDownloadForBuildType(buildType, driverType, selectedVersion)
	skipReuseCandidate := shouldSkipReusableAgentCandidate(driverType, selectedVersion)
	restrictToExplicitArtifact := shouldRestrictToExplicitVersionArtifact(definition, selectedVersion)
	downloadURLs := []string{}
	bundleURLs := []string{}
	if !forceSourceBuild {
		downloadURLs = resolveOptionalDriverAgentDownloadURLs(definition, downloadURL, selectedVersion)
		if shouldUseOptionalDriverBundleFallback(driverType, restrictToExplicitArtifact, len(downloadURLs)) {
			bundleURLs = resolveOptionalDriverBundleDownloadURLs()
		}
	}
	planMessage := buildOptionalDriverInstallPlanMessage(displayName, selectedVersion, forceSourceBuild, preferSourceBuildBeforeDownload, requireSourceBuildBeforeDownload, restrictToExplicitArtifact, len(downloadURLs), len(bundleURLs))
	logger.Infof("%s，driver=%s version=%s direct_candidates=%d bundle_candidates=%d force_source_build=%v require_source_build=%v restrict_explicit=%v prefer_source_first=%v", planMessage, driverType, normalizeVersion(selectedVersion), len(downloadURLs), len(bundleURLs), forceSourceBuild, requireSourceBuildBeforeDownload, restrictToExplicitArtifact, preferSourceBuildBeforeDownload)

	info, err := os.Stat(executablePath)
	if err == nil && !info.IsDir() {
		if validateErr := validateOptionalDriverAgentExecutableFunc(driverType, executablePath); validateErr != nil {
			_ = os.Remove(executablePath)
		} else {
			// 用户点击“安装/重装”时应强制刷新驱动代理，避免沿用旧二进制导致修复不生效。
			if removeErr := os.Remove(executablePath); removeErr != nil {
				return "", "", fmt.Errorf("清理已安装 %s 驱动代理失败：%w", displayName, removeErr)
			}
		}
	}
	if err == nil && info.IsDir() {
		return "", "", fmt.Errorf("%s 驱动代理路径被目录占用：%s", displayName, executablePath)
	}

	if mkErr := os.MkdirAll(filepath.Dir(executablePath), 0o755); mkErr != nil {
		return "", "", fmt.Errorf("创建 %s 驱动目录失败：%w", displayName, mkErr)
	}
	if a != nil {
		a.emitDriverDownloadProgress(driverType, "downloading", 10, 100, planMessage)
	}
	observeInstalledCandidateRevision := func() {
		observeInstalledOptionalDriverAgentRevision(driverType, executablePath, selectedVersion)
	}
	if !skipReuseCandidate {
		if sourcePath, ok := findExistingOptionalDriverAgentCandidate(definition, executablePath); ok {
			if copyErr := copyAgentBinary(sourcePath, executablePath); copyErr != nil {
				return "", "", fmt.Errorf("复制预置 %s 驱动代理失败：%w", displayName, copyErr)
			}
			if validateErr := validateOptionalDriverAgentExecutableFunc(driverType, executablePath); validateErr != nil {
				_ = os.Remove(executablePath)
				return "", "", validateErr
			}
			hash, hashErr := hashFileSHA256(executablePath)
			if hashErr != nil {
				return "", "", fmt.Errorf("计算预置 %s 驱动代理摘要失败：%w", displayName, hashErr)
			}
			observeInstalledCandidateRevision()
			return "file://" + sourcePath, hash, nil
		}
	}

	var downloadErrs []string
	var sourceBuildAttempted bool
	var sourceBuildErr error

	if !forceSourceBuild && preferSourceBuildBeforeDownload {
		sourceBuildAttempted = true
		if a != nil {
			a.emitDriverDownloadProgress(driverType, "downloading", 16, 100, fmt.Sprintf("优先使用本地源码构建 %s 驱动代理", displayName))
		}
		hash, buildErr := buildOptionalDriverAgentFromSource(definition, executablePath, selectedVersion)
		if buildErr == nil {
			return fmt.Sprintf("local://go-build/%s-driver-agent", driverType), hash, nil
		}
		sourceBuildErr = buildErr
		if requireSourceBuildBeforeDownload {
			_ = os.Remove(executablePath)
			logger.Warnf("开发态本地构建 %s 驱动代理失败，跳过发布包兜底：%v", displayName, buildErr)
			return "", "", fmt.Errorf("本地构建失败：%w", buildErr)
		}
		logger.Warnf("预先本地构建 %s 驱动代理失败，将继续尝试下载预编译包：%v", displayName, buildErr)
	}

	if !forceSourceBuild {
		if len(downloadURLs) > 0 {
			for _, candidateURL := range downloadURLs {
				if a != nil {
					a.emitDriverDownloadProgress(driverType, "downloading", 20, 100, fmt.Sprintf("下载预编译 %s 驱动代理", displayName))
				}
				hash, dlErr := downloadOptionalDriverAgentBinary(a, definition, candidateURL, executablePath)
				if dlErr == nil {
					observeInstalledCandidateRevision()
					return candidateURL, hash, nil
				}
				logger.Warnf("下载预编译 %s 驱动代理失败，url=%s err=%v", displayName, candidateURL, dlErr)
				downloadErrs = appendOptionalDriverAttemptError(downloadErrs, candidateURL, dlErr)
			}
		}
		if len(bundleURLs) > 0 {
			fallbackMessage := buildOptionalDriverFallbackProgressMessage(displayName, len(downloadURLs), len(bundleURLs), restrictToExplicitArtifact)
			logger.Infof("%s，driver=%s version=%s", fallbackMessage, driverType, normalizeVersion(selectedVersion))
			if a != nil {
				a.emitDriverDownloadProgress(driverType, "downloading", 20, 100, fallbackMessage)
			}
			for _, bundleURL := range bundleURLs {
				if a != nil {
					a.emitDriverDownloadProgress(driverType, "downloading", 20, 100, fmt.Sprintf("从驱动总包提取 %s 代理", displayName))
				}
				source, hash, bundleErr := downloadOptionalDriverAgentFromBundle(a, definition, bundleURL, executablePath)
				if bundleErr == nil {
					observeInstalledCandidateRevision()
					return source, hash, nil
				}
				logger.Warnf("从驱动总包提取 %s 驱动代理失败，url=%s err=%v", displayName, bundleURL, bundleErr)
				downloadErrs = appendOptionalDriverAttemptError(downloadErrs, bundleURL, bundleErr)
			}
		} else if len(downloadURLs) > 0 || restrictToExplicitArtifact {
			fallbackMessage := buildOptionalDriverFallbackProgressMessage(displayName, len(downloadURLs), 0, restrictToExplicitArtifact)
			logger.Infof("%s，driver=%s version=%s", fallbackMessage, driverType, normalizeVersion(selectedVersion))
			if a != nil {
				a.emitDriverDownloadProgress(driverType, "downloading", 20, 100, fallbackMessage)
			}
		}
	}
	if a != nil {
		a.emitDriverDownloadProgress(driverType, "downloading", 92, 100, "未命中预编译包，尝试开发态本地构建")
	}

	var buildErr error
	if sourceBuildAttempted {
		buildErr = sourceBuildErr
	} else {
		hash, runErr := buildOptionalDriverAgentFromSource(definition, executablePath, selectedVersion)
		buildErr = runErr
		if buildErr == nil {
			return fmt.Sprintf("local://go-build/%s-driver-agent", driverType), hash, nil
		}
	}

	var parts []string
	if len(downloadErrs) > 0 {
		parts = append(parts, "预编译包下载失败："+strings.Join(downloadErrs, "；"))
	}
	parts = append(parts, "本地构建失败："+strings.TrimSpace(buildErr.Error()))
	return "", "", errors.New(strings.Join(parts, "；"))
}

func appendOptionalDriverAttemptError(entries []string, source string, err error) []string {
	text := formatOptionalDriverAttemptError(source, err)
	if text == "" {
		return entries
	}
	for _, existing := range entries {
		if existing == text {
			return entries
		}
	}
	return append(entries, text)
}

func formatOptionalDriverAttemptError(source string, err error) string {
	message := errorMessage(err)
	if message == "" {
		return ""
	}
	source = strings.TrimSpace(source)
	if source == "" {
		return message
	}
	duplicatedPrefix := source + ":"
	if strings.HasPrefix(message, duplicatedPrefix) {
		message = strings.TrimSpace(strings.TrimPrefix(message, duplicatedPrefix))
	}
	if message == "" {
		return source
	}
	return source + ": " + message
}

func shouldUseOptionalDriverBundleFallback(driverType string, restrictToExplicitArtifact bool, directURLCount int) bool {
	if restrictToExplicitArtifact {
		return false
	}
	if shouldSkipDirectOptionalDriverDownloads(driverType) {
		return true
	}
	return directURLCount == 0
}

func isOptionalDriverDownloadZipURL(urlText string) bool {
	trimmedURL := strings.TrimSpace(urlText)
	if trimmedURL == "" {
		return false
	}
	if parsed, err := url.Parse(trimmedURL); err == nil {
		if strings.TrimSpace(parsed.Path) != "" && strings.EqualFold(path.Ext(parsed.Path), ".zip") {
			return true
		}
		if strings.TrimSpace(parsed.Fragment) != "" && strings.EqualFold(path.Ext(parsed.Fragment), ".zip") {
			return true
		}
		return false
	}
	return strings.EqualFold(filepath.Ext(trimmedURL), ".zip")
}

func downloadOptionalDriverAgentBinary(a *App, definition driverDefinition, urlText string, executablePath string) (string, error) {
	driverType := normalizeDriverType(definition.Type)
	displayName := resolveDriverDisplayName(definition)
	trimmedURL := strings.TrimSpace(urlText)
	if trimmedURL == "" {
		return "", fmt.Errorf("下载地址为空")
	}
	if isOptionalDriverDownloadZipURL(trimmedURL) {
		tempPath := executablePath + ".download.zip"
		_ = os.Remove(tempPath)

		if _, err := downloadFileWithHash(trimmedURL, tempPath, func(downloaded, total int64) {
			if a == nil {
				return
			}
			scaledDownloaded, scaledTotal := scaleProgress(downloaded, total, 20, 90)
			a.emitDriverDownloadProgress(driverType, "downloading", scaledDownloaded, scaledTotal, fmt.Sprintf("下载预编译 %s 驱动包", displayName))
		}); err != nil {
			_ = os.Remove(tempPath)
			return "", fmt.Errorf("下载失败：%w", err)
		}

		if _, err := installOptionalDriverAgentFromLocalZip(tempPath, definition, executablePath, ""); err != nil {
			_ = os.Remove(tempPath)
			_ = os.Remove(executablePath)
			for _, supportName := range optionalDriverSupportFileNames(driverType) {
				_ = os.Remove(filepath.Join(filepath.Dir(executablePath), supportName))
			}
			return "", fmt.Errorf("安装预编译驱动包失败：%w", err)
		}
		_ = os.Remove(tempPath)

		if validateErr := validateOptionalDriverAgentExecutableFunc(driverType, executablePath); validateErr != nil {
			_ = os.Remove(executablePath)
			for _, supportName := range optionalDriverSupportFileNames(driverType) {
				_ = os.Remove(filepath.Join(filepath.Dir(executablePath), supportName))
			}
			return "", validateErr
		}
		hash, hashErr := hashFileSHA256(executablePath)
		if hashErr != nil {
			return "", fmt.Errorf("计算驱动代理摘要失败：%w", hashErr)
		}
		return hash, nil
	}
	if len(optionalDriverSupportFileNames(driverType)) > 0 {
		return "", fmt.Errorf("%s 当前平台需要随包提供运行时依赖（%s），不能安装单文件代理；请使用驱动总包、驱动专属 zip 或本地源码构建", displayName, strings.Join(optionalDriverSupportFileNames(driverType), ", "))
	}
	tempPath := executablePath + ".tmp"
	_ = os.Remove(tempPath)

	hash, err := downloadFileWithHash(trimmedURL, tempPath, func(downloaded, total int64) {
		if a == nil {
			return
		}
		scaledDownloaded, scaledTotal := scaleProgress(downloaded, total, 20, 90)
		a.emitDriverDownloadProgress(driverType, "downloading", scaledDownloaded, scaledTotal, fmt.Sprintf("下载预编译 %s 驱动代理", displayName))
	})
	if err != nil {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("下载失败：%w", err)
	}

	if chmodErr := os.Chmod(tempPath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("设置代理权限失败：%w", chmodErr)
	}
	if renameErr := os.Rename(tempPath, executablePath); renameErr != nil {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("落地代理文件失败：%w", renameErr)
	}
	if chmodErr := os.Chmod(executablePath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		return "", fmt.Errorf("设置代理权限失败：%w", chmodErr)
	}
	if validateErr := validateOptionalDriverAgentExecutableFunc(driverType, executablePath); validateErr != nil {
		_ = os.Remove(executablePath)
		return "", validateErr
	}
	return hash, nil
}

func downloadOptionalDriverAgentFromBundle(a *App, definition driverDefinition, bundleURL, executablePath string) (string, string, error) {
	driverType := normalizeDriverType(definition.Type)
	displayName := resolveDriverDisplayName(definition)
	trimmedURL := strings.TrimSpace(bundleURL)
	if trimmedURL == "" {
		return "", "", fmt.Errorf("驱动总包下载地址为空")
	}

	bundlePath, err := acquireOptionalDriverBundlePath(trimmedURL, func(downloaded, total int64) {
		if a == nil {
			return
		}
		scaledDownloaded, scaledTotal := scaleProgress(downloaded, total, 20, 78)
		a.emitDriverDownloadProgress(driverType, "downloading", scaledDownloaded, scaledTotal, fmt.Sprintf("下载 %s 驱动总包", displayName))
	}, func() {
		if a == nil {
			return
		}
		a.emitDriverDownloadProgress(driverType, "downloading", 20, 100, fmt.Sprintf("等待 %s 驱动总包下载完成", displayName))
	})
	if err != nil {
		return "", "", fmt.Errorf("下载驱动总包失败：%w", err)
	}

	reader, err := zip.OpenReader(bundlePath)
	if err != nil {
		return "", "", fmt.Errorf("打开驱动总包失败：%w", err)
	}
	defer reader.Close()

	entryPath := optionalDriverBundleEntryPath(driverType)
	entryPaths := optionalDriverBundleEntryPaths(driverType)
	expectedBaseNames := optionalDriverReleaseAssetNames(driverType)
	findEntry := func() *zip.File {
		for _, file := range reader.File {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			for _, expectedPath := range entryPaths {
				if name == expectedPath {
					return file
				}
			}
		}
		for _, file := range reader.File {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			for _, expectedPath := range entryPaths {
				if strings.EqualFold(name, expectedPath) {
					return file
				}
			}
		}
		for _, file := range reader.File {
			name := filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(file.Name), "./"))
			for _, expectedName := range expectedBaseNames {
				if strings.EqualFold(filepath.Base(name), expectedName) {
					return file
				}
			}
		}
		return nil
	}

	entry := findEntry()
	if entry == nil {
		return "", "", fmt.Errorf("驱动总包内未找到 %s（期望路径 %s）", displayName, entryPath)
	}
	if a != nil {
		a.emitDriverDownloadProgress(driverType, "downloading", 84, 100, fmt.Sprintf("解压 %s 驱动代理", displayName))
	}

	src, err := entry.Open()
	if err != nil {
		return "", "", fmt.Errorf("读取驱动总包条目失败：%w", err)
	}
	defer src.Close()

	tempPath := executablePath + ".tmp"
	_ = os.Remove(tempPath)
	dst, err := os.Create(tempPath)
	if err != nil {
		return "", "", fmt.Errorf("创建驱动代理临时文件失败：%w", err)
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return "", "", fmt.Errorf("写入驱动代理失败：%w", err)
	}
	if err := dst.Sync(); err != nil {
		dst.Close()
		_ = os.Remove(tempPath)
		return "", "", fmt.Errorf("落盘驱动代理失败：%w", err)
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tempPath)
		return "", "", fmt.Errorf("关闭驱动代理文件失败：%w", err)
	}
	if chmodErr := os.Chmod(tempPath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		_ = os.Remove(tempPath)
		return "", "", fmt.Errorf("设置驱动代理权限失败：%w", chmodErr)
	}
	if err := os.Rename(tempPath, executablePath); err != nil {
		_ = os.Remove(tempPath)
		return "", "", fmt.Errorf("替换驱动代理失败：%w", err)
	}
	if chmodErr := os.Chmod(executablePath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		return "", "", fmt.Errorf("设置驱动代理权限失败：%w", chmodErr)
	}
	if supportErr := extractOptionalDriverSupportFilesFromZip(reader.File, driverType, entry.Name, filepath.Dir(executablePath)); supportErr != nil {
		_ = os.Remove(executablePath)
		return "", "", supportErr
	}
	if validateErr := validateOptionalDriverAgentExecutableFunc(driverType, executablePath); validateErr != nil {
		_ = os.Remove(executablePath)
		return "", "", validateErr
	}
	hash, err := hashFileSHA256(executablePath)
	if err != nil {
		return "", "", fmt.Errorf("计算驱动代理摘要失败：%w", err)
	}
	source := fmt.Sprintf("%s#%s", trimmedURL, filepath.ToSlash(strings.TrimPrefix(strings.TrimSpace(entry.Name), "./")))
	return source, hash, nil
}

func buildOptionalDriverAgentFromSource(definition driverDefinition, executablePath string, selectedVersion string) (string, error) {
	driverType := normalizeDriverType(definition.Type)
	displayName := resolveDriverDisplayName(definition)
	goPath, lookErr := resolveGoBinaryPath()
	if lookErr != nil {
		return "", fmt.Errorf("当前环境未安装 Go，且未找到可用的 %s 预编译代理包", displayName)
	}

	tagName, tagErr := optionalDriverBuildTags(driverType, selectedVersion)
	if tagErr != nil {
		return "", tagErr
	}

	projectRoot, rootErr := locateProjectRootForAgentBuild()
	if rootErr != nil {
		return "", rootErr
	}
	buildArgs := []string{"build", "-tags", tagName, "-trimpath", "-ldflags", "-s -w"}
	cleanupModOverride := func() {}
	if modOverride, modErr := prepareOptionalDriverBuildModOverride(projectRoot, driverType, selectedVersion); modErr != nil {
		return "", modErr
	} else if modOverride != nil {
		buildArgs = append(buildArgs, "-modfile", modOverride.modFile)
		cleanupModOverride = modOverride.cleanup
	}
	defer cleanupModOverride()
	env := append([]string{}, os.Environ()...)
	env = withEnvValue(env, "GOTOOLCHAIN", "auto")
	var duckDBLibDir string
	var cleanupDuckDBLib func()
	if normalizeDriverType(driverType) == "duckdb" {
		env = withEnvValue(env, "CGO_ENABLED", "1")
	}
	if shouldUseDuckDBWindowsDynamicLibrary(driverType) {
		var toolchainErr error
		env, toolchainErr = configureDuckDBWindowsCGOToolchainEnv(env)
		if toolchainErr != nil {
			return "", fmt.Errorf("准备 DuckDB Windows CGO 编译器失败：%w", toolchainErr)
		}
		libDir, cleanup, prepErr := prepareDuckDBWindowsDynamicLibraryForBuild()
		if prepErr != nil {
			return "", fmt.Errorf("准备 DuckDB Windows 动态库失败：%w", prepErr)
		}
		duckDBLibDir = libDir
		cleanupDuckDBLib = cleanup
		defer cleanupDuckDBLib()
		env = withEnvValue(env, "CGO_LDFLAGS", duckDBWindowsDynamicLibraryCGOLDFlags(duckDBLibDir))
		env = prependPathEnv(env, duckDBLibDir)
	}
	buildArgs = append(buildArgs, "-o", executablePath, "./cmd/optional-driver-agent")
	ctx, cancel := context.WithTimeout(context.Background(), optionalDriverSourceBuildTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, goPath, buildArgs...)
	cmd.Dir = projectRoot
	cmd.Env = env
	output, buildErr := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("构建 %s 驱动代理超时（超过 %s），请优先使用预编译驱动包或本地驱动包导入", displayName, optionalDriverSourceBuildTimeout)
	}
	if buildErr != nil {
		return "", fmt.Errorf("构建 %s 驱动代理失败：%v，输出：%s", displayName, buildErr, strings.TrimSpace(string(output)))
	}
	if strings.TrimSpace(duckDBLibDir) != "" {
		if copyErr := copyOptionalDriverSupportFilesFromDirectory(driverType, duckDBLibDir, filepath.Dir(executablePath)); copyErr != nil {
			return "", fmt.Errorf("复制 %s 运行时依赖失败：%w", displayName, copyErr)
		}
	}
	if chmodErr := os.Chmod(executablePath, 0o755); chmodErr != nil && stdRuntime.GOOS != "windows" {
		return "", fmt.Errorf("设置 %s 驱动代理权限失败：%w", displayName, chmodErr)
	}
	hash, hashErr := hashFileSHA256(executablePath)
	if hashErr != nil {
		return "", fmt.Errorf("计算 %s 驱动代理摘要失败：%w", displayName, hashErr)
	}
	return hash, nil
}

type optionalDriverBuildModOverride struct {
	modFile string
	cleanup func()
}

func prepareOptionalDriverBuildModOverride(projectRoot string, driverType string, selectedVersion string) (*optionalDriverBuildModOverride, error) {
	modulePath := strings.TrimSpace(driverGoModulePathMap[normalizeDriverType(driverType)])
	versionText := normalizeVersion(strings.TrimSpace(selectedVersion))
	if strings.EqualFold(normalizeDriverType(driverType), "tdengine") && modulePath != "" && versionText != "" {
		return buildVersionedDriverModOverride(projectRoot, modulePath, versionText)
	}
	return nil, nil
}

func buildVersionedDriverModOverride(projectRoot string, modulePath string, version string) (*optionalDriverBuildModOverride, error) {
	goModPath := filepath.Join(projectRoot, "go.mod")
	goSumPath := filepath.Join(projectRoot, "go.sum")
	modBytes, err := os.ReadFile(goModPath)
	if err != nil {
		return nil, fmt.Errorf("读取 go.mod 失败：%w", err)
	}

	replaced, changed, err := rewriteRequiredModuleVersion(modBytes, modulePath, version)
	if err != nil {
		return nil, err
	}
	if !changed {
		return nil, fmt.Errorf("未在 go.mod 中找到驱动依赖：%s", modulePath)
	}

	workDir, err := os.MkdirTemp("", "gonavi-driver-mod-*")
	if err != nil {
		return nil, fmt.Errorf("创建驱动构建临时目录失败：%w", err)
	}
	cleanup := func() {
		_ = os.RemoveAll(workDir)
	}

	modFile := filepath.Join(workDir, "go.mod")
	sumFile := filepath.Join(workDir, "go.sum")
	if err := os.WriteFile(modFile, replaced, 0o644); err != nil {
		cleanup()
		return nil, fmt.Errorf("写入临时 go.mod 失败：%w", err)
	}
	if sumBytes, readErr := os.ReadFile(goSumPath); readErr == nil {
		if writeErr := os.WriteFile(sumFile, sumBytes, 0o644); writeErr != nil {
			cleanup()
			return nil, fmt.Errorf("写入临时 go.sum 失败：%w", writeErr)
		}
	}

	return &optionalDriverBuildModOverride{
		modFile: modFile,
		cleanup: cleanup,
	}, nil
}

func rewriteRequiredModuleVersion(goMod []byte, modulePath string, version string) ([]byte, bool, error) {
	trimmedModule := strings.TrimSpace(modulePath)
	trimmedVersion := normalizeVersion(strings.TrimSpace(version))
	if trimmedModule == "" || trimmedVersion == "" {
		return nil, false, fmt.Errorf("驱动模块或版本为空")
	}

	pattern := fmt.Sprintf(`(?m)^(?P<prefix>\s*%s\s+)v[^\s]+(?P<suffix>\s*(//.*)?)$`, regexp.QuoteMeta(trimmedModule))
	re := regexp.MustCompile(pattern)
	changed := false
	replaced := re.ReplaceAllFunc(goMod, func(line []byte) []byte {
		match := re.FindSubmatch(line)
		if len(match) == 0 {
			return line
		}
		changed = true
		text := string(line)
		submatches := re.FindStringSubmatch(text)
		if len(submatches) == 0 {
			return line
		}
		prefix := submatches[1]
		suffix := ""
		if len(submatches) > 2 {
			suffix = submatches[2]
		}
		return []byte(prefix + "v" + trimmedVersion + suffix)
	})
	return replaced, changed, nil
}

func resolveMongoDriverMajorFromVersion(version string) int {
	trimmed := strings.TrimSpace(version)
	trimmed = strings.TrimPrefix(trimmed, "v")
	if strings.HasPrefix(trimmed, "1.") || trimmed == "1" {
		return 1
	}
	return 2
}

func shouldForceSourceBuildForResolvedDownload(_ string, _ string, _ string) bool {
	return false
}

func shouldPreferSourceBuildBeforeDownload(driverType string, selectedVersion string) bool {
	return shouldPreferSourceBuildBeforeDownloadForBuildType("", driverType, selectedVersion)
}

func shouldPreferSourceBuildBeforeDownloadForBuildType(buildType string, driverType string, selectedVersion string) bool {
	_ = selectedVersion
	_ = buildType
	return shouldUseDuckDBWindowsDynamicLibrary(driverType)
}

func shouldRequireSourceBuildBeforeDownloadForBuildType(buildType string, driverType string, selectedVersion string) bool {
	_ = selectedVersion
	_ = buildType
	_ = driverType
	return false
}

func shouldSkipReusableAgentCandidate(driverType string, selectedVersion string) bool {
	_ = selectedVersion
	switch normalizeDriverType(driverType) {
	case "mongodb", "kingbase":
		return true
	default:
		return shouldUseDuckDBWindowsDynamicLibrary(driverType)
	}
}

func shouldUseDuckDBWindowsDynamicLibrary(driverType string) bool {
	return normalizeDriverType(driverType) == "duckdb" && stdRuntime.GOOS == "windows" && stdRuntime.GOARCH == "amd64"
}

func shouldPreferPublishedOptionalDriverDownloads(driverType string) bool {
	return shouldUseDuckDBWindowsDynamicLibrary(driverType)
}

func shouldSkipDirectOptionalDriverDownloads(driverType string) bool {
	return shouldUseDuckDBWindowsDynamicLibrary(driverType)
}

func optionalDriverSupportFileNames(driverType string) []string {
	if shouldUseDuckDBWindowsDynamicLibrary(driverType) {
		return []string{duckDBWindowsSupportDLLName}
	}
	return nil
}

func optionalDriverBuildTag(driverType string, selectedVersion string) (string, error) {
	switch normalizeDriverType(driverType) {
	case "mysql":
		return "gonavi_mysql_driver", nil
	case "mariadb":
		return "gonavi_mariadb_driver", nil
	case "oceanbase":
		return "gonavi_oceanbase_driver", nil
	case "diros":
		return "gonavi_diros_driver", nil
	case "starrocks":
		return "gonavi_starrocks_driver", nil
	case "sphinx":
		return "gonavi_sphinx_driver", nil
	case "sqlserver":
		return "gonavi_sqlserver_driver", nil
	case "sqlite":
		return "gonavi_sqlite_driver", nil
	case "duckdb":
		return "gonavi_duckdb_driver", nil
	case "dameng":
		return "gonavi_dameng_driver", nil
	case "kingbase":
		return "gonavi_kingbase_driver", nil
	case "highgo":
		return "gonavi_highgo_driver", nil
	case "vastbase":
		return "gonavi_vastbase_driver", nil
	case "opengauss":
		return "gonavi_opengauss_driver", nil
	case "gaussdb":
		return "gonavi_gaussdb_driver", nil
	case "iris":
		return "gonavi_iris_driver", nil
	case "mongodb":
		if resolveMongoDriverMajorFromVersion(selectedVersion) == 1 {
			return "gonavi_mongodb_driver_v1", nil
		}
		return "gonavi_mongodb_driver", nil
	case "tdengine":
		return "gonavi_tdengine_driver", nil
	case "iotdb":
		return "gonavi_iotdb_driver", nil
	case "clickhouse":
		return "gonavi_clickhouse_driver", nil
	case "elasticsearch":
		return "gonavi_elasticsearch_driver", nil
	default:
		return "", fmt.Errorf("未配置驱动构建标签：%s", driverType)
	}
}

func optionalDriverBuildTags(driverType string, selectedVersion string) (string, error) {
	tagName, err := optionalDriverBuildTag(driverType, selectedVersion)
	if err != nil {
		return "", err
	}
	if shouldUseDuckDBWindowsDynamicLibrary(driverType) {
		return strings.TrimSpace(tagName + " duckdb_use_lib"), nil
	}
	return tagName, nil
}

func locateProjectRootForAgentBuild() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("获取当前目录失败：%w", err)
	}
	dir := wd
	for {
		if fileExists(filepath.Join(dir, "go.mod")) && fileExists(filepath.Join(dir, "cmd", "optional-driver-agent", "main.go")) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("未找到通用驱动代理源码，无法自动构建；请使用已发布版本")
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func withEnvValue(env []string, key string, value string) []string {
	normalizedKey := strings.ToUpper(strings.TrimSpace(key))
	entry := normalizedKey + "=" + value
	for i, item := range env {
		name, _, ok := strings.Cut(item, "=")
		if ok && strings.ToUpper(strings.TrimSpace(name)) == normalizedKey {
			env[i] = entry
			return env
		}
	}
	return append(env, entry)
}

func duckDBWindowsDynamicLibraryCGOLDFlags(libDir string) string {
	normalizedDir := strings.ReplaceAll(filepath.ToSlash(strings.TrimSpace(libDir)), `\`, `/`)
	parts := []string{
		// cgo 会把每个 CGO_LDFLAGS 片段转成 //go:cgo_ldflag，带引号的 -L 在 windows/amd64 上会被当成非法参数。
		fmt.Sprintf("-L%s", normalizedDir),
		"-lduckdb",
		"-lstdc++",
		"-lm",
		"-lws2_32",
		"-lwsock32",
		"-lrstrtmgr",
	}
	return strings.Join(parts, " ")
}

func envValue(env []string, key string) string {
	normalizedKey := strings.ToUpper(strings.TrimSpace(key))
	for _, item := range env {
		name, value, ok := strings.Cut(item, "=")
		if ok && strings.ToUpper(strings.TrimSpace(name)) == normalizedKey {
			return value
		}
	}
	return ""
}

func prependPathEnv(env []string, dir string) []string {
	trimmedDir := strings.TrimSpace(dir)
	if trimmedDir == "" {
		return env
	}
	currentPath := envValue(env, "PATH")
	return withEnvValue(env, "PATH", trimmedDir+string(os.PathListSeparator)+currentPath)
}

func configureDuckDBWindowsCGOToolchainEnv(env []string) ([]string, error) {
	if stdRuntime.GOOS != "windows" || stdRuntime.GOARCH != "amd64" {
		return env, nil
	}
	binDir, err := resolveDuckDBWindowsCGOToolchainBin()
	if err != nil {
		return env, err
	}
	env = withEnvValue(env, "CC", filepath.Join(binDir, "gcc.exe"))
	env = withEnvValue(env, "CXX", filepath.Join(binDir, "g++.exe"))
	env = prependPathEnv(env, binDir)
	return env, nil
}

func resolveDuckDBWindowsCGOToolchainBin() (string, error) {
	candidates := duckDBWindowsCGOToolchainBinCandidates()
	return resolveDuckDBWindowsCGOToolchainBinFromCandidates(candidates)
}

func resolveDuckDBWindowsCGOToolchainBinFromCandidates(candidates []string) (string, error) {
	seen := make(map[string]struct{}, len(candidates))
	checked := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		binDir := strings.TrimSpace(candidate)
		if binDir == "" {
			continue
		}
		cleaned := filepath.Clean(binDir)
		key := strings.ToLower(cleaned)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		checked = append(checked, cleaned)
		if fileExists(filepath.Join(cleaned, "gcc.exe")) && fileExists(filepath.Join(cleaned, "g++.exe")) {
			return cleaned, nil
		}
	}

	installHint := `请先安装 MSYS2 UCRT64 工具链：winget install --id MSYS2.MSYS2 -e；然后执行 C:\msys64\usr\bin\bash.exe -lc "pacman -S --needed --noconfirm mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-binutils"`
	if len(checked) == 0 {
		return "", fmt.Errorf("未找到可用的 gcc.exe/g++.exe；%s", installHint)
	}
	return "", fmt.Errorf("未找到可用的 gcc.exe/g++.exe，已检查：%s；%s", strings.Join(checked, ", "), installHint)
}

func duckDBWindowsCGOToolchainBinCandidates() []string {
	candidates := make([]string, 0, 12)
	if ccDir := executableEnvDir("CC"); ccDir != "" {
		candidates = append(candidates, ccDir)
	}
	if cxxDir := executableEnvDir("CXX"); cxxDir != "" {
		candidates = append(candidates, cxxDir)
	}
	if gccPath, err := exec.LookPath("gcc"); err == nil {
		candidates = append(candidates, filepath.Dir(gccPath))
	}
	if gxxPath, err := exec.LookPath("g++"); err == nil {
		candidates = append(candidates, filepath.Dir(gxxPath))
	}
	if prefix := strings.TrimSpace(os.Getenv("MSYSTEM_PREFIX")); prefix != "" {
		candidates = append(candidates, filepath.Join(prefix, "bin"))
	}
	if msys2Location := strings.TrimSpace(os.Getenv("MSYS2_LOCATION")); msys2Location != "" {
		candidates = append(candidates, filepath.Join(msys2Location, "ucrt64", "bin"))
	}
	candidates = append(candidates, `C:\msys64\ucrt64\bin`, `C:\tools\msys64\ucrt64\bin`)
	if localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); localAppData != "" {
		candidates = append(candidates, filepath.Join(localAppData, "Programs", "msys64", "ucrt64", "bin"))
	}
	if programFiles := strings.TrimSpace(os.Getenv("ProgramFiles")); programFiles != "" {
		candidates = append(candidates, filepath.Join(programFiles, "msys64", "ucrt64", "bin"))
	}
	if programFilesX86 := strings.TrimSpace(os.Getenv("ProgramFiles(x86)")); programFilesX86 != "" {
		candidates = append(candidates, filepath.Join(programFilesX86, "msys64", "ucrt64", "bin"))
	}
	return candidates
}

func executableEnvDir(key string) string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return ""
	}
	if filepath.IsAbs(raw) {
		return filepath.Dir(raw)
	}
	resolved, err := exec.LookPath(raw)
	if err != nil {
		return ""
	}
	return filepath.Dir(resolved)
}

func prepareDuckDBWindowsDynamicLibraryForBuild() (string, func(), error) {
	workDir, err := os.MkdirTemp("", "gonavi-duckdb-lib-*")
	if err != nil {
		return "", nil, err
	}
	cleanup := func() {
		_ = os.RemoveAll(workDir)
	}

	archivePath := filepath.Join(workDir, "libduckdb-windows-amd64.zip")
	if _, err := downloadFileWithHash(duckDBWindowsLibraryArchiveURL, archivePath, nil); err != nil {
		cleanup()
		return "", nil, err
	}

	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		cleanup()
		return "", nil, err
	}
	defer reader.Close()

	required := map[string]bool{
		"duckdb.dll": false,
	}
	for _, file := range reader.File {
		baseName := strings.ToLower(filepath.Base(filepath.ToSlash(file.Name)))
		if _, ok := required[baseName]; !ok {
			continue
		}
		if err := extractZipFileToPath(file, filepath.Join(workDir, baseName)); err != nil {
			cleanup()
			return "", nil, err
		}
		required[baseName] = true
	}
	var missing []string
	for name, found := range required {
		if !found {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		cleanup()
		return "", nil, fmt.Errorf("DuckDB 官方动态库包缺少文件：%s", strings.Join(missing, ", "))
	}

	toolchainBin, err := resolveDuckDBWindowsCGOToolchainBin()
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("定位 DuckDB Windows dlltool 失败：%w", err)
	}
	dllPath := filepath.Join(workDir, "duckdb.dll")
	importLibPath := filepath.Join(workDir, "libduckdb.dll.a")
	if err := buildutil.GenerateWindowsImportLibraryFromDLL(
		dllPath,
		filepath.Join(toolchainBin, "dlltool.exe"),
		importLibPath,
	); err != nil {
		cleanup()
		return "", nil, err
	}
	if err := copyOptionalDriverSupportFile(importLibPath, filepath.Join(workDir, "libduckdb.a")); err != nil {
		cleanup()
		return "", nil, err
	}

	return workDir, cleanup, nil
}
