package app

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
	proxytunnel "GoNavi-Wails/internal/proxy"
)

type globalProxySnapshot struct {
	Enabled bool                   `json:"enabled"`
	Proxy   connection.ProxyConfig `json:"proxy"`
}

var globalProxyRuntime = struct {
	mu      sync.RWMutex
	enabled bool
	proxy   connection.ProxyConfig
}{}

func currentGlobalProxyConfig() globalProxySnapshot {
	globalProxyRuntime.mu.RLock()
	defer globalProxyRuntime.mu.RUnlock()
	if !globalProxyRuntime.enabled {
		return globalProxySnapshot{
			Enabled: false,
			Proxy:   connection.ProxyConfig{},
		}
	}
	return globalProxySnapshot{
		Enabled: true,
		Proxy:   globalProxyRuntime.proxy,
	}
}

func setGlobalProxyConfig(enabled bool, proxyConfig connection.ProxyConfig) (globalProxySnapshot, error) {
	if !enabled {
		globalProxyRuntime.mu.Lock()
		globalProxyRuntime.enabled = false
		globalProxyRuntime.proxy = connection.ProxyConfig{}
		globalProxyRuntime.mu.Unlock()
		return currentGlobalProxyConfig(), nil
	}

	normalizedProxy, err := proxytunnel.NormalizeConfig(proxyConfig)
	if err != nil {
		return globalProxySnapshot{}, err
	}

	globalProxyRuntime.mu.Lock()
	globalProxyRuntime.enabled = true
	globalProxyRuntime.proxy = normalizedProxy
	globalProxyRuntime.mu.Unlock()
	return currentGlobalProxyConfig(), nil
}

func (a *App) ConfigureGlobalProxy(enabled bool, proxyConfig connection.ProxyConfig) connection.QueryResult {
	snapshot, err := setGlobalProxyConfig(enabled, proxyConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	if snapshot.Enabled {
		authState := ""
		if strings.TrimSpace(snapshot.Proxy.User) != "" {
			authState = "（认证：已配置）"
		}
		logger.Infof(
			"全局代理已启用：%s://%s:%d%s",
			strings.ToLower(strings.TrimSpace(snapshot.Proxy.Type)),
			strings.TrimSpace(snapshot.Proxy.Host),
			snapshot.Proxy.Port,
			authState,
		)
	} else {
		logger.Infof("全局代理已关闭")
	}

	return connection.QueryResult{
		Success: true,
		Message: "全局代理配置已生效",
		Data:    snapshot,
	}
}

func (a *App) GetGlobalProxyConfig() connection.QueryResult {
	return connection.QueryResult{
		Success: true,
		Message: "OK",
		Data:    currentGlobalProxyConfig(),
	}
}

func applyGlobalProxyToConnection(config connection.ConnectionConfig) connection.ConnectionConfig {
	effective := config
	if effective.UseProxy {
		return effective
	}
	if isFileDatabaseType(effective.Type) {
		effective.Proxy = connection.ProxyConfig{}
		return effective
	}

	snapshot := currentGlobalProxyConfig()
	if !snapshot.Enabled {
		effective.Proxy = connection.ProxyConfig{}
		return effective
	}

	effective.UseProxy = true
	effective.Proxy = snapshot.Proxy
	return effective
}

func isFileDatabaseType(driverType string) bool {
	switch strings.ToLower(strings.TrimSpace(driverType)) {
	case "sqlite", "duckdb":
		return true
	default:
		return false
	}
}

func newHTTPClientWithGlobalProxy(timeout time.Duration) *http.Client {
	client := &http.Client{
		Timeout: timeout,
	}
	if transport := buildHTTPTransportWithGlobalProxy(); transport != nil {
		client.Transport = transport
	}
	return client
}

func buildHTTPTransportWithGlobalProxy() *http.Transport {
	baseTransport, ok := http.DefaultTransport.(*http.Transport)
	if !ok || baseTransport == nil {
		return nil
	}

	transport := baseTransport.Clone()
	snapshot := currentGlobalProxyConfig()
	if !snapshot.Enabled {
		transport.Proxy = http.ProxyFromEnvironment
		return transport
	}

	proxyURL, err := buildProxyURLFromConfig(snapshot.Proxy)
	if err != nil {
		logger.Warnf("全局代理配置无效，回退系统代理：%v", err)
		transport.Proxy = http.ProxyFromEnvironment
		return transport
	}

	transport.Proxy = http.ProxyURL(proxyURL)
	return transport
}

func buildProxyURLFromConfig(proxyConfig connection.ProxyConfig) (*url.URL, error) {
	normalizedProxy, err := proxytunnel.NormalizeConfig(proxyConfig)
	if err != nil {
		return nil, err
	}

	proxyType := strings.ToLower(strings.TrimSpace(normalizedProxy.Type))
	if proxyType != "http" && proxyType != "socks5" {
		return nil, fmt.Errorf("不支持的代理类型：%s", normalizedProxy.Type)
	}
	if strings.TrimSpace(normalizedProxy.Host) == "" {
		return nil, fmt.Errorf("代理地址不能为空")
	}
	if normalizedProxy.Port <= 0 || normalizedProxy.Port > 65535 {
		return nil, fmt.Errorf("代理端口无效：%d", normalizedProxy.Port)
	}

	proxyURL := &url.URL{
		Scheme: proxyType,
		Host:   net.JoinHostPort(strings.TrimSpace(normalizedProxy.Host), strconv.Itoa(normalizedProxy.Port)),
	}
	if strings.TrimSpace(normalizedProxy.User) != "" {
		proxyURL.User = url.UserPassword(strings.TrimSpace(normalizedProxy.User), normalizedProxy.Password)
	}
	return proxyURL, nil
}
