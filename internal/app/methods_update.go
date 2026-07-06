package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	urlpkg "net/url"
	"os"
	"os/exec"
	"path/filepath"
	stdRuntime "runtime"
	"strconv"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/uievents"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	updateRepo                  = "Syngnat/GoNavi"
	updateLatestAPIURL          = "https://api.github.com/repos/" + updateRepo + "/releases/latest"
	updateDevAPIURL             = "https://api.github.com/repos/" + updateRepo + "/releases/tags/" + updateDevReleaseTag
	updateChecksumAsset         = "SHA256SUMS"
	updateDownloadProgressEvent = "update:download-progress"
)

var (
	updateFetchLatestRelease   = fetchLatestRelease
	updateFetchDevRelease      = fetchDevRelease
	updateFetchReleaseSHA256   = fetchReleaseSHA256
	updateLogCheckError        = func(err error) { logger.Error(err, "检查更新失败") }
	updateResolveInstallTarget = resolveUpdateInstallTarget
	updateLaunchInstallScript  = launchUpdateScript
)

type updateState struct {
	lastCheck   *UpdateInfo
	downloading bool
	staged      *stagedUpdate
}

type UpdateInfo struct {
	HasUpdate       bool   `json:"hasUpdate"`
	Channel         string `json:"channel"`
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	ReleaseName     string `json:"releaseName"`
	ReleaseNotesURL string `json:"releaseNotesUrl"`
	AssetName       string `json:"assetName"`
	AssetURL        string `json:"assetUrl"`
	AssetSize       int64  `json:"assetSize"`
	SHA256          string `json:"sha256"`
	Downloaded      bool   `json:"downloaded"`
	DownloadPath    string `json:"downloadPath,omitempty"`
}

type AppInfo struct {
	Version      string `json:"version"`
	Author       string `json:"author"`
	RepoURL      string `json:"repoUrl,omitempty"`
	IssueURL     string `json:"issueUrl,omitempty"`
	ReleaseURL   string `json:"releaseUrl,omitempty"`
	CommunityURL string `json:"communityUrl,omitempty"`
	BuildTime    string `json:"buildTime,omitempty"`
}

type updateDownloadResult struct {
	Info           UpdateInfo `json:"info"`
	DownloadPath   string     `json:"downloadPath,omitempty"`
	InstallLogPath string     `json:"installLogPath,omitempty"`
	InstallTarget  string     `json:"installTarget,omitempty"`
	Platform       string     `json:"platform"`
	AutoRelaunch   bool       `json:"autoRelaunch"`
}

type updateDownloadProgressPayload struct {
	Status     string  `json:"status"`
	Percent    float64 `json:"percent"`
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Message    string  `json:"message,omitempty"`
}

type stagedUpdate struct {
	Channel        updateChannel
	Version        string
	AssetName      string
	FilePath       string
	StagedDir      string
	InstallLogPath string
}

type updatePathCandidate struct {
	workspaceDir string
	stagedDir    string
	assetPath    string
}

type githubRelease struct {
	TagName    string        `json:"tag_name"`
	Name       string        `json:"name"`
	HTMLURL    string        `json:"html_url"`
	Prerelease bool          `json:"prerelease"`
	Assets     []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	URL                string `json:"url"`
	Digest             string `json:"digest"`
	Size               int64  `json:"size"`
}

type localizedUpdateError struct {
	key    string
	params map[string]any
}

func (e localizedUpdateError) Error() string {
	return e.key
}

func (a *App) localizedUpdateError(err error) string {
	if err == nil {
		return ""
	}
	var localized localizedUpdateError
	if errors.As(err, &localized) {
		return a.appText(localized.key, localized.params)
	}
	return err.Error()
}

func (a *App) CheckForUpdates() connection.QueryResult {
	return a.checkForUpdates(true)
}

func (a *App) CheckForUpdatesSilently() connection.QueryResult {
	return a.checkForUpdates(false)
}

func (a *App) checkForUpdates(logFailure bool) connection.QueryResult {
	channel := a.currentUpdateChannel()
	info, err := fetchLatestUpdateInfo(channel)
	if err != nil {
		if logFailure {
			updateLogCheckError(err)
		}
		return connection.QueryResult{Success: false, Message: a.localizedUpdateError(err)}
	}

	var currentStaged *stagedUpdate
	a.updateMu.Lock()
	currentStaged = a.updateState.staged
	a.updateMu.Unlock()

	if info.HasUpdate {
		reusable := resolveReusableStagedUpdate(info, currentStaged)
		if reusable != nil {
			info.Downloaded = true
			info.DownloadPath = reusable.FilePath
			currentStaged = reusable
		} else if currentStaged != nil && (currentStaged.Version != info.LatestVersion || currentStaged.Channel != updateChannel(info.Channel)) {
			currentStaged = nil
		}
	} else {
		currentStaged = nil
	}

	a.updateMu.Lock()
	a.updateState.lastCheck = &info
	a.updateState.staged = currentStaged
	a.updateMu.Unlock()

	msg := a.appText("app.update.backend.message.latest", nil)
	if info.HasUpdate {
		msg = a.appText("app.update.backend.message.update_found", map[string]any{"version": info.LatestVersion})
	}
	return connection.QueryResult{Success: true, Message: msg, Data: info}
}

func (a *App) GetAppInfo() connection.QueryResult {
	info := AppInfo{
		Version:      getCurrentVersion(),
		Author:       getCurrentAuthor(),
		RepoURL:      "https://github.com/" + updateRepo,
		IssueURL:     "https://github.com/" + updateRepo + "/issues",
		ReleaseURL:   "https://github.com/" + updateRepo + "/releases",
		CommunityURL: "https://aibook.ren",
		BuildTime:    strings.TrimSpace(AppBuildTime),
	}
	return connection.QueryResult{Success: true, Message: "OK", Data: info}
}

func (a *App) DownloadUpdate() connection.QueryResult {
	a.updateMu.Lock()
	if a.updateState.downloading {
		a.updateMu.Unlock()
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.download_in_progress", nil)}
	}
	info := a.updateState.lastCheck
	if info == nil {
		a.updateMu.Unlock()
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.check_first", nil)}
	}
	if !info.HasUpdate {
		a.updateMu.Unlock()
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.latest", nil)}
	}
	if info.AssetURL == "" || info.AssetName == "" {
		a.updateMu.Unlock()
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.no_update_package", nil)}
	}
	staged := resolveReusableStagedUpdate(*info, a.updateState.staged)
	if staged != nil {
		a.updateState.staged = staged
		a.updateMu.Unlock()
		return connection.QueryResult{Success: true, Message: a.appText("app.update.backend.message.package_already_downloaded", nil), Data: buildUpdateDownloadResult(*info, staged)}
	}
	a.updateState.staged = nil
	a.updateState.downloading = true
	a.updateMu.Unlock()

	a.emitUpdateDownloadProgress("start", 0, info.AssetSize, "")
	result := a.downloadAndStageUpdate(*info)

	a.updateMu.Lock()
	a.updateState.downloading = false
	a.updateMu.Unlock()

	return result
}

func (a *App) InstallUpdateAndRestart() connection.QueryResult {
	a.updateMu.Lock()
	staged := a.updateState.staged
	if staged != nil && strings.TrimSpace(staged.InstallLogPath) == "" {
		staged.InstallLogPath = buildUpdateInstallLogPath(filepath.Dir(staged.FilePath))
	}
	a.updateMu.Unlock()
	if staged == nil {
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.no_downloaded_package", nil)}
	}

	if stdRuntime.GOOS == "windows" && !shouldWindowsUpdateLaunchDownloadedAssetDirectly(staged.FilePath) {
		if err := ensureWindowsUpdateTargetWritable(updateResolveInstallTarget()); err != nil {
			return connection.QueryResult{
				Success: false,
				Message: a.appText("app.update.backend.message.install_launch_failed", map[string]any{
					"detail": a.localizedUpdateError(err),
				}),
			}
		}
	}

	if err := updateLaunchInstallScript(staged); err != nil {
		logger.Error(err, "启动更新脚本失败")
		detail := a.localizedUpdateError(err)
		msg := a.appText("app.update.backend.message.install_launch_failed", map[string]any{"detail": detail})
		if staged.InstallLogPath != "" {
			msg = a.appText("app.update.backend.message.install_launch_failed_with_log", map[string]any{
				"detail": detail,
				"path":   staged.InstallLogPath,
			})
		}
		return connection.QueryResult{
			Success: false,
			Message: msg,
			Data: map[string]any{
				"logPath": staged.InstallLogPath,
			},
		}
	}

	go func() {
		time.Sleep(300 * time.Millisecond)
		wailsRuntime.Quit(a.ctx)
		// 兜底退出，避免某些平台/窗口状态下 Quit 未真正结束进程，导致更新脚本一直等待。
		time.Sleep(2 * time.Second)
		os.Exit(0)
	}()

	msg := a.appText("app.update.backend.message.install_started", nil)
	if staged.InstallLogPath != "" {
		msg = a.appText("app.update.backend.message.install_started_with_log", map[string]any{"path": staged.InstallLogPath})
	}
	return connection.QueryResult{
		Success: true,
		Message: msg,
		Data: map[string]any{
			"logPath": staged.InstallLogPath,
		},
	}
}

func (a *App) OpenDownloadedUpdateDirectory() connection.QueryResult {
	a.updateMu.Lock()
	staged := a.updateState.staged
	a.updateMu.Unlock()
	if staged == nil {
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.no_downloaded_package", nil)}
	}
	assetPath := strings.TrimSpace(staged.FilePath)
	if assetPath == "" {
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.package_path_empty", nil)}
	}
	dirPath := strings.TrimSpace(filepath.Dir(assetPath))
	if dirPath == "" || dirPath == "." {
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.package_directory_unresolved", nil)}
	}
	if stat, err := os.Stat(dirPath); err != nil || !stat.IsDir() {
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.package_directory_unavailable", nil)}
	}

	var cmd *exec.Cmd
	switch stdRuntime.GOOS {
	case "darwin":
		cmd = exec.Command("open", dirPath)
	case "windows":
		cmd = exec.Command("explorer", dirPath)
	case "linux":
		cmd = exec.Command("xdg-open", dirPath)
	default:
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.open_directory_unsupported", map[string]any{"platform": stdRuntime.GOOS})}
	}
	if err := cmd.Start(); err != nil {
		logger.Error(err, "打开更新目录失败")
		return connection.QueryResult{Success: false, Message: a.appText("app.update.backend.message.open_directory_failed", map[string]any{"detail": err.Error()})}
	}
	return connection.QueryResult{
		Success: true,
		Message: a.appText("app.update.backend.message.opened_install_directory", map[string]any{"path": dirPath}),
		Data: map[string]any{
			"path": dirPath,
		},
	}
}

func (a *App) downloadAndStageUpdate(info UpdateInfo) connection.QueryResult {
	workspaceDir := strings.TrimSpace(resolveUpdateWorkspaceDir(info.LatestVersion))
	if workspaceDir == "" {
		message := a.appText("app.update.backend.message.app_directory_unresolved_download", nil)
		a.emitUpdateDownloadProgress("error", 0, info.AssetSize, message)
		return connection.QueryResult{Success: false, Message: message}
	}
	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		errMsg := a.appText("app.update.backend.message.app_directory_unavailable", map[string]any{"path": workspaceDir})
		a.emitUpdateDownloadProgress("error", 0, info.AssetSize, errMsg)
		return connection.QueryResult{Success: false, Message: errMsg}
	}

	// 使用版本号命名的工作目录，便于识别和调试
	stagedDir := resolveUpdateStagedDir(workspaceDir, info.Channel, info.LatestVersion)
	stageBaseDir := filepath.Dir(stagedDir)
	// 清理可能残留的旧目录（上次下载失败后未清理）
	// Windows 上文件可能被杀毒软件/索引服务占用，需要重试
	for retry := 0; retry < 5; retry++ {
		err := os.RemoveAll(stagedDir)
		if err == nil {
			break
		}
		if retry < 4 {
			time.Sleep(time.Duration(retry+1) * 500 * time.Millisecond)
		} else {
			// 最后一次仍然失败，换一个带时间戳的目录名避免冲突
			stagedDir = filepath.Join(stageBaseDir, fmt.Sprintf("%s-%d", buildUpdateStageDirName(info.Channel, info.LatestVersion), time.Now().UnixNano()))
		}
	}
	if err := os.MkdirAll(stagedDir, 0o755); err != nil {
		errMsg := a.appText("app.update.backend.message.create_workspace_failed", map[string]any{"path": stagedDir})
		a.emitUpdateDownloadProgress("error", 0, info.AssetSize, errMsg)
		return connection.QueryResult{Success: false, Message: errMsg}
	}

	// 安装包本体放在工作区根级，staging 目录只保留更新脚本和临时展开物。
	assetPath := resolveUpdateAssetPath(workspaceDir, stagedDir, info.AssetName)
	actualHash, err := downloadFileWithHash(info.AssetURL, assetPath, func(downloaded, total int64) {
		reportTotal := total
		if reportTotal <= 0 {
			reportTotal = info.AssetSize
		}
		a.emitUpdateDownloadProgress("downloading", downloaded, reportTotal, "")
	})
	if err != nil {
		_ = os.Remove(assetPath)
		_ = os.RemoveAll(stagedDir)
		message := a.localizedUpdateError(err)
		a.emitUpdateDownloadProgress("error", 0, info.AssetSize, message)
		return connection.QueryResult{Success: false, Message: message}
	}

	if info.SHA256 == "" {
		_ = os.Remove(assetPath)
		_ = os.RemoveAll(stagedDir)
		message := a.appText("app.update.backend.message.checksum_missing", nil)
		a.emitUpdateDownloadProgress("error", 0, info.AssetSize, message)
		return connection.QueryResult{Success: false, Message: message}
	}
	if !strings.EqualFold(info.SHA256, actualHash) {
		_ = os.Remove(assetPath)
		_ = os.RemoveAll(stagedDir)
		message := a.appText("app.update.backend.message.checksum_failed", nil)
		a.emitUpdateDownloadProgress("error", 0, info.AssetSize, message)
		return connection.QueryResult{Success: false, Message: message}
	}

	staged := &stagedUpdate{
		Channel:        updateChannel(info.Channel),
		Version:        info.LatestVersion,
		AssetName:      info.AssetName,
		FilePath:       assetPath,
		StagedDir:      stagedDir,
		InstallLogPath: buildUpdateInstallLogPath(workspaceDir),
	}
	info.Downloaded = true
	info.DownloadPath = assetPath
	a.updateMu.Lock()
	a.updateState.staged = staged
	a.updateMu.Unlock()

	a.emitUpdateDownloadProgress("done", info.AssetSize, info.AssetSize, "")
	return connection.QueryResult{Success: true, Message: a.appText("app.update.backend.message.package_downloaded", nil), Data: buildUpdateDownloadResult(info, staged)}
}

func fetchLatestUpdateInfo(channel updateChannel) (UpdateInfo, error) {
	if channel != updateChannelDev {
		channel = updateChannelLatest
	}
	release, err := fetchReleaseForChannel(channel)
	if err != nil {
		return UpdateInfo{}, err
	}

	currentVersion := getCurrentVersion()
	latestVersion := resolveReleaseVersion(channel, release)
	if latestVersion == "" {
		return UpdateInfo{}, localizedUpdateError{key: "app.update.backend.error.latest_version_unparseable"}
	}

	hasUpdate := false
	if channel == updateChannelDev {
		hasUpdate = normalizeVersion(currentVersion) != latestVersion
	} else {
		hasUpdate = compareVersion(currentVersion, latestVersion) < 0
	}
	if !hasUpdate {
		return UpdateInfo{
			HasUpdate:       false,
			Channel:         string(channel),
			CurrentVersion:  currentVersion,
			LatestVersion:   latestVersion,
			ReleaseName:     release.Name,
			ReleaseNotesURL: release.HTMLURL,
		}, nil
	}

	assetVersion := strings.TrimSpace(release.TagName)
	if assetVersion == "" || strings.EqualFold(normalizeVersion(assetVersion), updateDevReleaseTag) {
		assetVersion = latestVersion
	}
	assetName, err := expectedAssetName(stdRuntime.GOOS, stdRuntime.GOARCH, assetVersion)
	if err != nil {
		return UpdateInfo{}, err
	}
	asset, err := findReleaseAsset(release.Assets, assetName)
	if err != nil {
		return UpdateInfo{}, err
	}

	hashMap, err := updateFetchReleaseSHA256(release.Assets)
	if err != nil {
		return UpdateInfo{}, err
	}
	sha256Value := strings.TrimSpace(hashMap[assetName])
	if sha256Value == "" {
		return UpdateInfo{}, localizedUpdateError{key: "app.update.backend.error.sha256_missing_current_package"}
	}
	return UpdateInfo{
		HasUpdate:       hasUpdate,
		Channel:         string(channel),
		CurrentVersion:  currentVersion,
		LatestVersion:   latestVersion,
		ReleaseName:     release.Name,
		ReleaseNotesURL: release.HTMLURL,
		AssetName:       asset.Name,
		AssetURL:        asset.BrowserDownloadURL,
		AssetSize:       asset.Size,
		SHA256:          sha256Value,
	}, nil
}

func fetchReleaseForChannel(channel updateChannel) (*githubRelease, error) {
	if channel == updateChannelDev {
		return updateFetchDevRelease()
	}
	return updateFetchLatestRelease()
}

func swapUpdateFetchLatestRelease(next func() (*githubRelease, error)) func() {
	original := updateFetchLatestRelease
	updateFetchLatestRelease = next
	return func() {
		updateFetchLatestRelease = original
	}
}

func swapUpdateFetchDevRelease(next func() (*githubRelease, error)) func() {
	original := updateFetchDevRelease
	updateFetchDevRelease = next
	return func() {
		updateFetchDevRelease = original
	}
}

func swapUpdateFetchReleaseSHA256(next func([]githubAsset) (map[string]string, error)) func() {
	original := updateFetchReleaseSHA256
	updateFetchReleaseSHA256 = next
	return func() {
		updateFetchReleaseSHA256 = original
	}
}

func swapUpdateCheckErrorLogger(next func(error)) func() {
	original := updateLogCheckError
	updateLogCheckError = next
	return func() {
		updateLogCheckError = original
	}
}

func getCurrentAuthor() string {
	if env := strings.TrimSpace(os.Getenv("GONAVI_AUTHOR")); env != "" {
		return env
	}
	parts := strings.Split(updateRepo, "/")
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}

func fetchLatestRelease() (*githubRelease, error) {
	return fetchReleaseByURL(updateLatestAPIURL)
}

func fetchDevRelease() (*githubRelease, error) {
	return fetchReleaseByURL(updateDevAPIURL)
}

func fetchReleaseByURL(apiURL string) (*githubRelease, error) {
	client := newHTTPClientWithGlobalProxy(15 * time.Second)
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GoNavi-Updater")
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, localizedUpdateError{
			key:    "app.update.backend.error.check_http_status",
			params: map[string]any{"status": resp.StatusCode},
		}
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	return &release, nil
}

func expectedAssetName(goos, goarch, version string) (string, error) {
	executablePath := ""
	if goos == "linux" {
		if path, err := os.Executable(); err == nil {
			if resolved, resolveErr := filepath.EvalSymlinks(path); resolveErr == nil && strings.TrimSpace(resolved) != "" {
				path = resolved
			}
			executablePath = path
		}
	}
	return expectedAssetNameForExecutable(goos, goarch, version, executablePath)
}

func expectedAssetNameForExecutable(goos, goarch, version, executablePath string) (string, error) {
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(version, "v")
	version = strings.TrimPrefix(version, "V")
	if version == "" {
		return "", localizedUpdateError{key: "app.update.backend.error.release_version_unparseable"}
	}

	switch goos {
	case "windows":
		if goarch == "amd64" {
			return fmt.Sprintf("GoNavi-%s-Windows-Amd64.exe", version), nil
		}
		if goarch == "arm64" {
			return fmt.Sprintf("GoNavi-%s-Windows-Arm64.exe", version), nil
		}
	case "darwin":
		if goarch == "amd64" {
			return fmt.Sprintf("GoNavi-%s-MacOS-Amd64.dmg", version), nil
		}
		if goarch == "arm64" {
			return fmt.Sprintf("GoNavi-%s-MacOS-Arm64.dmg", version), nil
		}
	case "linux":
		if goarch == "amd64" {
			return fmt.Sprintf("GoNavi-%s-Linux-Amd64%s.tar.gz", version, resolveLinuxReleaseArtifactSuffix(executablePath)), nil
		}
		if goarch == "arm64" {
			return fmt.Sprintf("GoNavi-%s-Linux-Arm64%s.tar.gz", version, resolveLinuxReleaseArtifactSuffix(executablePath)), nil
		}
	}
	return "", localizedUpdateError{
		key:    "app.update.backend.error.online_update_unsupported",
		params: map[string]any{"platform": goos + "/" + goarch},
	}
}

func resolveLinuxReleaseArtifactSuffix(executablePath string) string {
	normalizedPath := strings.ToLower(strings.TrimSpace(executablePath))
	if normalizedPath == "" {
		return ""
	}
	normalizedPath = strings.ReplaceAll(normalizedPath, "\\", "/")
	compactPath := strings.ReplaceAll(normalizedPath, "_", "")
	compactPath = strings.ReplaceAll(compactPath, "-", "")
	if strings.Contains(normalizedPath, "webkit41") || strings.Contains(compactPath, "webkit241") || strings.Contains(compactPath, "webkit41") {
		return "-WebKit41"
	}
	return ""
}

func findReleaseAsset(assets []githubAsset, name string) (*githubAsset, error) {
	for _, asset := range assets {
		if asset.Name == name {
			return &asset, nil
		}
	}
	return nil, localizedUpdateError{
		key:    "app.update.backend.error.update_package_not_found",
		params: map[string]any{"name": name},
	}
}

func fetchReleaseSHA256(assets []githubAsset) (map[string]string, error) {
	var checksumURL string
	for _, asset := range assets {
		if strings.EqualFold(asset.Name, updateChecksumAsset) || strings.Contains(strings.ToLower(asset.Name), "sha256sums") {
			checksumURL = asset.BrowserDownloadURL
			break
		}
	}
	if checksumURL == "" {
		return nil, localizedUpdateError{key: "app.update.backend.error.sha256sums_missing"}
	}

	client := newHTTPClientWithGlobalProxy(15 * time.Second)
	req, err := http.NewRequest(http.MethodGet, checksumURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GoNavi-Updater")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, localizedUpdateError{
			key:    "app.update.backend.error.sha256sums_download_failed",
			params: map[string]any{"status": resp.StatusCode},
		}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return parseSHA256Sums(string(body)), nil
}

func parseSHA256Sums(content string) map[string]string {
	result := make(map[string]string)
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		hash := fields[0]
		name := fields[len(fields)-1]
		name = strings.TrimPrefix(name, "*")
		name = strings.TrimPrefix(name, "./")
		result[name] = hash
	}
	return result
}

type downloadProgressWriter struct {
	total      int64
	written    int64
	lastEmit   time.Time
	emitEvery  time.Duration
	onProgress func(downloaded, total int64)
}

func (w *downloadProgressWriter) Write(p []byte) (int, error) {
	n := len(p)
	if n == 0 {
		return 0, nil
	}
	w.written += int64(n)
	if w.onProgress == nil {
		return n, nil
	}
	now := time.Now()
	if w.lastEmit.IsZero() || now.Sub(w.lastEmit) >= w.emitEvery || (w.total > 0 && w.written >= w.total) {
		w.lastEmit = now
		w.onProgress(w.written, w.total)
	}
	return n, nil
}

func downloadFileWithHash(url, filePath string, onProgress func(downloaded, total int64)) (string, error) {
	return downloadFileWithHashWithTimeout(url, filePath, onProgress, 10*time.Minute)
}

func downloadFileWithHashWithTimeout(url, filePath string, onProgress func(downloaded, total int64), timeout time.Duration) (string, error) {
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	client := newHTTPClientWithGlobalProxy(timeout)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "GoNavi-Updater")
	if isGitHubReleaseAssetAPIURL(url) {
		req.Header.Set("Accept", "application/octet-stream")
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", localizedUpdateError{
			key:    "app.update.backend.error.package_download_http_failed",
			params: map[string]any{"status": resp.StatusCode},
		}
	}

	// Windows 上旧文件可能被杀毒软件/索引服务占用，先尝试删除并重试
	_ = os.Remove(filePath)
	var out *os.File
	for retry := 0; retry < 5; retry++ {
		out, err = os.Create(filePath)
		if err == nil {
			break
		}
		if retry < 4 {
			time.Sleep(time.Duration(retry+1) * 500 * time.Millisecond)
		}
	}
	if err != nil {
		return "", localizedUpdateError{
			key:    "app.update.backend.error.package_file_busy",
			params: map[string]any{"detail": err.Error()},
		}
	}

	hasher := sha256.New()
	total := resp.ContentLength
	progressWriter := &downloadProgressWriter{
		total:      total,
		emitEvery:  120 * time.Millisecond,
		onProgress: onProgress,
	}
	writers := []io.Writer{out, hasher, progressWriter}
	if onProgress != nil {
		onProgress(0, total)
	}
	if _, err := io.Copy(io.MultiWriter(writers...), resp.Body); err != nil {
		out.Close()
		return "", err
	}
	if onProgress != nil {
		onProgress(progressWriter.written, total)
	}

	// 显式 Sync + Close，确保数据落盘且文件句柄释放
	if err := out.Sync(); err != nil {
		out.Close()
		return "", err
	}
	if err := out.Close(); err != nil {
		return "", err
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func isGitHubReleaseAssetAPIURL(urlText string) bool {
	parsed, err := urlpkg.Parse(strings.TrimSpace(urlText))
	if err != nil {
		return false
	}
	if !strings.EqualFold(parsed.Host, "api.github.com") {
		return false
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(parsed.Path)), "/releases/assets/")
}

func buildUpdateDownloadResult(info UpdateInfo, staged *stagedUpdate) updateDownloadResult {
	result := updateDownloadResult{
		Info:          info,
		Platform:      stdRuntime.GOOS,
		InstallTarget: resolveUpdateInstallTarget(),
		AutoRelaunch:  true,
	}
	if staged != nil {
		result.DownloadPath = staged.FilePath
		result.InstallLogPath = staged.InstallLogPath
	}
	return result
}

func buildUpdateInstallLogPath(baseDir string) string {
	platform := stdRuntime.GOOS
	if platform == "darwin" {
		platform = "macos"
	}
	logDir := strings.TrimSpace(baseDir)
	if logDir == "" {
		logDir = os.TempDir()
	}
	return filepath.Join(logDir, fmt.Sprintf("gonavi-update-%s-%d.log", platform, time.Now().UnixNano()))
}

func buildUpdateStageDirName(channel string, version string) string {
	return buildUpdateStageDirNameForPlatform(stdRuntime.GOOS, channel, version)
}

func buildUpdateStageDirNameForPlatform(goos string, channel string, version string) string {
	normalizedChannel, err := normalizeUpdateChannel(channel)
	if err != nil {
		normalizedChannel = updateChannelLatest
	}
	return fmt.Sprintf(
		".gonavi-update-%s-%s-%s",
		strings.TrimSpace(strings.ToLower(goos)),
		sanitizeVersionForPath(string(normalizedChannel)),
		sanitizeVersionForPath(version),
	)
}

func resolveReleaseVersion(channel updateChannel, release *githubRelease) string {
	if release == nil {
		return ""
	}

	tagVersion := normalizeVersion(release.TagName)
	if channel != updateChannelDev && tagVersion != "" && !strings.EqualFold(tagVersion, updateDevReleaseTag) {
		return tagVersion
	}

	if nameVersion := extractVersionFromReleaseName(release.Name); nameVersion != "" {
		return nameVersion
	}
	if assetVersion := extractVersionFromReleaseAssets(release.Assets); assetVersion != "" {
		return assetVersion
	}
	if tagVersion != "" && !strings.EqualFold(tagVersion, updateDevReleaseTag) {
		return tagVersion
	}
	return ""
}

func extractVersionFromReleaseName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return ""
	}

	if strings.HasPrefix(strings.ToLower(trimmed), "dev-") {
		return normalizeVersion(trimmed)
	}

	if left := strings.LastIndex(trimmed, "("); left >= 0 && strings.HasSuffix(trimmed, ")") {
		candidate := strings.TrimSpace(trimmed[left+1 : len(trimmed)-1])
		if candidate != "" {
			return normalizeVersion(candidate)
		}
	}
	return ""
}

func extractVersionFromReleaseAssets(assets []githubAsset) string {
	const assetPrefix = "GoNavi-"
	osMarkers := []string{"-Windows-", "-MacOS-", "-Linux-"}

	for _, asset := range assets {
		name := strings.TrimSpace(asset.Name)
		if !strings.HasPrefix(name, assetPrefix) {
			continue
		}
		rest := strings.TrimPrefix(name, assetPrefix)
		for _, marker := range osMarkers {
			index := strings.Index(rest, marker)
			if index <= 0 {
				continue
			}
			candidate := normalizeVersion(rest[:index])
			if candidate != "" {
				return candidate
			}
		}
	}
	return ""
}

func sanitizeVersionForPath(version string) string {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" {
		return "latest"
	}

	var builder strings.Builder
	lastDash := false
	for _, r := range trimmed {
		isAllowed := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-'
		if isAllowed {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteRune('-')
			lastDash = true
		}
	}

	result := strings.Trim(builder.String(), "-")
	if result == "" {
		return "latest"
	}
	return result
}

func resolveLegacyUpdateWorkspaceDir() string {
	return filepath.Join(os.TempDir(), "gonavi-updates")
}

func resolveUpdateWorkspaceDir(version string) string {
	// macOS 更新包继续保存在桌面版本目录根级，方便用户直接处理 DMG。
	if stdRuntime.GOOS == "darwin" {
		homeDir, err := os.UserHomeDir()
		if err == nil && strings.TrimSpace(homeDir) != "" {
			desktopDir := filepath.Join(homeDir, "Desktop")
			if st, statErr := os.Stat(desktopDir); statErr == nil && st.IsDir() {
				return filepath.Join(desktopDir, fmt.Sprintf("GoNavi-%s", sanitizeVersionForPath(version)))
			}
		}
	}

	// Windows / Linux 更新包优先落到当前应用运行目录，方便用户直接找到下载产物。
	targetPath := strings.TrimSpace(updateResolveInstallTarget())
	if targetPath != "" {
		targetDir := strings.TrimSpace(filepath.Dir(targetPath))
		if targetDir != "" && targetDir != "." {
			return targetDir
		}
	}

	return resolveLegacyUpdateWorkspaceDir()
}

func resolveUpdateAssetPath(workspaceDir string, stagedDir string, assetName string) string {
	name := strings.TrimSpace(assetName)
	if shouldStoreUpdateAssetInWorkspaceRoot(stdRuntime.GOOS) {
		return filepath.Join(workspaceDir, name)
	}
	return filepath.Join(stagedDir, name)
}

func shouldStoreUpdateAssetInWorkspaceRoot(goos string) bool {
	switch strings.TrimSpace(strings.ToLower(goos)) {
	case "darwin", "windows", "linux":
		return true
	default:
		return false
	}
}

func resolveUpdateStagedDir(workspaceDir string, channel string, version string) string {
	return resolveUpdateStagedDirForPlatform(stdRuntime.GOOS, workspaceDir, channel, version)
}

func resolveUpdateStagedDirForPlatform(goos string, workspaceDir string, channel string, version string) string {
	baseDir := strings.TrimSpace(workspaceDir)
	if strings.EqualFold(strings.TrimSpace(goos), "windows") || baseDir == "" {
		baseDir = resolveLegacyUpdateWorkspaceDir()
	}
	return filepath.Join(baseDir, buildUpdateStageDirNameForPlatform(goos, channel, version))
}

func shouldReuseUpdateAssetFromStagedDirForPlatform(goos string, assetName string) bool {
	return !(strings.EqualFold(strings.TrimSpace(goos), "windows") &&
		shouldWindowsUpdateLaunchDownloadedAssetDirectly(assetName))
}

func normalizeUpdatePathForPrefixCheck(path string) string {
	normalized := strings.ReplaceAll(strings.TrimSpace(path), "\\", "/")
	normalized = filepath.ToSlash(filepath.Clean(normalized))
	if normalized == "." {
		return ""
	}
	return strings.TrimRight(normalized, "/")
}

func isUpdateAssetPathInsideStagedDir(filePath string, stagedDir string) bool {
	normalizedFilePath := normalizeUpdatePathForPrefixCheck(filePath)
	normalizedStagedDir := normalizeUpdatePathForPrefixCheck(stagedDir)
	if normalizedFilePath == "" || normalizedStagedDir == "" {
		return false
	}
	return normalizedFilePath == normalizedStagedDir || strings.HasPrefix(normalizedFilePath, normalizedStagedDir+"/")
}

func buildReusableUpdatePathCandidatesForPlatform(goos string, preferredWorkspaceDir string, legacyWorkspaceDir string, channel string, version string, assetName string) []updatePathCandidate {
	preferredWorkspaceDir = strings.TrimSpace(preferredWorkspaceDir)
	legacyWorkspaceDir = strings.TrimSpace(legacyWorkspaceDir)
	assetName = strings.TrimSpace(assetName)
	preferredStagedDir := resolveUpdateStagedDirForPlatform(goos, preferredWorkspaceDir, channel, version)
	stagedDirNames := []string{
		buildUpdateStageDirNameForPlatform(goos, channel, version),
		fmt.Sprintf(".gonavi-update-%s-%s", strings.TrimSpace(strings.ToLower(goos)), version),
	}
	workspaceCandidates := []string{preferredWorkspaceDir, legacyWorkspaceDir}
	stageBaseCandidates := []string{preferredWorkspaceDir, legacyWorkspaceDir}
	seenWorkspace := make(map[string]struct{}, len(workspaceCandidates))
	seenStageBase := make(map[string]struct{}, len(stageBaseCandidates))
	candidates := make([]updatePathCandidate, 0, 8)

	for _, workspaceDir := range workspaceCandidates {
		workspaceDir = strings.TrimSpace(workspaceDir)
		if workspaceDir == "" {
			continue
		}
		if _, exists := seenWorkspace[workspaceDir]; exists {
			continue
		}
		seenWorkspace[workspaceDir] = struct{}{}
		if shouldStoreUpdateAssetInWorkspaceRoot(goos) {
			candidates = append(candidates, updatePathCandidate{
				workspaceDir: workspaceDir,
				stagedDir:    preferredStagedDir,
				assetPath:    filepath.Join(workspaceDir, assetName),
			})
		}
	}

	if !shouldReuseUpdateAssetFromStagedDirForPlatform(goos, assetName) {
		return candidates
	}

	for _, stageBaseDir := range stageBaseCandidates {
		stageBaseDir = strings.TrimSpace(stageBaseDir)
		if stageBaseDir == "" {
			continue
		}
		if _, exists := seenStageBase[stageBaseDir]; exists {
			continue
		}
		seenStageBase[stageBaseDir] = struct{}{}
		for _, stagedDirName := range stagedDirNames {
			stagedDir := filepath.Join(stageBaseDir, stagedDirName)
			candidates = append(candidates, updatePathCandidate{
				workspaceDir: stageBaseDir,
				stagedDir:    stagedDir,
				assetPath:    filepath.Join(stagedDir, assetName),
			})
		}
	}

	return candidates
}

func isExistingDownloadedAsset(filePath string, expectedSize int64) bool {
	path := strings.TrimSpace(filePath)
	if path == "" {
		return false
	}
	stat, err := os.Stat(path)
	if err != nil || stat.IsDir() {
		return false
	}
	if expectedSize > 0 && stat.Size() != expectedSize {
		return false
	}
	return true
}

func resolveReusableStagedUpdate(info UpdateInfo, current *stagedUpdate) *stagedUpdate {
	return resolveReusableStagedUpdateForPlatform(
		stdRuntime.GOOS,
		resolveUpdateWorkspaceDir(strings.TrimSpace(info.LatestVersion)),
		resolveLegacyUpdateWorkspaceDir(),
		info,
		current,
	)
}

func resolveReusableStagedUpdateForPlatform(goos string, preferredWorkspaceDir string, legacyWorkspaceDir string, info UpdateInfo, current *stagedUpdate) *stagedUpdate {
	channel, err := normalizeUpdateChannel(info.Channel)
	if err != nil {
		channel = updateChannelLatest
	}
	version := strings.TrimSpace(info.LatestVersion)
	assetName := strings.TrimSpace(info.AssetName)
	if version == "" || assetName == "" {
		return nil
	}
	allowStagedDirReuse := shouldReuseUpdateAssetFromStagedDirForPlatform(goos, assetName)

	if current != nil {
		currentChannel := current.Channel
		if currentChannel == "" {
			currentChannel = updateChannelLatest
		}
		if currentChannel == channel && strings.TrimSpace(current.Version) == version {
			currentPath := strings.TrimSpace(current.FilePath)
			if isExistingDownloadedAsset(currentPath, info.AssetSize) {
				if !allowStagedDirReuse && isUpdateAssetPathInsideStagedDir(currentPath, current.StagedDir) {
					current = nil
				} else {
					if strings.TrimSpace(current.InstallLogPath) == "" {
						current.InstallLogPath = buildUpdateInstallLogPath(filepath.Dir(currentPath))
					}
					current.Channel = channel
					return current
				}
			}
		}
	}

	candidates := buildReusableUpdatePathCandidatesForPlatform(
		goos,
		preferredWorkspaceDir,
		legacyWorkspaceDir,
		string(channel),
		version,
		assetName,
	)
	for _, candidate := range candidates {
		if !isExistingDownloadedAsset(candidate.assetPath, info.AssetSize) {
			continue
		}
		return &stagedUpdate{
			Channel:        channel,
			Version:        version,
			AssetName:      assetName,
			FilePath:       candidate.assetPath,
			StagedDir:      candidate.stagedDir,
			InstallLogPath: buildUpdateInstallLogPath(candidate.workspaceDir),
		}
	}

	return nil
}

func resolveUpdateInstallTarget() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exePath, _ = filepath.EvalSymlinks(exePath)
	if stdRuntime.GOOS == "darwin" {
		return resolveMacUpdateTarget(exePath)
	}
	return exePath
}

func ensureWindowsUpdateTargetWritable(targetExe string) error {
	targetExe = strings.TrimSpace(targetExe)
	targetDir := strings.TrimSpace(filepath.Dir(targetExe))
	if targetExe == "" || targetDir == "" || targetDir == "." {
		return localizedUpdateError{key: "app.update.backend.error.install_target_unresolved"}
	}

	probePath := filepath.Join(targetDir, fmt.Sprintf(".gonavi-update-write-probe-%d.tmp", time.Now().UnixNano()))
	file, err := os.OpenFile(probePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return localizedUpdateError{
			key: "app.update.backend.error.install_target_not_writable",
			params: map[string]any{
				"path":   targetDir,
				"detail": err.Error(),
			},
		}
	}
	if closeErr := file.Close(); closeErr != nil {
		logger.Warnf("关闭 Windows 更新写入探针失败：%v", closeErr)
	}
	if removeErr := os.Remove(probePath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		logger.Warnf("清理 Windows 更新写入探针失败：%v", removeErr)
	}
	return nil
}

func shouldWindowsUpdateLaunchDownloadedAssetDirectly(assetPath string) bool {
	return strings.EqualFold(strings.TrimSpace(filepath.Ext(strings.TrimSpace(assetPath))), ".exe")
}

func (a *App) emitUpdateDownloadProgress(status string, downloaded, total int64, message string) {
	if a.ctx == nil {
		return
	}
	payload := updateDownloadProgressPayload{
		Status:     status,
		Percent:    0,
		Downloaded: downloaded,
		Total:      total,
		Message:    strings.TrimSpace(message),
	}
	if total > 0 {
		payload.Percent = math.Min(100, (float64(downloaded)/float64(total))*100)
	}
	if status == "done" && payload.Percent < 100 {
		payload.Percent = 100
	}
	uievents.Emit(a.ctx, updateDownloadProgressEvent, payload)
}

func launchUpdateScript(staged *stagedUpdate) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	exePath, _ = filepath.EvalSymlinks(exePath)
	pid := os.Getpid()

	switch stdRuntime.GOOS {
	case "windows":
		return launchWindowsUpdate(staged, exePath, pid)
	case "darwin":
		return launchMacUpdate(staged, exePath, pid)
	case "linux":
		return launchLinuxUpdate(staged, exePath, pid)
	default:
		return localizedUpdateError{
			key:    "app.update.backend.error.install_unsupported",
			params: map[string]any{"platform": stdRuntime.GOOS},
		}
	}
}

func launchWindowsUpdate(staged *stagedUpdate, targetExe string, pid int) error {
	if err := os.MkdirAll(staged.StagedDir, 0o755); err != nil {
		return err
	}
	scriptPath := filepath.Join(staged.StagedDir, "update.cmd")
	logPath := strings.TrimSpace(staged.InstallLogPath)
	if logPath == "" {
		logPath = buildUpdateInstallLogPath(filepath.Dir(staged.FilePath))
		staged.InstallLogPath = logPath
	}
	content := buildWindowsScript(staged.FilePath, targetExe, staged.StagedDir, logPath, pid)
	if err := os.WriteFile(scriptPath, []byte(content), 0o644); err != nil {
		return err
	}

	logger.Infof("启动 Windows 更新脚本：target=%s script=%s log=%s", targetExe, scriptPath, logPath)
	cmd := buildWindowsLaunchCommand(scriptPath)
	if err := cmd.Start(); err != nil {
		return err
	}
	if cmd.Process != nil {
		if err := cmd.Process.Release(); err != nil {
			logger.Warnf("释放 Windows 更新脚本进程句柄失败：%v", err)
		}
	}
	return nil
}

func launchMacUpdate(staged *stagedUpdate, targetExe string, pid int) error {
	targetApp := resolveMacUpdateTarget(targetExe)
	mountDir := filepath.Join(staged.StagedDir, "mnt")
	if err := os.MkdirAll(mountDir, 0o755); err != nil {
		return err
	}
	logPath := strings.TrimSpace(staged.InstallLogPath)
	if logPath == "" {
		logPath = buildUpdateInstallLogPath(filepath.Dir(staged.FilePath))
		staged.InstallLogPath = logPath
	}

	scriptPath := filepath.Join(staged.StagedDir, "update.sh")
	content := buildMacScript(staged.FilePath, targetApp, staged.StagedDir, mountDir, logPath, pid)
	if err := os.WriteFile(scriptPath, []byte(content), 0o755); err != nil {
		return err
	}

	cmd := exec.Command("/bin/bash", scriptPath)
	logger.Infof("启动 macOS 更新脚本：target=%s script=%s log=%s", targetApp, scriptPath, logPath)
	return cmd.Start()
}

func launchLinuxUpdate(staged *stagedUpdate, targetExe string, pid int) error {
	scriptPath := filepath.Join(staged.StagedDir, "update.sh")
	content := buildLinuxScript(staged.FilePath, targetExe, staged.StagedDir, pid)
	if err := os.WriteFile(scriptPath, []byte(content), 0o755); err != nil {
		return err
	}

	cmd := exec.Command("/bin/sh", scriptPath)
	return cmd.Start()
}

func buildWindowsScript(source, target, stagedDir, logPath string, pid int) string {
	script := `@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SOURCE=__GONAVI_UPDATE_SOURCE__"
set "TARGET=__GONAVI_UPDATE_TARGET__"
set "TARGET_OLD=%TARGET%.old"
set "STAGED=__GONAVI_UPDATE_STAGED__"
set "LOG_FILE=__GONAVI_UPDATE_LOG__"
set PID=__GONAVI_UPDATE_PID__
set /a WAIT_PID_SECONDS=0

call :log updater started
if not exist "%SOURCE%" (
  call :log source file not found: %SOURCE%
  exit /b 1
)

for %%I in ("%TARGET%") do set "TARGET_NAME=%%~nxI"
for %%I in ("%TARGET%") do set "TARGET_DIR=%%~dpI"
for %%I in ("%SOURCE%") do set "SOURCE_EXT=%%~xI"
set "SOURCE_EXE="
set "SOURCE_DIR="

if /I "%SOURCE_EXT%"==".zip" (
  set "EXTRACT_DIR=%STAGED%\_extract"
  if exist "%EXTRACT_DIR%" (
    rmdir /S /Q "%EXTRACT_DIR%" >> "%LOG_FILE%" 2>&1
  )
  mkdir "%EXTRACT_DIR%" >> "%LOG_FILE%" 2>&1
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$src=$env:SOURCE; $dst=$env:EXTRACT_DIR; Expand-Archive -LiteralPath $src -DestinationPath $dst -Force" >> "%LOG_FILE%" 2>&1
  if !ERRORLEVEL! NEQ 0 (
    call :log expand zip failed: %SOURCE%
    exit /b 1
  )
  if exist "%EXTRACT_DIR%\%TARGET_NAME%" (
    set "SOURCE_EXE=%EXTRACT_DIR%\%TARGET_NAME%"
  ) else (
    for /R "%EXTRACT_DIR%" %%F in (*.exe) do (
      if not defined SOURCE_EXE (
        set "SOURCE_EXE=%%~fF"
      )
    )
  )
  if not defined SOURCE_EXE (
    call :log no executable found in portable zip: %SOURCE%
    exit /b 1
  )
) else (
  set "SOURCE_EXE=%SOURCE%"
)
for %%I in ("%SOURCE_EXE%") do set "SOURCE_DIR=%%~dpI"

:waitloop
tasklist /FI "PID eq %PID%" | find "%PID%" >nul
if %ERRORLEVEL%==0 (
  if !WAIT_PID_SECONDS! GEQ 90 (
    call :log host process still running after !WAIT_PID_SECONDS! seconds, aborting update
    exit /b 1
  )
  timeout /t 1 /nobreak >nul
  set /a WAIT_PID_SECONDS+=1
  goto waitloop
)
call :log host process exited

rem -- Win10 needs extra time for kernel to release exe file handles --
timeout /t 3 /nobreak >nul
call :log cooldown finished, starting file replace

if /I "%SOURCE_EXT%"==".zip" goto replace_from_zip
goto launch_downloaded_exe

:launch_downloaded_exe
if not exist "%SOURCE_EXE%" (
  call :log downloaded executable not found: %SOURCE_EXE%
  exit /b 1
)
call :log launching downloaded executable: %SOURCE_EXE%
start "" /D "%SOURCE_DIR%" "%SOURCE_EXE%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
  call :log cmd start failed, trying powershell Start-Process
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%SOURCE_EXE%' -WorkingDirectory '%SOURCE_DIR%'" >> "%LOG_FILE%" 2>&1
  if !ERRORLEVEL! NEQ 0 (
    call :log relaunch failed
    exit /b 1
  )
)
call :log update finished
exit /b 0

:replace_from_zip
set /a RETRY=0
:move_retry
call :log attempt !RETRY!: trying rename-then-copy strategy
move /Y "%TARGET%" "%TARGET_OLD%" >> "%LOG_FILE%" 2>&1
if !ERRORLEVEL!==0 (
  copy /Y "%SOURCE_EXE%" "%TARGET%" >> "%LOG_FILE%" 2>&1
  if !ERRORLEVEL!==0 (
    del /F /Q "%TARGET_OLD%" >> "%LOG_FILE%" 2>&1
    goto move_done
  )
  call :log copy after rename failed, restoring old file
  move /Y "%TARGET_OLD%" "%TARGET%" >> "%LOG_FILE%" 2>&1
)

call :log rename strategy failed, trying direct move
move /Y "%SOURCE_EXE%" "%TARGET%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL%==0 goto move_done

copy /Y "%SOURCE_EXE%" "%TARGET%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL%==0 goto move_done

set /a RETRY+=1
if !RETRY! LSS 15 (
  set /a WAIT=1
  if !RETRY! GEQ 3 set /a WAIT=2
  if !RETRY! GEQ 6 set /a WAIT=3
  if !RETRY! GEQ 9 set /a WAIT=5
  call :log waiting !WAIT! seconds before retry
  timeout /t !WAIT! /nobreak >nul
  goto move_retry
)

call :log replace failed after retries (portable mode, no elevation): check directory write permission or file lock
exit /b 1

:move_done
del /F /Q "%TARGET_OLD%" >> "%LOG_FILE%" 2>&1
start "" /D "%TARGET_DIR%" "%TARGET%" >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
  call :log cmd start failed, trying powershell Start-Process
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%TARGET%' -WorkingDirectory '%TARGET_DIR%'" >> "%LOG_FILE%" 2>&1
  if !ERRORLEVEL! NEQ 0 (
    call :log relaunch failed
    exit /b 1
  )
)
rmdir /S /Q "%STAGED%" >> "%LOG_FILE%" 2>&1
call :log update finished
exit /b 0

:log
echo [%date% %time%] %*>>"%LOG_FILE%"
exit /b 0
`
	return strings.NewReplacer(
		"__GONAVI_UPDATE_SOURCE__", source,
		"__GONAVI_UPDATE_TARGET__", target,
		"__GONAVI_UPDATE_STAGED__", stagedDir,
		"__GONAVI_UPDATE_LOG__", logPath,
		"__GONAVI_UPDATE_PID__", strconv.Itoa(pid),
	).Replace(strings.ReplaceAll(script, "\n", "\r\n"))
}

func buildWindowsLaunchCommand(scriptPath string) *exec.Cmd {
	cmd := exec.Command("cmd.exe", "/D", "/C", "call", scriptPath)
	configureWindowsUpdateCommand(cmd)
	return cmd
}

func buildMacScript(dmgPath, targetApp, stagedDir, mountDir, logPath string, pid int) string {
	return fmt.Sprintf(`#!/bin/bash
set -euo pipefail
PID=%d
DMG="%s"
TARGET_APP="%s"
STAGED="%s"
MOUNT_DIR="%s"
LOG_FILE="%s"
TMP_APP="${TARGET_APP}.new"
BACKUP_APP="${TARGET_APP}.backup"
APP_BIN_NAME=$(basename "$TARGET_APP" .app)
APP_BIN_REL="Contents/MacOS/$APP_BIN_NAME"

log() {
  echo "[$(date '+%%Y-%%m-%%d %%H:%%M:%%S')] $*" >> "$LOG_FILE"
}

run_admin_replace() {
  /usr/bin/osascript <<'APPLESCRIPT' "$APP_SRC" "$TARGET_APP" "$TMP_APP" "$BACKUP_APP" "$APP_BIN_REL" "$LOG_FILE"
on run argv
  set srcPath to item 1 of argv
  set dstPath to item 2 of argv
  set tmpPath to item 3 of argv
  set bakPath to item 4 of argv
  set binRel to item 5 of argv
  set logPath to item 6 of argv
  set cmd to "set -eu; " & ¬
    "rm -rf " & quoted form of tmpPath & " " & quoted form of bakPath & "; " & ¬
    "/usr/bin/ditto " & quoted form of srcPath & " " & quoted form of tmpPath & "; " & ¬
    "if [ ! -x " & quoted form of (tmpPath & "/" & binRel) & " ]; then echo 'tmp app binary missing' >> " & quoted form of logPath & "; exit 1; fi; " & ¬
    "xattr -rd com.apple.quarantine " & quoted form of tmpPath & " >> " & quoted form of logPath & " 2>&1 || true; " & ¬
    "if [ -d " & quoted form of dstPath & " ]; then mv " & quoted form of dstPath & " " & quoted form of bakPath & "; fi; " & ¬
    "mv " & quoted form of tmpPath & " " & quoted form of dstPath & "; " & ¬
    "rm -rf " & quoted form of bakPath & "; " & ¬
    "xattr -rd com.apple.quarantine " & quoted form of dstPath & " >> " & quoted form of logPath & " 2>&1 || true"
  do shell script cmd with administrator privileges
end run
APPLESCRIPT
}

replace_app_direct() {
  rm -rf "$TMP_APP" "$BACKUP_APP" >>"$LOG_FILE" 2>&1 || true
  /usr/bin/ditto "$APP_SRC" "$TMP_APP" >>"$LOG_FILE" 2>&1
  if [ ! -x "$TMP_APP/$APP_BIN_REL" ]; then
    log "tmp app binary missing: $TMP_APP/$APP_BIN_REL"
    return 1
  fi
  xattr -rd com.apple.quarantine "$TMP_APP" >>"$LOG_FILE" 2>&1 || true
  if [ -d "$TARGET_APP" ]; then
    mv "$TARGET_APP" "$BACKUP_APP" >>"$LOG_FILE" 2>&1
  fi
  if ! mv "$TMP_APP" "$TARGET_APP" >>"$LOG_FILE" 2>&1; then
    log "move new app failed, trying rollback"
    rm -rf "$TARGET_APP" >>"$LOG_FILE" 2>&1 || true
    if [ -d "$BACKUP_APP" ]; then
      mv "$BACKUP_APP" "$TARGET_APP" >>"$LOG_FILE" 2>&1 || true
    fi
    return 1
  fi
  rm -rf "$BACKUP_APP" >>"$LOG_FILE" 2>&1 || true
  xattr -rd com.apple.quarantine "$TARGET_APP" >>"$LOG_FILE" 2>&1 || true
  return 0
}

relaunch_app() {
  if /usr/bin/open -n "$TARGET_APP" >>"$LOG_FILE" 2>&1; then
    return 0
  fi
  log "open -n failed, trying binary launch"
  "$TARGET_APP/$APP_BIN_REL" >>"$LOG_FILE" 2>&1 &
  return 0
}

log "updater started"
while kill -0 $PID 2>/dev/null; do
  sleep 1
done
log "host process exited"
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT_DIR" >>"$LOG_FILE" 2>&1
APP_SRC=$(ls "$MOUNT_DIR"/*.app 2>/dev/null | head -n 1 || true)
if [ -z "$APP_SRC" ]; then
  log "no .app found inside dmg"
  hdiutil detach "$MOUNT_DIR" -quiet >>"$LOG_FILE" 2>&1 || true
  exit 1
fi

log "install target: $TARGET_APP"
if ! replace_app_direct; then
  log "direct replace failed, trying admin replace"
  run_admin_replace >>"$LOG_FILE" 2>&1
fi

if [ ! -x "$TARGET_APP/$APP_BIN_REL" ]; then
  log "target app binary missing after replace: $TARGET_APP/$APP_BIN_REL"
  hdiutil detach "$MOUNT_DIR" -quiet >>"$LOG_FILE" 2>&1 || true
  exit 1
fi

hdiutil detach "$MOUNT_DIR" -quiet >>"$LOG_FILE" 2>&1 || true
rm -rf "$MOUNT_DIR" "$DMG" "$STAGED" >>"$LOG_FILE" 2>&1 || true
relaunch_app
log "relaunch requested"
	`, pid, dmgPath, targetApp, stagedDir, mountDir, logPath)
}

func buildLinuxScript(tarPath, targetExe, stagedDir string, pid int) string {
	return fmt.Sprintf(`#!/bin/bash
set -e
PID=%d
ARCHIVE="%s"
TARGET="%s"
STAGED="%s"
while kill -0 $PID 2>/dev/null; do
  sleep 1
done
TMPDIR=$(mktemp -d)
tar -xzf "$ARCHIVE" -C "$TMPDIR"
TARGET_NAME="$(basename "$TARGET")"
NEWBIN="$TMPDIR/$TARGET_NAME"
if [ ! -f "$NEWBIN" ]; then
  NEWBIN=$(find "$TMPDIR" -type f -name "$TARGET_NAME" | head -n 1)
fi
if [ -z "$NEWBIN" ] || [ ! -f "$NEWBIN" ]; then
  NEWBIN=$(find "$TMPDIR" -type f -name "GoNavi" | head -n 1)
fi
if [ -z "$NEWBIN" ] || [ ! -f "$NEWBIN" ]; then
  exit 1
fi
cp -f "$NEWBIN" "$TARGET"
chmod +x "$TARGET"
rm -rf "$TMPDIR" "$ARCHIVE" "$STAGED"
"$TARGET" &
`, pid, tarPath, targetExe, stagedDir)
}

func detectMacAppPath(exePath string) string {
	parts := strings.Split(exePath, string(filepath.Separator))
	for i := len(parts) - 1; i >= 0; i-- {
		if strings.HasSuffix(parts[i], ".app") {
			appPath := filepath.Join(parts[:i+1]...)
			// 确保返回绝对路径
			if !filepath.IsAbs(appPath) {
				appPath = string(filepath.Separator) + appPath
			}
			return appPath
		}
	}
	return ""
}

func resolveMacUpdateTarget(exePath string) string {
	targetApp := detectMacAppPath(exePath)
	if targetApp == "" {
		return "/Applications/GoNavi.app"
	}
	targetApp = filepath.Clean(targetApp)
	// Gatekeeper App Translocation 路径不可用于稳定覆盖更新，统一回退到 /Applications。
	if strings.Contains(targetApp, string(filepath.Separator)+"AppTranslocation"+string(filepath.Separator)) {
		logger.Warnf("检测到 AppTranslocation 运行路径，更新目标回退至 /Applications/GoNavi.app：%s", targetApp)
		return "/Applications/GoNavi.app"
	}
	return targetApp
}

func normalizeVersion(version string) string {
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(version, "v")
	return version
}

func compareVersion(current, latest string) int {
	current = normalizeVersion(current)
	latest = normalizeVersion(latest)
	if current == "" {
		return -1
	}
	if current == latest {
		return 0
	}

	curParts := splitVersionParts(current)
	latParts := splitVersionParts(latest)
	max := len(curParts)
	if len(latParts) > max {
		max = len(latParts)
	}
	for i := 0; i < max; i++ {
		cur := 0
		lat := 0
		if i < len(curParts) {
			cur = curParts[i]
		}
		if i < len(latParts) {
			lat = latParts[i]
		}
		if cur < lat {
			return -1
		}
		if cur > lat {
			return 1
		}
	}
	return 0
}

func splitVersionParts(version string) []int {
	parts := strings.Split(version, ".")
	result := make([]int, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			result = append(result, 0)
			continue
		}
		num := 0
		for _, ch := range part {
			if ch < '0' || ch > '9' {
				break
			}
			num = num*10 + int(ch-'0')
		}
		result = append(result, num)
	}
	return result
}
