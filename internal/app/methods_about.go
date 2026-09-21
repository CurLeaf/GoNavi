package app

// 「关于 GoNavi」页所需的静态应用信息。
//
// 应用内更新检查移除后，这一页仍然需要展示版本号与项目入口，因此这里只保留
// 只读的构建/仓库信息，不再向上层暴露任何更新通道或下载状态。

import (
	"os"
	"strings"

	"GoNavi-Wails/internal/connection"
)

// projectRepoSlug 是「关于」页项目入口指向的官方仓库。
const projectRepoSlug = "Syngnat/GoNavi"

type AppInfo struct {
	Version      string `json:"version"`
	Author       string `json:"author"`
	RepoURL      string `json:"repoUrl,omitempty"`
	IssueURL     string `json:"issueUrl,omitempty"`
	ReleaseURL   string `json:"releaseUrl,omitempty"`
	CommunityURL string `json:"communityUrl,omitempty"`
	BuildTime    string `json:"buildTime,omitempty"`
}

func getCurrentAuthor() string {
	if env := strings.TrimSpace(os.Getenv("GONAVI_AUTHOR")); env != "" {
		return env
	}
	if owner, _, ok := strings.Cut(projectRepoSlug, "/"); ok {
		return owner
	}
	return ""
}

func (a *App) GetAppInfo() connection.QueryResult {
	info := AppInfo{
		Version:      getCurrentVersion(),
		Author:       getCurrentAuthor(),
		RepoURL:      "https://github.com/" + projectRepoSlug,
		IssueURL:     "https://github.com/" + projectRepoSlug + "/issues",
		ReleaseURL:   "https://github.com/" + projectRepoSlug + "/releases",
		CommunityURL: "https://aibook.ren",
		BuildTime:    strings.TrimSpace(AppBuildTime),
	}
	return connection.QueryResult{Success: true, Message: "OK", Data: info}
}
