package app

import (
	"errors"
	"os"
	"path/filepath"
	stdRuntime "runtime"
	"strings"
	"testing"
)

func TestFetchLatestUpdateInfoSkipsChecksumWhenCurrentVersionIsAlreadyLatest(t *testing.T) {
	assetName, err := expectedAssetName(stdRuntime.GOOS, stdRuntime.GOARCH, "v0.6.5")
	if err != nil {
		t.Fatalf("expectedAssetName returned error: %v", err)
	}

	originalVersion := AppVersion
	AppVersion = "0.6.5"
	defer func() {
		AppVersion = originalVersion
	}()

	releaseCalled := false
	restoreRelease := swapUpdateFetchLatestRelease(func() (*githubRelease, error) {
		releaseCalled = true
		return &githubRelease{
			TagName: "v0.6.5",
			Name:    "v0.6.5",
			HTMLURL: "https://github.com/Syngnat/GoNavi/releases/tag/v0.6.5",
			Assets: []githubAsset{
				{
					Name:               assetName,
					BrowserDownloadURL: "https://example.com/" + assetName,
					Size:               1024,
				},
			},
		}, nil
	})
	defer restoreRelease()

	checksumCalled := false
	restoreChecksum := swapUpdateFetchReleaseSHA256(func([]githubAsset) (map[string]string, error) {
		checksumCalled = true
		return nil, errors.New("checksum should not be fetched when no update is needed")
	})
	defer restoreChecksum()

	info, err := fetchLatestUpdateInfo(updateChannelLatest)
	if err != nil {
		t.Fatalf("fetchLatestUpdateInfo returned error: %v", err)
	}
	if !releaseCalled {
		t.Fatal("expected latest release metadata to be fetched")
	}
	if checksumCalled {
		t.Fatal("expected SHA256SUMS fetch to be skipped when current version is already latest")
	}
	if info.HasUpdate {
		t.Fatalf("expected HasUpdate=false, got %#v", info)
	}
	if info.LatestVersion != "0.6.5" || info.CurrentVersion != "0.6.5" {
		t.Fatalf("unexpected version info: %#v", info)
	}
}

func TestFetchLatestUpdateInfoFetchesChecksumWhenUpdateIsAvailable(t *testing.T) {
	assetName, err := expectedAssetName(stdRuntime.GOOS, stdRuntime.GOARCH, "v0.6.5")
	if err != nil {
		t.Fatalf("expectedAssetName returned error: %v", err)
	}

	originalVersion := AppVersion
	AppVersion = "0.6.4"
	defer func() {
		AppVersion = originalVersion
	}()

	restoreRelease := swapUpdateFetchLatestRelease(func() (*githubRelease, error) {
		return &githubRelease{
			TagName: "v0.6.5",
			Name:    "v0.6.5",
			HTMLURL: "https://github.com/Syngnat/GoNavi/releases/tag/v0.6.5",
			Assets: []githubAsset{
				{
					Name:               assetName,
					BrowserDownloadURL: "https://example.com/" + assetName,
					Size:               4096,
				},
			},
		}, nil
	})
	defer restoreRelease()

	checksumCalled := false
	restoreChecksum := swapUpdateFetchReleaseSHA256(func([]githubAsset) (map[string]string, error) {
		checksumCalled = true
		return map[string]string{
			assetName: "abc123",
		}, nil
	})
	defer restoreChecksum()

	info, err := fetchLatestUpdateInfo(updateChannelLatest)
	if err != nil {
		t.Fatalf("fetchLatestUpdateInfo returned error: %v", err)
	}
	if !checksumCalled {
		t.Fatal("expected SHA256SUMS fetch when update is available")
	}
	if !info.HasUpdate {
		t.Fatalf("expected HasUpdate=true, got %#v", info)
	}
	if info.SHA256 != "abc123" || info.AssetName != assetName {
		t.Fatalf("unexpected update info: %#v", info)
	}
}

func TestCheckForUpdatesLogsFailuresForManualChecks(t *testing.T) {
	app := &App{}

	restoreRelease := swapUpdateFetchLatestRelease(func() (*githubRelease, error) {
		return nil, errors.New("request timed out")
	})
	defer restoreRelease()

	logged := 0
	restoreLogger := swapUpdateCheckErrorLogger(func(error) {
		logged++
	})
	defer restoreLogger()

	result := app.CheckForUpdates()
	if result.Success {
		t.Fatalf("expected failure result, got %#v", result)
	}
	if logged != 1 {
		t.Fatalf("expected manual check to log once, got %d", logged)
	}
}

func TestCheckForUpdatesSilentlySkipsFailureLogs(t *testing.T) {
	app := &App{}

	restoreRelease := swapUpdateFetchLatestRelease(func() (*githubRelease, error) {
		return nil, errors.New("request timed out")
	})
	defer restoreRelease()

	logged := 0
	restoreLogger := swapUpdateCheckErrorLogger(func(error) {
		logged++
	})
	defer restoreLogger()

	result := app.CheckForUpdatesSilently()
	if result.Success {
		t.Fatalf("expected failure result, got %#v", result)
	}
	if logged != 0 {
		t.Fatalf("expected silent check to skip error logging, got %d", logged)
	}
}

func TestFetchLatestUpdateInfoForDevChannelUsesReleaseBuildVersion(t *testing.T) {
	assetName, err := expectedAssetName(stdRuntime.GOOS, stdRuntime.GOARCH, "dev-a1b2c3d")
	if err != nil {
		t.Fatalf("expectedAssetName returned error: %v", err)
	}

	originalVersion := AppVersion
	AppVersion = "0.6.5"
	defer func() {
		AppVersion = originalVersion
	}()

	restoreRelease := swapUpdateFetchDevRelease(func() (*githubRelease, error) {
		return &githubRelease{
			TagName: "dev-latest",
			Name:    "🧪 Dev Build (dev-a1b2c3d)",
			HTMLURL: "https://github.com/Syngnat/GoNavi/releases/tag/dev-latest",
			Assets: []githubAsset{
				{
					Name:               assetName,
					BrowserDownloadURL: "https://example.com/" + assetName,
					Size:               8192,
				},
			},
		}, nil
	})
	defer restoreRelease()

	checksumCalled := false
	restoreChecksum := swapUpdateFetchReleaseSHA256(func([]githubAsset) (map[string]string, error) {
		checksumCalled = true
		return map[string]string{
			assetName: "def456",
		}, nil
	})
	defer restoreChecksum()

	info, err := fetchLatestUpdateInfo(updateChannelDev)
	if err != nil {
		t.Fatalf("fetchLatestUpdateInfo returned error: %v", err)
	}
	if !checksumCalled {
		t.Fatal("expected dev channel update check to fetch SHA256 when build version differs")
	}
	if !info.HasUpdate {
		t.Fatalf("expected HasUpdate=true, got %#v", info)
	}
	if info.Channel != string(updateChannelDev) {
		t.Fatalf("expected dev channel, got %#v", info)
	}
	if info.LatestVersion != "dev-a1b2c3d" {
		t.Fatalf("expected dev build version from release metadata, got %#v", info)
	}
	if info.AssetName != assetName || info.SHA256 != "def456" {
		t.Fatalf("unexpected dev update info: %#v", info)
	}
}

func TestFetchLatestUpdateInfoForDevChannelSkipsChecksumWhenBuildMatches(t *testing.T) {
	assetName, err := expectedAssetName(stdRuntime.GOOS, stdRuntime.GOARCH, "dev-a1b2c3d")
	if err != nil {
		t.Fatalf("expectedAssetName returned error: %v", err)
	}

	originalVersion := AppVersion
	AppVersion = "dev-a1b2c3d"
	defer func() {
		AppVersion = originalVersion
	}()

	restoreRelease := swapUpdateFetchDevRelease(func() (*githubRelease, error) {
		return &githubRelease{
			TagName: "dev-latest",
			Name:    "🧪 Dev Build (dev-a1b2c3d)",
			HTMLURL: "https://github.com/Syngnat/GoNavi/releases/tag/dev-latest",
			Assets: []githubAsset{
				{
					Name:               assetName,
					BrowserDownloadURL: "https://example.com/" + assetName,
					Size:               2048,
				},
			},
		}, nil
	})
	defer restoreRelease()

	checksumCalled := false
	restoreChecksum := swapUpdateFetchReleaseSHA256(func([]githubAsset) (map[string]string, error) {
		checksumCalled = true
		return nil, errors.New("checksum should not be fetched when dev build is already current")
	})
	defer restoreChecksum()

	info, err := fetchLatestUpdateInfo(updateChannelDev)
	if err != nil {
		t.Fatalf("fetchLatestUpdateInfo returned error: %v", err)
	}
	if checksumCalled {
		t.Fatal("expected dev channel checksum fetch to be skipped when build already matches")
	}
	if info.HasUpdate {
		t.Fatalf("expected HasUpdate=false, got %#v", info)
	}
	if info.Channel != string(updateChannelDev) || info.LatestVersion != "dev-a1b2c3d" {
		t.Fatalf("unexpected dev latest info: %#v", info)
	}
}

func TestSetUpdateChannelPersistsAndClearsCachedUpdateState(t *testing.T) {
	app := NewApp()
	app.configDir = t.TempDir()
	app.updateState.lastCheck = &UpdateInfo{
		HasUpdate:     true,
		Channel:       string(updateChannelLatest),
		LatestVersion: "0.6.5",
	}
	app.updateState.staged = &stagedUpdate{
		Channel:   updateChannelLatest,
		Version:   "0.6.5",
		AssetName: "GoNavi-0.6.5-Windows-Amd64.exe",
	}

	result := app.SetUpdateChannel("dev")
	if !result.Success {
		t.Fatalf("SetUpdateChannel returned failure: %#v", result)
	}

	stored, err := app.loadStoredUpdateChannel()
	if err != nil {
		t.Fatalf("loadStoredUpdateChannel returned error: %v", err)
	}
	if stored != updateChannelDev {
		t.Fatalf("expected stored dev channel, got %q", stored)
	}
	if app.updateState.lastCheck != nil || app.updateState.staged != nil {
		t.Fatalf("expected update cache to be cleared after channel switch, got %#v %#v", app.updateState.lastCheck, app.updateState.staged)
	}
}

func TestResolveReusableStagedUpdateDoesNotReuseDifferentChannelPackage(t *testing.T) {
	tempDir := t.TempDir()
	assetPath := filepath.Join(tempDir, "GoNavi-0.6.5-Windows-Amd64.exe")
	if err := os.WriteFile(assetPath, []byte("12345678"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	reused := resolveReusableStagedUpdate(
		UpdateInfo{
			Channel:       string(updateChannelLatest),
			LatestVersion: "0.6.5",
			AssetName:     filepath.Base(assetPath),
			AssetSize:     8,
		},
		&stagedUpdate{
			Channel:   updateChannelDev,
			Version:   "0.6.5",
			AssetName: filepath.Base(assetPath),
			FilePath:  assetPath,
		},
	)
	if reused != nil {
		t.Fatalf("expected staged update from another channel to be ignored, got %#v", reused)
	}
}

func TestDownloadUpdateUsesCurrentLanguageForBackendMessage(t *testing.T) {
	app := NewApp()
	app.SetLanguage("en-US")

	result := app.DownloadUpdate()
	if result.Success {
		t.Fatalf("expected failure result, got %#v", result)
	}
	if result.Message != "Check for updates first" {
		t.Fatalf("expected localized message, got %q", result.Message)
	}
}

func TestExpectedAssetNameForExecutableUsesLinuxWebKit41Suffix(t *testing.T) {
	assetName, err := expectedAssetNameForExecutable(
		"linux",
		"amd64",
		"v0.6.5",
		"/opt/GoNavi/gonavi-build-linux-amd64-webkit41",
	)
	if err != nil {
		t.Fatalf("expectedAssetNameForExecutable returned error: %v", err)
	}

	want := "GoNavi-0.6.5-Linux-Amd64-WebKit41.tar.gz"
	if assetName != want {
		t.Fatalf("unexpected linux webkit41 asset name: got %q want %q", assetName, want)
	}
}

func TestExpectedAssetNameForExecutableSupportsLinuxArm64(t *testing.T) {
	assetName, err := expectedAssetNameForExecutable(
		"linux",
		"arm64",
		"v0.6.5",
		"/opt/GoNavi/gonavi-build-linux-arm64",
	)
	if err != nil {
		t.Fatalf("expectedAssetNameForExecutable returned error: %v", err)
	}

	want := "GoNavi-0.6.5-Linux-Arm64.tar.gz"
	if assetName != want {
		t.Fatalf("unexpected linux arm64 asset name: got %q want %q", assetName, want)
	}
}

func TestBuildLinuxScriptPrefersTargetExecutableBasename(t *testing.T) {
	script := buildLinuxScript(
		"/tmp/GoNavi-0.6.5-Linux-Amd64-WebKit41.tar.gz",
		"/opt/GoNavi/gonavi-build-linux-amd64-webkit41",
		"/tmp/.gonavi-update-linux-0.6.5",
		12345,
	)

	mustContain := []string{
		`TARGET_NAME="$(basename "$TARGET")"`,
		`NEWBIN="$TMPDIR/$TARGET_NAME"`,
		`NEWBIN=$(find "$TMPDIR" -type f -name "$TARGET_NAME" | head -n 1)`,
		`NEWBIN=$(find "$TMPDIR" -type f -name "GoNavi" | head -n 1)`,
	}
	for _, want := range mustContain {
		if !strings.Contains(script, want) {
			t.Fatalf("linux update script missing required token: %s\nscript:\n%s", want, script)
		}
	}
}
