package app

// GitHub Release 资源客户端。
//
// 负责 Release / 资产元数据、下载请求头、网络错误归类、SHA256 归一化与
// 带进度的流式写入。驱动在线下载（internal/app/methods_driver*.go、
// parallel_download.go）与全局代理诊断共用这一层，因此这里不依赖任何
// 应用更新状态。

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	urlpkg "net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	// githubAPIVersion 是 GitHub REST API 的固定版本头。
	githubAPIVersion = "2022-11-28"
	// downloadNetworkRetryDelay 是网络抖动重试的退避基数。
	downloadNetworkRetryDelay = 250 * time.Millisecond
	// httpErrorBodySnippetLimit 限制错误响应体被截断进日志的长度。
	httpErrorBodySnippetLimit = 240
)

type githubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	HTMLURL     string        `json:"html_url"`
	PublishedAt string        `json:"published_at"`
	Body        string        `json:"body"`
	Prerelease  bool          `json:"prerelease"`
	Assets      []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	URL                string `json:"url"`
	Digest             string `json:"digest"`
	Size               int64  `json:"size"`
}

// localizedDownloadError 携带 i18n 键的错误，由绑定层用 a.appText 翻译。
type localizedDownloadError struct {
	key        string
	params     map[string]any
	httpStatus int
}

func (e localizedDownloadError) Error() string {
	return e.key
}

func normalizeVersion(version string) string {
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(version, "v")
	return version
}

// normalizeGitHubAssetSHA256 把 GitHub 的 "sha256:<hex>" 摘要归一化成小写 hex。
func normalizeGitHubAssetSHA256(digest string) string {
	digest = strings.TrimSpace(digest)
	if digest == "" {
		return ""
	}
	if algorithm, value, ok := strings.Cut(digest, ":"); ok {
		if !strings.EqualFold(strings.TrimSpace(algorithm), "sha256") {
			return ""
		}
		digest = strings.TrimSpace(value)
	}
	return strings.ToLower(digest)
}

func downloadFileWithHash(url, filePath string, onProgress func(downloaded, total int64)) (string, error) {
	return downloadFileWithHashWithTimeout(url, filePath, onProgress, 10*time.Minute)
}

func downloadFileWithHashWithTimeout(url, filePath string, onProgress func(downloaded, total int64), timeout time.Duration) (string, error) {
	return downloadFileWithHashParallelAware(url, filePath, onProgress, timeout)
}

func downloadFileWithHashWithTimeoutPreferred(url, filePath string, onProgress func(downloaded, total int64), timeout time.Duration, preferred DownloadSource) (string, error) {
	return downloadFileWithHashParallelAwareAndExpectedSizePreferred(url, filePath, onProgress, timeout, 0, preferred)
}

func downloadFileWithHashPreferred(url, filePath string, onProgress func(downloaded, total int64), preferred DownloadSource) (string, error) {
	return downloadFileWithHashWithTimeoutPreferred(url, filePath, onProgress, 10*time.Minute, preferred)
}

// downloadFileWithHashPreferredForApp 按 App 当前配置的下载镜像源选择直连或镜像回退。
func downloadFileWithHashPreferredForApp(a *App, url, filePath string, onProgress func(downloaded, total int64)) (string, error) {
	preferred := DownloadSourceCst
	if a != nil {
		preferred = a.preferredDownloadSource()
	}
	if preferred == DownloadSourceCst {
		return downloadFileWithHash(url, filePath, onProgress)
	}
	return downloadFileWithHashPreferred(url, filePath, onProgress, preferred)
}

// downloadProgressWriter 把流式写入折算成节流后的进度回调。
type downloadProgressWriter struct {
	mu         sync.Mutex
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
	w.mu.Lock()
	defer w.mu.Unlock()
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

func (w *downloadProgressWriter) finish() int64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.onProgress != nil {
		w.lastEmit = time.Now()
		w.onProgress(w.written, w.total)
	}
	return w.written
}

// doGitHubDownload 发起一次 GitHub 资源下载请求，自动带上合适的请求头与网络重试。
func doGitHubDownload(client *http.Client, rawURL string) (*http.Response, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, localizedDownloadError{
			key:    "app.download.backend.error.package_http_failed",
			params: map[string]any{"status": 0},
		}
	}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	applyGitHubDownloadRequestHeaders(req, isGitHubReleaseAssetAPIURL(rawURL))
	return doDownloadRequest(client, req)
}

func doDownloadRequest(client *http.Client, req *http.Request) (*http.Response, error) {
	resp, err := client.Do(req)
	if err == nil {
		return resp, nil
	}
	if !shouldRetryDownloadNetworkError(err) {
		return nil, wrapDownloadNetworkError(err)
	}
	time.Sleep(downloadNetworkRetryDelay)
	retryReq := req.Clone(req.Context())
	resp, err = client.Do(retryReq)
	if err != nil {
		return nil, wrapDownloadNetworkError(err)
	}
	return resp, nil
}

// classifyGitHubHTTPError 把 GitHub 的 HTTP 失败响应归类成可本地化的错误。
// isCheck 为真表示这是元数据探测请求，而不是资产下载请求。
func classifyGitHubHTTPError(status int, body []byte, headers http.Header, isCheck bool) error {
	snippet := strings.TrimSpace(string(body))
	if len(snippet) > httpErrorBodySnippetLimit {
		snippet = snippet[:httpErrorBodySnippetLimit] + "…"
	}
	lower := strings.ToLower(snippet)
	remaining := strings.TrimSpace(headers.Get("X-RateLimit-Remaining"))
	reset := strings.TrimSpace(headers.Get("X-RateLimit-Reset"))
	detailParts := make([]string, 0, 3)
	if snippet != "" {
		// 尽量抽出 GitHub JSON message 字段
		var payload struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(body, &payload) == nil && strings.TrimSpace(payload.Message) != "" {
			detailParts = append(detailParts, strings.TrimSpace(payload.Message))
		} else {
			detailParts = append(detailParts, snippet)
		}
	}
	if remaining != "" {
		detailParts = append(detailParts, "X-RateLimit-Remaining="+remaining)
	}
	if reset != "" {
		detailParts = append(detailParts, "X-RateLimit-Reset="+reset)
	}
	detail := strings.Join(detailParts, " | ")

	rateLimited := status == http.StatusTooManyRequests ||
		strings.Contains(lower, "rate limit") ||
		strings.Contains(lower, "secondary rate limit") ||
		(status == http.StatusForbidden && remaining == "0")

	if rateLimited {
		return localizedDownloadError{
			key:        "app.download.backend.error.http_rate_limited",
			params:     map[string]any{"detail": detail},
			httpStatus: status,
		}
	}
	if status == http.StatusForbidden {
		if isCheck {
			return localizedDownloadError{
				key:        "app.download.backend.error.metadata_forbidden",
				params:     map[string]any{"detail": detail},
				httpStatus: status,
			}
		}
		return localizedDownloadError{
			key:        "app.download.backend.error.package_forbidden",
			params:     map[string]any{"detail": detail},
			httpStatus: status,
		}
	}
	if isCheck {
		return localizedDownloadError{
			key:        "app.download.backend.error.metadata_http_status",
			params:     map[string]any{"status": status},
			httpStatus: status,
		}
	}
	return localizedDownloadError{
		key:        "app.download.backend.error.package_http_failed",
		params:     map[string]any{"status": status},
		httpStatus: status,
	}
}

func applyGitHubDownloadRequestHeaders(req *http.Request, assetAPIURL bool) {
	if req == nil {
		return
	}
	req.Header.Set("User-Agent", "GoNavi/"+strings.TrimSpace(getCurrentVersion()))
	if assetAPIURL {
		req.Header.Set("Accept", "application/octet-stream")
		req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
		if token := resolveGitHubAPIToken(); token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		return
	}
	// browser_download_url 通常走 objects/release-assets CDN，不强制 github+json
	req.Header.Set("Accept", "*/*")
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

func resolveGitHubAPIToken() string {
	for _, key := range []string{"GONAVI_GITHUB_TOKEN", "GITHUB_TOKEN"} {
		if token := strings.TrimSpace(os.Getenv(key)); token != "" {
			return token
		}
	}
	return ""
}

func shouldRetryDownloadNetworkError(err error) bool {
	if err == nil {
		return false
	}
	if isNetworkEOFError(err) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "connection reset by peer") ||
		strings.Contains(lower, "connection refused") ||
		strings.Contains(lower, "server closed idle connection")
}

func wrapDownloadNetworkError(err error) error {
	if err == nil {
		return nil
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		host := strings.TrimSpace(dnsErr.Name)
		if host == "" {
			host = "api.github.com"
		}
		return localizedDownloadError{
			key: "app.download.backend.error.network_dns",
			params: map[string]any{
				"host":   host,
				"detail": err.Error(),
			},
		}
	}
	if isNetworkEOFError(err) {
		return localizedDownloadError{
			key:    "app.download.backend.error.network_eof",
			params: map[string]any{"detail": err.Error()},
		}
	}
	return localizedDownloadError{
		key:    "app.download.backend.error.network_failed",
		params: map[string]any{"detail": err.Error()},
	}
}

func isNetworkEOFError(err error) bool {
	if err == nil {
		return false
	}
	return errors.Is(err, io.EOF) ||
		errors.Is(err, io.ErrUnexpectedEOF) ||
		strings.Contains(strings.ToLower(err.Error()), "eof")
}
