package app

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestReleaseFromUpdateManifestMapsAssets(t *testing.T) {
	release := releaseFromUpdateManifest(&updateReleaseManifest{
		TagName:     "v1.2.3",
		Version:     "1.2.3",
		Name:        "GoNavi 1.2.3",
		HTMLURL:     "https://github.com/Syngnat/GoNavi/releases/tag/v1.2.3",
		PublishedAt: "2026-07-09T00:00:00Z",
		Assets: []updateManifestAsset{
			{
				Name:   "GoNavi-1.2.3-Windows-Amd64.exe",
				URL:    "https://example.com/app.exe",
				SHA256: "Aa" + strings.Repeat("b", 62),
				Size:   99,
			},
		},
	})
	if release == nil {
		t.Fatal("expected release")
	}
	if release.TagName != "v1.2.3" || len(release.Assets) != 1 {
		t.Fatalf("unexpected release: %#v", release)
	}
	if release.Assets[0].BrowserDownloadURL != "https://example.com/app.exe" {
		t.Fatalf("url = %q", release.Assets[0].BrowserDownloadURL)
	}
	if !strings.HasPrefix(release.Assets[0].Digest, "sha256:") {
		t.Fatalf("digest = %q", release.Assets[0].Digest)
	}
}

func TestDiskUpdateManifestRoundTrip(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GONAVI_DATA_ROOT", root)

	payload := &updateReleaseManifest{
		SchemaVersion: 1,
		Channel:       "latest",
		TagName:       "v9.9.9",
		Version:       "9.9.9",
		Name:          "v9.9.9",
		HTMLURL:       "https://github.com/Syngnat/GoNavi/releases/tag/v9.9.9",
		Assets: []updateManifestAsset{
			{Name: "app.bin", URL: "https://example.com/app.bin", SHA256: strings.Repeat("c", 64), Size: 1},
		},
		FetchedAt: time.Now().UTC(),
	}
	storeDiskUpdateManifest(updateChannelLatest, payload)
	loaded, stale := loadDiskUpdateManifest(updateChannelLatest)
	if loaded == nil || stale {
		t.Fatalf("expected fresh disk cache, got %#v stale=%v", loaded, stale)
	}
	if loaded.Version != "9.9.9" {
		t.Fatalf("version = %q", loaded.Version)
	}
	path := updateManifestCachePath(updateChannelLatest)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("cache file missing: %v", err)
	}
	if !strings.HasPrefix(path, root) {
		t.Fatalf("cache path not under data root: %s", path)
	}
}

func TestFetchReleaseForChannelPreferringStaticUsesStaticFirst(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GONAVI_DATA_ROOT", root)
	updateReleaseCache = sync.Map{}

	staticCalled := false
	apiCalled := false
	restoreStatic := swapUpdateFetchStaticManifest(func(channel updateChannel) (*githubRelease, error) {
		staticCalled = true
		return &githubRelease{TagName: "v2.0.0", Name: "v2.0.0"}, nil
	})
	defer restoreStatic()
	restoreAPI := swapUpdateFetchLatestRelease(func() (*githubRelease, error) {
		apiCalled = true
		return nil, errors.New("api should not be called")
	})
	defer restoreAPI()

	release, err := fetchReleaseForChannelPreferringStatic(updateChannelLatest, true)
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if !staticCalled || apiCalled {
		t.Fatalf("staticCalled=%v apiCalled=%v", staticCalled, apiCalled)
	}
	if release.TagName != "v2.0.0" {
		t.Fatalf("tag=%q", release.TagName)
	}
}

func TestFetchReleaseForChannelPreferringStaticFallsBackAPIThenDisk(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GONAVI_DATA_ROOT", root)
	updateReleaseCache = sync.Map{}

	storeDiskUpdateManifest(updateChannelLatest, &updateReleaseManifest{
		SchemaVersion: 1,
		TagName:       "v1.0.0",
		Version:       "1.0.0",
		Assets:        []updateManifestAsset{{Name: "a", URL: "https://example.com/a"}},
		FetchedAt:     time.Now().UTC(),
	})

	restoreStatic := swapUpdateFetchStaticManifest(func(channel updateChannel) (*githubRelease, error) {
		return nil, errors.New("static 404")
	})
	defer restoreStatic()
	restoreAPI := swapUpdateFetchLatestRelease(func() (*githubRelease, error) {
		return nil, errors.New("api rate limit")
	})
	defer restoreAPI()

	release, err := fetchReleaseForChannelPreferringStatic(updateChannelLatest, true)
	if err != nil {
		t.Fatalf("expected disk fallback, err=%v", err)
	}
	if release.TagName != "v1.0.0" {
		t.Fatalf("tag=%q", release.TagName)
	}
}

func TestSilentCheckThrottleReusesDisk(t *testing.T) {
	root := t.TempDir()
	t.Setenv("GONAVI_DATA_ROOT", root)
	updateReleaseCache = sync.Map{}
	storeDiskUpdateManifest(updateChannelLatest, &updateReleaseManifest{
		SchemaVersion: 1,
		TagName:       "v3.0.0",
		Version:       "3.0.0",
		Assets:        []updateManifestAsset{{Name: "a", URL: "u"}},
		FetchedAt:     time.Now().UTC(),
	})
	markUpdateNetworkCheck(updateChannelLatest)

	staticCalls := 0
	restoreStatic := swapUpdateFetchStaticManifest(func(channel updateChannel) (*githubRelease, error) {
		staticCalls++
		return nil, errors.New("should not hit network")
	})
	defer restoreStatic()
	restoreAPI := swapUpdateFetchLatestRelease(func() (*githubRelease, error) {
		t.Fatal("api should not be called during throttle")
		return nil, nil
	})
	defer restoreAPI()

	release, err := fetchReleaseForChannelPreferringStatic(updateChannelLatest, false)
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if release.TagName != "v3.0.0" {
		t.Fatalf("tag=%q", release.TagName)
	}
	if staticCalls != 0 {
		t.Fatalf("staticCalls=%d", staticCalls)
	}
}

func TestUpdateManifestFromGitHubRelease(t *testing.T) {
	release := &githubRelease{
		TagName: "v1.0.1",
		Name:    "v1.0.1",
		HTMLURL: "https://github.com/Syngnat/GoNavi/releases/tag/v1.0.1",
		Assets: []githubAsset{
			{Name: "a.exe", BrowserDownloadURL: "https://x/a.exe", Digest: "sha256:" + strings.Repeat("d", 64), Size: 10},
		},
	}
	m := updateManifestFromGitHubRelease(updateChannelLatest, release, nil)
	if m == nil || m.Version == "" || len(m.Assets) != 1 {
		t.Fatalf("manifest=%#v", m)
	}
	_ = json.Marshal
}
