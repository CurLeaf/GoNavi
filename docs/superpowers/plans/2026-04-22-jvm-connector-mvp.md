# JVM Connector MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GoNavi 中落地 JVM Connector MVP，首期支持 JMX + Management Endpoint 两种接入模式，覆盖连接测试、能力探测、资源浏览、受控预览/写入、审计记录和 AI 变更计划生成。

**Architecture:** 复用 GoNavi 现有的“Redis 式独立能力线”，新增 `internal/jvm` 后端包和一组 JVM 专用前端组件，而不是复用 SQL `Database` 接口。所有写操作统一通过 Guard + Preview + Audit 链路，AI 只生成结构化变更计划，不直接执行。

**Tech Stack:** Go 1.24, Wails v2, React 18, TypeScript, Zustand, Ant Design 5, Vitest

---

## File Map

- Modify: `internal/connection/types.go`
  - 为 `ConnectionConfig` 增加 `JVMConfig`、JMX/Endpoint 可选配置，保持现有连接持久化链路可复用。
- Create: `internal/jvm/types.go`
  - JVM 能力、资源、值快照、变更预览、审计记录等 DTO。
- Create: `internal/jvm/config.go`
  - 运行模式归一化、只读/生产保护、模式可用性判断。
- Create: `internal/jvm/provider.go`
  - Provider 接口、注册与按模式分发。
- Create: `internal/jvm/jmx_provider.go`
  - JMX Provider 实现。
- Create: `internal/jvm/http_provider.go`
  - Management Endpoint Provider 实现。
- Create: `internal/jvm/guard.go`
  - 写入前预览、权限保护和风险等级判断。
- Create: `internal/jvm/audit_store.go`
  - JSONL 审计落盘与查询。
- Create: `internal/jvm/config_test.go`
  - JVM 配置归一化和保护规则测试。
- Create: `internal/app/methods_jvm.go`
  - Wails 暴露的 JVM 读写方法。
- Create: `internal/app/methods_jvm_test.go`
  - App 层对 fake provider 的集成测试。
- Modify: `frontend/src/types.ts`
  - 新增 JVM 连接配置、资源模型、TabData 扩展。
- Create: `frontend/src/utils/jvmConnectionConfig.ts`
  - JVM 连接默认值、表单转配置、模式标签和默认端口。
- Create: `frontend/src/utils/jvmConnectionConfig.test.ts`
  - JVM 表单配置转换测试。
- Create: `frontend/src/utils/jvmRuntimePresentation.ts`
  - 模式徽标、审计风险文案、JVM tab 标题构造。
- Create: `frontend/src/utils/jvmRuntimePresentation.test.ts`
  - 展示层纯函数测试。
- Modify: `frontend/src/components/DatabaseIcons.tsx`
  - 增加 JVM 图标映射。
- Modify: `frontend/src/components/ConnectionModal.tsx`
  - 新增 JVM 连接类型与表单。
- Modify: `frontend/src/components/Sidebar.tsx`
  - 新增 JVM 节点、懒加载和资源打开动作。
- Modify: `frontend/src/components/TabManager.tsx`
  - 路由 JVM 新 Tab。
- Create: `frontend/src/components/JVMOverview.tsx`
  - 展示连接能力矩阵与风险提示。
- Create: `frontend/src/components/JVMResourceBrowser.tsx`
  - 资源树、值快照和写入入口。
- Create: `frontend/src/components/JVMAuditViewer.tsx`
  - JVM 审计记录查看器。
- Create: `frontend/src/components/jvm/JVMModeBadge.tsx`
  - 统一渲染 `JMX` / `Endpoint` / `只读` / `可写` 徽标。
- Create: `frontend/src/components/jvm/JVMChangePreviewModal.tsx`
  - 写入预览与确认对话框。
- Create: `frontend/src/utils/jvmAiPlan.ts`
  - 解析和校验 AI 结构化变更计划。
- Create: `frontend/src/utils/jvmAiPlan.test.ts`
  - AI 计划解析测试。
- Modify: `frontend/src/components/AIChatPanel.tsx`
  - 向 JVM tab 注入上下文与推荐 prompt。
- Modify: `frontend/src/components/ai/AIMessageBubble.tsx`
  - 检测 JVM 结构化计划，提供“应用到预览”按钮。
- Regenerate: `frontend/wailsjs/go/app/App.d.ts`, `frontend/wailsjs/go/app/App.js`, `frontend/wailsjs/go/models.ts`
  - 由 Wails 命令生成，不手工编辑。
- Modify: `docs/需求追踪/需求进度追踪-JVM缓存可视化编辑-20260422.md`
  - 记录计划文件、实施进度和验证证据。

## Task 1: 定义 JVM 共享契约与配置归一化

**Files:**
- Create: `internal/jvm/types.go`
- Create: `internal/jvm/config.go`
- Create: `internal/jvm/config_test.go`
- Modify: `internal/connection/types.go`
- Create: `frontend/src/utils/jvmConnectionConfig.ts`
- Create: `frontend/src/utils/jvmConnectionConfig.test.ts`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: 写后端失败测试，锁定 JVM 模式归一化和默认保护规则**

```go
package jvm

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeConnectionConfigDefaultsToReadOnlyJMX(t *testing.T) {
	raw := connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders-prod.internal",
		Port: 9010,
	}

	got, err := NormalizeConnectionConfig(raw)
	if err != nil {
		t.Fatalf("NormalizeConnectionConfig returned error: %v", err)
	}
	if !got.JVM.ReadOnly {
		t.Fatalf("expected JVM connection to default to readOnly")
	}
	if got.JVM.PreferredMode != ModeJMX {
		t.Fatalf("expected preferred mode %q, got %q", ModeJMX, got.JVM.PreferredMode)
	}
	if len(got.JVM.AllowedModes) != 1 || got.JVM.AllowedModes[0] != ModeJMX {
		t.Fatalf("expected allowed modes [jmx], got %#v", got.JVM.AllowedModes)
	}
	if got.JVM.JMX.Port != 9010 {
		t.Fatalf("expected JMX port to inherit root port 9010, got %d", got.JVM.JMX.Port)
	}
}

func TestNormalizeConnectionConfigFallsBackToFirstAllowedMode(t *testing.T) {
	raw := connection.ConnectionConfig{
		Type: "jvm",
		Host: "cache-svc.internal",
		JVM: connection.JVMConfig{
			AllowedModes:  []string{ModeEndpoint, ModeJMX},
			PreferredMode: ModeAgent,
			Endpoint: connection.JVMEndpointConfig{
				Enabled: true,
				BaseURL: "https://cache-svc.internal/manage/jvm",
			},
		},
	}

	got, err := NormalizeConnectionConfig(raw)
	if err != nil {
		t.Fatalf("NormalizeConnectionConfig returned error: %v", err)
	}
	if got.JVM.PreferredMode != ModeEndpoint {
		t.Fatalf("expected preferred mode %q, got %q", ModeEndpoint, got.JVM.PreferredMode)
	}
}
```

- [ ] **Step 2: 运行测试，确认 `internal/jvm` 还不存在导致失败**

Run: `go test ./internal/jvm -run TestNormalizeConnectionConfig -count=1`

Expected: FAIL，提示 `GoNavi-Wails/internal/jvm` 尚不存在或 `NormalizeConnectionConfig` 未定义。

- [ ] **Step 3: 实现后端 JVM 类型与归一化规则**

```go
package connection

type JVMJMXConfig struct {
	Enabled         bool     `json:"enabled,omitempty"`
	Host            string   `json:"host,omitempty"`
	Port            int      `json:"port,omitempty"`
	Username        string   `json:"username,omitempty"`
	Password        string   `json:"password,omitempty"`
	DomainAllowlist []string `json:"domainAllowlist,omitempty"`
}

type JVMEndpointConfig struct {
	Enabled        bool   `json:"enabled,omitempty"`
	BaseURL        string `json:"baseUrl,omitempty"`
	APIKey         string `json:"apiKey,omitempty"`
	TimeoutSeconds int    `json:"timeoutSeconds,omitempty"`
}

type JVMConfig struct {
	Environment   string            `json:"environment,omitempty"`
	ReadOnly      bool              `json:"readOnly,omitempty"`
	AllowedModes  []string          `json:"allowedModes,omitempty"`
	PreferredMode string            `json:"preferredMode,omitempty"`
	JMX           JVMJMXConfig      `json:"jmx,omitempty"`
	Endpoint      JVMEndpointConfig `json:"endpoint,omitempty"`
}
```

```go
package jvm

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const (
	ModeJMX      = "jmx"
	ModeEndpoint = "endpoint"
	ModeAgent    = "agent"
	EnvPROD      = "prod"
)

type Capability struct {
	Mode         string `json:"mode"`
	CanBrowse    bool   `json:"canBrowse"`
	CanWrite     bool   `json:"canWrite"`
	CanPreview   bool   `json:"canPreview"`
	Reason       string `json:"reason,omitempty"`
	DisplayLabel string `json:"displayLabel"`
}

type ResourceSummary struct {
	ID           string `json:"id"`
	ParentID     string `json:"parentId,omitempty"`
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	Path         string `json:"path"`
	ProviderMode string `json:"providerMode"`
	CanRead      bool   `json:"canRead"`
	CanWrite     bool   `json:"canWrite"`
	HasChildren  bool   `json:"hasChildren"`
	Sensitive    bool   `json:"sensitive,omitempty"`
}

type ValueSnapshot struct {
	ResourceID string         `json:"resourceId"`
	Kind       string         `json:"kind"`
	Format     string         `json:"format"`
	Version    string         `json:"version,omitempty"`
	Value      interface{}    `json:"value"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type ChangeRequest struct {
	ProviderMode    string         `json:"providerMode"`
	ResourceID      string         `json:"resourceId"`
	Action          string         `json:"action"`
	Reason          string         `json:"reason"`
	ExpectedVersion string         `json:"expectedVersion,omitempty"`
	Payload         map[string]any `json:"payload,omitempty"`
}

type ChangePreview struct {
	Allowed              bool          `json:"allowed"`
	RequiresConfirmation bool          `json:"requiresConfirmation,omitempty"`
	Summary              string        `json:"summary"`
	RiskLevel            string        `json:"riskLevel"`
	BlockingReason       string        `json:"blockingReason,omitempty"`
	Before               ValueSnapshot `json:"before"`
	After                ValueSnapshot `json:"after"`
}

type ApplyResult struct {
	Status       string        `json:"status"`
	Message      string        `json:"message,omitempty"`
	UpdatedValue ValueSnapshot `json:"updatedValue"`
}

type AuditRecord struct {
	Timestamp    int64  `json:"timestamp"`
	ConnectionID string `json:"connectionId"`
	ProviderMode string `json:"providerMode"`
	ResourceID   string `json:"resourceId"`
	Action       string `json:"action"`
	Reason       string `json:"reason"`
	Result       string `json:"result"`
}

func NormalizeConnectionConfig(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
	cfg := raw
	if strings.TrimSpace(cfg.Type) != "jvm" {
		return connection.ConnectionConfig{}, fmt.Errorf("unexpected connection type: %s", cfg.Type)
	}
	cfg.Type = "jvm"
	cfg.JVM.Environment = strings.ToLower(strings.TrimSpace(cfg.JVM.Environment))
	if cfg.JVM.ReadOnly == false {
		cfg.JVM.ReadOnly = true
	}
	if cfg.JVM.JMX.Port <= 0 {
		cfg.JVM.JMX.Port = cfg.Port
	}
	if len(cfg.JVM.AllowedModes) == 0 {
		cfg.JVM.AllowedModes = []string{ModeJMX}
	}
	cfg.JVM.AllowedModes = normalizeModes(cfg.JVM.AllowedModes)
	if cfg.JVM.PreferredMode == "" || !containsMode(cfg.JVM.AllowedModes, cfg.JVM.PreferredMode) {
		cfg.JVM.PreferredMode = cfg.JVM.AllowedModes[0]
	}
	return cfg, nil
}

func normalizeModes(input []string) []string {
	result := make([]string, 0, len(input))
	seen := map[string]struct{}{}
	for _, item := range input {
		mode := strings.ToLower(strings.TrimSpace(item))
		switch mode {
		case ModeJMX, ModeEndpoint, ModeAgent:
		default:
			continue
		}
		if _, ok := seen[mode]; ok {
			continue
		}
		seen[mode] = struct{}{}
		result = append(result, mode)
	}
	if len(result) == 0 {
		return []string{ModeJMX}
	}
	return result
}

func containsMode(items []string, target string) bool {
	target = strings.ToLower(strings.TrimSpace(target))
	for _, item := range items {
		if strings.ToLower(strings.TrimSpace(item)) == target {
			return true
		}
	}
	return false
}
```

- [ ] **Step 4: 写前端 JVM 默认值与配置转换的失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { buildDefaultJVMConnectionValues, buildJVMConnectionConfig } from './jvmConnectionConfig';

describe('jvmConnectionConfig', () => {
  it('defaults to readonly jmx mode', () => {
    const values = buildDefaultJVMConnectionValues();
    expect(values.type).toBe('jvm');
    expect(values.jvmReadOnly).toBe(true);
    expect(values.jvmAllowedModes).toEqual(['jmx']);
    expect(values.jvmPreferredMode).toBe('jmx');
  });

  it('builds nested jvm config payload', () => {
    const config = buildJVMConnectionConfig({
      name: 'Orders JVM',
      type: 'jvm',
      host: 'orders.internal',
      port: 9010,
      jvmReadOnly: true,
      jvmAllowedModes: ['jmx', 'endpoint'],
      jvmPreferredMode: 'endpoint',
      jvmEnvironment: 'prod',
      jvmEndpointEnabled: true,
      jvmEndpointBaseUrl: 'https://orders.internal/manage/jvm',
      jvmEndpointApiKey: 'token-1',
    });
    expect(config.jvm?.preferredMode).toBe('endpoint');
    expect(config.jvm?.endpoint.baseUrl).toBe('https://orders.internal/manage/jvm');
  });
});
```

- [ ] **Step 5: 实现前端类型与连接工具**

```ts
export interface JVMJMXConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  domainAllowlist?: string[];
}

export interface JVMEndpointConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  timeoutSeconds?: number;
}

export interface JVMConfig {
  environment?: 'dev' | 'uat' | 'prod';
  readOnly?: boolean;
  allowedModes?: Array<'jmx' | 'endpoint' | 'agent'>;
  preferredMode?: 'jmx' | 'endpoint' | 'agent';
  jmx?: JVMJMXConfig;
  endpoint?: JVMEndpointConfig;
}

export interface JVMCapability {
  mode: 'jmx' | 'endpoint' | 'agent';
  canBrowse: boolean;
  canWrite: boolean;
  canPreview: boolean;
  reason?: string;
  displayLabel: string;
}

export interface JVMResourceSummary {
  id: string;
  parentId?: string;
  kind: string;
  name: string;
  path: string;
  providerMode: 'jmx' | 'endpoint' | 'agent';
  canRead: boolean;
  canWrite: boolean;
  hasChildren: boolean;
  sensitive?: boolean;
}

export interface JVMValueSnapshot {
  resourceId: string;
  kind: string;
  format: string;
  version?: string;
  value: any;
  metadata?: Record<string, any>;
}

export interface JVMChangePreview {
  allowed: boolean;
  requiresConfirmation?: boolean;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  blockingReason?: string;
  before: JVMValueSnapshot;
  after: JVMValueSnapshot;
}
```

```ts
import type { ConnectionConfig } from '../types';

export const buildDefaultJVMConnectionValues = () => ({
  type: 'jvm',
  host: 'localhost',
  port: 9010,
  jvmReadOnly: true,
  jvmAllowedModes: ['jmx'],
  jvmPreferredMode: 'jmx',
  jvmEnvironment: 'dev',
  jvmEndpointEnabled: false,
  jvmEndpointBaseUrl: '',
  jvmEndpointApiKey: '',
});

export const buildJVMConnectionConfig = (values: Record<string, any>): ConnectionConfig => ({
  type: 'jvm',
  host: String(values.host || '').trim(),
  port: Number(values.port || 0),
  user: '',
  password: '',
  timeout: Number(values.timeout || 30),
  jvm: {
    environment: values.jvmEnvironment,
    readOnly: Boolean(values.jvmReadOnly),
    allowedModes: values.jvmAllowedModes,
    preferredMode: values.jvmPreferredMode,
    jmx: {
      enabled: values.jvmAllowedModes?.includes('jmx'),
      host: String(values.jvmJmxHost || values.host || '').trim(),
      port: Number(values.jvmJmxPort || values.port || 0),
      username: String(values.jvmJmxUsername || '').trim(),
      password: String(values.jvmJmxPassword || ''),
    },
    endpoint: {
      enabled: Boolean(values.jvmEndpointEnabled),
      baseUrl: String(values.jvmEndpointBaseUrl || '').trim(),
      apiKey: String(values.jvmEndpointApiKey || ''),
      timeoutSeconds: Number(values.jvmEndpointTimeoutSeconds || values.timeout || 30),
    },
  },
});
```

- [ ] **Step 6: 运行单测，确认前后端配置契约稳定**

Run: `go test ./internal/jvm -run TestNormalizeConnectionConfig -count=1`

Expected: PASS，输出 `ok  	GoNavi-Wails/internal/jvm`

Run: `cd frontend && npm test -- src/utils/jvmConnectionConfig.test.ts`

Expected: PASS，2 个测试通过。

- [ ] **Step 7: 提交配置契约**

```bash
git add internal/connection/types.go internal/jvm/types.go internal/jvm/config.go internal/jvm/config_test.go frontend/src/types.ts frontend/src/utils/jvmConnectionConfig.ts frontend/src/utils/jvmConnectionConfig.test.ts
git commit -m "feat(jvm): 定义 JVM 连接契约与配置归一化"
```

## Task 2: 建立后端 Provider 注册与连接探测 API

**Files:**
- Create: `internal/jvm/provider.go`
- Create: `internal/jvm/jmx_provider.go`
- Create: `internal/jvm/http_provider.go`
- Create: `internal/app/methods_jvm.go`
- Create: `internal/app/methods_jvm_test.go`
- Regenerate: `frontend/wailsjs/go/app/App.d.ts`
- Regenerate: `frontend/wailsjs/go/app/App.js`
- Regenerate: `frontend/wailsjs/go/models.ts`

- [ ] **Step 1: 写 App 层失败测试，锁定连接测试与能力探测输出**

```go
package app

import (
	"context"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
)

type fakeJVMProvider struct {
	testErr error
	probe   []jvm.Capability
	list    []jvm.ResourceSummary
	value   jvm.ValueSnapshot
	apply   jvm.ApplyResult
}

func (f fakeJVMProvider) Mode() string { return jvm.ModeJMX }
func (f fakeJVMProvider) TestConnection(context.Context, connection.ConnectionConfig) error { return f.testErr }
func (f fakeJVMProvider) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]jvm.Capability, error) {
	return f.probe, nil
}
func (f fakeJVMProvider) ListResources(context.Context, connection.ConnectionConfig, string) ([]jvm.ResourceSummary, error) {
	return f.list, nil
}
func (f fakeJVMProvider) GetValue(context.Context, connection.ConnectionConfig, string) (jvm.ValueSnapshot, error) {
	return f.value, nil
}
func (f fakeJVMProvider) PreviewChange(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ChangePreview, error) {
	return jvm.ChangePreview{Allowed: true, Summary: "preview"}, nil
}
func (f fakeJVMProvider) ApplyChange(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ApplyResult, error) {
	return f.apply, nil
}

func swapJVMProviderFactory(factory func(mode string) (jvm.Provider, error)) func() {
	prev := newJVMProvider
	newJVMProvider = factory
	return func() { newJVMProvider = prev }
}

func TestTestJVMConnectionUsesPreferredProvider(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{}, nil
	})
	defer restore()

	res := app.TestJVMConnection(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
}

func TestJVMProbeCapabilitiesReturnsCapabilityArray(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			probe: []jvm.Capability{{Mode: jvm.ModeJMX, CanBrowse: true, CanWrite: false, CanPreview: false, DisplayLabel: "JMX"}},
		}, nil
	})
	defer restore()

	res := app.JVMProbeCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.Capability)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one capability, got %#v", res.Data)
	}
}
```

- [ ] **Step 2: 运行测试，确认 App 方法尚未定义**

Run: `go test ./internal/app -run 'Test(TestJVMConnection|JVMProbeCapabilities)' -count=1`

Expected: FAIL，提示 `TestJVMConnection` 或 `JVMProbeCapabilities` 未定义。

- [ ] **Step 3: 实现 Provider 接口、JMX/Endpoint 骨架和 App 方法**

```go
package jvm

import (
	"context"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

type Provider interface {
	Mode() string
	TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error
	ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]Capability, error)
	ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error)
	GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error)
	PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error)
	ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error)
}

var providerFactories = map[string]func() Provider{
	ModeJMX: func() Provider { return NewJMXProvider() },
	ModeEndpoint: func() Provider { return NewHTTPProvider() },
}

func NewProvider(mode string) (Provider, error) {
	normalized := strings.ToLower(strings.TrimSpace(mode))
	factory, ok := providerFactories[normalized]
	if !ok {
		return nil, fmt.Errorf("unsupported jvm provider mode: %s", mode)
	}
	return factory(), nil
}

type JMXProvider struct{}

func NewJMXProvider() Provider { return &JMXProvider{} }
func (p *JMXProvider) Mode() string { return ModeJMX }
func (p *JMXProvider) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error { return nil }
func (p *JMXProvider) ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]Capability, error) {
	return []Capability{{Mode: ModeJMX, CanBrowse: true, CanWrite: false, CanPreview: false, DisplayLabel: "JMX"}}, nil
}
func (p *JMXProvider) ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error) {
	return []ResourceSummary{}, nil
}
func (p *JMXProvider) GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error) {
	return ValueSnapshot{}, nil
}
func (p *JMXProvider) PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	return ChangePreview{}, nil
}
func (p *JMXProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error) {
	return ApplyResult{}, nil
}

type HTTPProvider struct{}

func NewHTTPProvider() Provider { return &HTTPProvider{} }
func (p *HTTPProvider) Mode() string { return ModeEndpoint }
func (p *HTTPProvider) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error { return nil }
func (p *HTTPProvider) ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]Capability, error) {
	return []Capability{{Mode: ModeEndpoint, CanBrowse: true, CanWrite: true, CanPreview: true, DisplayLabel: "Endpoint"}}, nil
}
func (p *HTTPProvider) ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error) {
	return []ResourceSummary{}, nil
}
func (p *HTTPProvider) GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error) {
	return ValueSnapshot{}, nil
}
func (p *HTTPProvider) PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	return ChangePreview{}, nil
}
func (p *HTTPProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error) {
	return ApplyResult{}, nil
}
```

```go
package app

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
	"path/filepath"
	"strings"
)

var newJVMProvider = jvm.NewProvider

func (a *App) TestJVMConnection(cfg connection.ConnectionConfig) connection.QueryResult {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	provider, err := newJVMProvider(normalized.JVM.PreferredMode)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if err := provider.TestConnection(a.ctx, normalized); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "JVM 连接成功"}
}

func (a *App) JVMProbeCapabilities(cfg connection.ConnectionConfig) connection.QueryResult {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	items := make([]jvm.Capability, 0, len(normalized.JVM.AllowedModes))
	for _, mode := range normalized.JVM.AllowedModes {
		provider, providerErr := newJVMProvider(mode)
		if providerErr != nil {
			items = append(items, jvm.Capability{Mode: mode, DisplayLabel: strings.ToUpper(mode), Reason: providerErr.Error()})
			continue
		}
		caps, probeErr := provider.ProbeCapabilities(a.ctx, normalized)
		if probeErr != nil {
			items = append(items, jvm.Capability{Mode: mode, DisplayLabel: strings.ToUpper(mode), Reason: probeErr.Error()})
			continue
		}
		items = append(items, caps...)
	}
	return connection.QueryResult{Success: true, Data: items}
}
```

- [ ] **Step 4: 刷新 Wails 绑定**

Run: `wails build -clean`

Expected: PASS，命令退出码为 0，同时刷新 `frontend/wailsjs/go/app/App.*` 与 `frontend/wailsjs/go/models.ts`。

- [ ] **Step 5: 运行后端测试，确认探测 API 可用**

Run: `go test ./internal/app -run 'Test(TestJVMConnection|JVMProbeCapabilities)' -count=1`

Expected: PASS，输出 `ok  	GoNavi-Wails/internal/app`

- [ ] **Step 6: 提交 Provider 骨架**

```bash
git add internal/jvm/provider.go internal/jvm/jmx_provider.go internal/jvm/http_provider.go internal/app/methods_jvm.go internal/app/methods_jvm_test.go frontend/wailsjs/go/app/App.d.ts frontend/wailsjs/go/app/App.js frontend/wailsjs/go/models.ts
git commit -m "feat(jvm): 增加连接测试与能力探测 API"
```

## Task 3: 接入 JVM 连接表单与图标

**Files:**
- Modify: `frontend/src/components/DatabaseIcons.tsx`
- Modify: `frontend/src/components/ConnectionModal.tsx`
- Create: `frontend/src/utils/jvmRuntimePresentation.ts`
- Create: `frontend/src/utils/jvmRuntimePresentation.test.ts`

- [ ] **Step 1: 写展示层失败测试，锁定 JVM 模式标签和 tab 标题构造**

```ts
import { describe, expect, it } from 'vitest';
import { buildJVMTabTitle, resolveJVMModeMeta } from './jvmRuntimePresentation';

describe('jvmRuntimePresentation', () => {
  it('renders readable mode meta', () => {
    expect(resolveJVMModeMeta('jmx').label).toBe('JMX');
    expect(resolveJVMModeMeta('endpoint').label).toBe('Endpoint');
  });

  it('builds overview title with provider suffix', () => {
    expect(buildJVMTabTitle('Orders JVM', 'overview', 'jmx')).toBe('[Orders JVM] JVM 概览 · JMX');
  });
});
```

- [ ] **Step 2: 运行测试，确认展示帮助函数尚未实现**

Run: `cd frontend && npm test -- src/utils/jvmRuntimePresentation.test.ts`

Expected: FAIL，提示 `buildJVMTabTitle` / `resolveJVMModeMeta` 未定义。

- [ ] **Step 3: 实现 JVM 图标和展示帮助函数**

```ts
export const resolveJVMModeMeta = (mode: string) => {
  switch (mode) {
    case 'endpoint':
      return { label: 'Endpoint', color: 'blue' as const };
    case 'agent':
      return { label: 'Agent', color: 'purple' as const };
    default:
      return { label: 'JMX', color: 'gold' as const };
  }
};

export const buildJVMTabTitle = (connectionName: string, tabKind: 'overview' | 'resource' | 'audit', mode: string) => {
  const modeLabel = resolveJVMModeMeta(mode).label;
  if (tabKind === 'audit') return `[${connectionName}] JVM 审计 · ${modeLabel}`;
  if (tabKind === 'resource') return `[${connectionName}] JVM 资源 · ${modeLabel}`;
  return `[${connectionName}] JVM 概览 · ${modeLabel}`;
};
```

```tsx
export const DB_ICON_TYPES = [
  'mysql',
  'postgres',
  'oracle',
  'redis',
  'mongodb',
  'custom',
  'jvm',
] as const;
```

- [ ] **Step 4: 扩展 ConnectionModal，新增 JVM 连接类型与测试连接分发**

```tsx
{ key: 'jvm', name: 'JVM', icon: <CloudServerOutlined /> }
```

```tsx
if (dbType === 'jvm') {
  return (
    <>
      <Form.Item name="host" label="目标主机" rules={[{ required: true, message: '请输入目标主机' }]}>
        <Input placeholder="orders.internal" {...noAutoCapInputProps} />
      </Form.Item>
      <Form.Item name="port" label="默认端口" rules={[{ required: true, message: '请输入默认端口' }]}>
        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="jvmAllowedModes" label="允许模式" rules={[{ required: true, message: '请至少选择一种模式' }]}>
        <Select mode="multiple" options={[{ value: 'jmx', label: 'JMX' }, { value: 'endpoint', label: 'Management Endpoint' }]} />
      </Form.Item>
      <Form.Item name="jvmPreferredMode" label="首选模式" rules={[{ required: true, message: '请选择首选模式' }]}>
        <Select options={[{ value: 'jmx', label: 'JMX' }, { value: 'endpoint', label: 'Management Endpoint' }]} />
      </Form.Item>
      <Form.Item name="jvmReadOnly" valuePropName="checked">
        <Checkbox>默认只读</Checkbox>
      </Form.Item>
      <Form.Item name="jvmEndpointBaseUrl" label="Endpoint URL">
        <Input placeholder="https://orders.internal/manage/jvm" {...noAutoCapInputProps} />
      </Form.Item>
    </>
  );
}
```

```tsx
const requestTest = async () => {
  const values = form.getFieldsValue(true);
  const config = values.type === 'jvm'
    ? buildJVMConnectionConfig(values)
    : await buildConfig(values, false);
  const result = values.type === 'jvm'
    ? await (window as any).go.app.App.TestJVMConnection(config as any)
    : values.type === 'redis'
      ? await RedisConnect(config as any)
      : await TestConnection(config as any);
  setTestResult(result.success ? { type: 'success', message: result.message || '连接成功' } : { type: 'error', message: result.message || '连接失败' });
};
```

- [ ] **Step 5: 运行前端纯函数测试与构建**

Run: `cd frontend && npm test -- src/utils/jvmRuntimePresentation.test.ts`

Expected: PASS

Run: `cd frontend && npm run build`

Expected: PASS，生成最新 `frontend/dist`。

- [ ] **Step 6: 提交连接体验改动**

```bash
git add frontend/src/components/DatabaseIcons.tsx frontend/src/components/ConnectionModal.tsx frontend/src/utils/jvmRuntimePresentation.ts frontend/src/utils/jvmRuntimePresentation.test.ts
git commit -m "feat(jvm): 新增 JVM 连接表单与展示元数据"
```

## Task 4: 打通只读资源浏览与 JVM Tab

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/TabManager.tsx`
- Create: `frontend/src/components/JVMOverview.tsx`
- Create: `frontend/src/components/JVMResourceBrowser.tsx`
- Create: `frontend/src/components/jvm/JVMModeBadge.tsx`
- Modify: `internal/app/methods_jvm.go`
- Modify: `internal/app/methods_jvm_test.go`

- [ ] **Step 1: 写后端失败测试，锁定资源列表和值读取接口**

```go
func TestJVMListResourcesReturnsTreePayload(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			list: []jvm.ResourceSummary{
				{ID: "cache:orders", Kind: "cacheNamespace", Name: "orders", Path: "cache/orders", ProviderMode: "jmx", HasChildren: true, CanRead: true},
			},
		}, nil
	})
	defer restore()

	res := app.JVMListResources(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, "")

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.ResourceSummary)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one resource item, got %#v", res.Data)
	}
}
```

- [ ] **Step 2: 运行测试，确认资源读取方法尚未实现**

Run: `go test ./internal/app -run 'TestJVMListResources' -count=1`

Expected: FAIL，提示 `JVMListResources` 未定义。

- [ ] **Step 3: 实现后端读接口并在 Sidebar 中新增 JVM 懒加载节点**

```go
func (a *App) JVMListResources(cfg connection.ConnectionConfig, parentPath string) connection.QueryResult {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	provider, err := newJVMProvider(normalized.JVM.PreferredMode)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	items, err := provider.ListResources(a.ctx, normalized, parentPath)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: items}
}

func (a *App) JVMGetValue(cfg connection.ConnectionConfig, resourcePath string) connection.QueryResult {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	provider, err := newJVMProvider(normalized.JVM.PreferredMode)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	value, err := provider.GetValue(a.ctx, normalized, resourcePath)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: value}
}
```

```tsx
type TreeNode = {
  title: string;
  key: string;
  isLeaf?: boolean;
  children?: TreeNode[];
  icon?: React.ReactNode;
  dataRef?: any;
  type?: 'connection' | 'database' | 'table' | 'view' | 'db-trigger' | 'routine' | 'object-group' | 'queries-folder' | 'saved-query' | 'folder-columns' | 'folder-indexes' | 'folder-fks' | 'folder-triggers' | 'redis-db' | 'tag' | 'jvm-mode' | 'jvm-resource';
};
```

```tsx
if (conn.config.type === 'jvm') {
  const modeChildren = (caps as JVMCapability[]).map((cap) => ({
    title: (
      <Space size={6}>
        <span>{cap.displayLabel}</span>
        <JVMModeBadge mode={cap.mode} writable={cap.canWrite} readOnly={!cap.canWrite} />
      </Space>
    ),
    key: `${conn.id}-jvm-mode-${cap.mode}`,
    type: 'jvm-mode' as const,
    dataRef: { ...conn, providerMode: cap.mode },
    isLeaf: false,
  }));
  setTreeData((origin) => updateTreeData(origin, conn.id, modeChildren));
  return;
}
```

- [ ] **Step 4: 新增 JVM 概览与资源浏览 Tab**

```tsx
if (tab.type === 'jvm-overview') {
  content = <JVMOverview tab={tab} />;
} else if (tab.type === 'jvm-resource') {
  content = <JVMResourceBrowser tab={tab} />;
} else if (tab.type === 'jvm-audit') {
  content = <JVMAuditViewer tab={tab} />;
}
```

```tsx
export interface TabData {
  id: string;
  title: string;
  type: 'query' | 'table' | 'design' | 'redis-keys' | 'redis-command' | 'redis-monitor' | 'trigger' | 'view-def' | 'routine-def' | 'table-overview' | 'jvm-overview' | 'jvm-resource' | 'jvm-audit';
  connectionId: string;
  dbName?: string;
  tableName?: string;
  providerMode?: 'jmx' | 'endpoint' | 'agent';
  resourcePath?: string;
  resourceKind?: string;
}
```

- [ ] **Step 5: 运行后端与前端最小回归**

Run: `go test ./internal/app -run 'TestJVMListResources' -count=1`

Expected: PASS

Run: `cd frontend && npm test -- src/utils/jvmRuntimePresentation.test.ts`

Expected: PASS

- [ ] **Step 6: 提交只读浏览链路**

```bash
git add internal/app/methods_jvm.go internal/app/methods_jvm_test.go frontend/src/types.ts frontend/src/components/Sidebar.tsx frontend/src/components/TabManager.tsx frontend/src/components/JVMOverview.tsx frontend/src/components/JVMResourceBrowser.tsx frontend/src/components/jvm/JVMModeBadge.tsx
git commit -m "feat(jvm): 打通 JVM 只读资源浏览"
```

## Task 5: 加入写入预览、Guard 和审计记录

**Files:**
- Create: `internal/jvm/guard.go`
- Create: `internal/jvm/audit_store.go`
- Modify: `internal/jvm/types.go`
- Modify: `internal/app/methods_jvm.go`
- Modify: `internal/app/methods_jvm_test.go`
- Create: `frontend/src/components/jvm/JVMChangePreviewModal.tsx`
- Create: `frontend/src/components/JVMAuditViewer.tsx`
- Modify: `frontend/src/components/JVMResourceBrowser.tsx`

- [ ] **Step 1: 写 Guard 失败测试，锁定只读/生产环境拦截**

```go
func TestPreviewChangeBlocksReadOnlyConnection(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      true,
			Environment:   "prod",
			PreferredMode: "endpoint",
			AllowedModes:  []string{"endpoint"},
		},
	}

	preview, err := jvm.BuildChangePreview(cfg, jvm.ChangeRequest{
		ProviderMode: "endpoint",
		ResourceID:   "cache/orders/user:1",
		Action:       "updateValue",
		Reason:       "修复错误缓存态",
		Payload:      map[string]any{"status": "ACTIVE"},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if preview.Allowed {
		t.Fatalf("expected readonly connection to block write preview")
	}
	if preview.BlockingReason == "" {
		t.Fatalf("expected blocking reason")
	}
}
```

- [ ] **Step 2: 运行测试，确认 Guard 逻辑尚未存在**

Run: `go test ./internal/jvm -run TestPreviewChangeBlocksReadOnlyConnection -count=1`

Expected: FAIL，提示 `BuildChangePreview` 未定义。

- [ ] **Step 3: 实现 Guard、预览和审计落盘**

```go
package jvm

import (
	"encoding/json"
	"os"
	"fmt"
	"time"

	"GoNavi-Wails/internal/connection"
)

func BuildChangePreview(cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	normalized, err := NormalizeConnectionConfig(cfg)
	if err != nil {
		return ChangePreview{}, err
	}
	preview := ChangePreview{
		Allowed:   true,
		RiskLevel: "medium",
		Summary:   fmt.Sprintf("%s -> %s", req.ResourceID, req.Action),
	}
	if normalized.JVM.ReadOnly {
		preview.Allowed = false
		preview.RiskLevel = "high"
		preview.BlockingReason = "当前连接为只读，禁止写入"
	}
	if normalized.JVM.Environment == EnvPROD {
		preview.RequiresConfirmation = true
	}
	return preview, nil
}

type AuditStore struct {
	path string
}

func NewAuditStore(path string) *AuditStore { return &AuditStore{path: path} }

func (s *AuditStore) Append(record AuditRecord) error {
	record.Timestamp = time.Now().UnixMilli()
	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	return json.NewEncoder(file).Encode(record)
}
```

```go
func (a *App) JVMPreviewChange(cfg connection.ConnectionConfig, req jvm.ChangeRequest) connection.QueryResult {
	preview, err := jvm.BuildChangePreview(cfg, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: preview}
}

func (a *App) JVMApplyChange(cfg connection.ConnectionConfig, req jvm.ChangeRequest) connection.QueryResult {
	preview, err := jvm.BuildChangePreview(cfg, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if !preview.Allowed {
		return connection.QueryResult{Success: false, Message: preview.BlockingReason}
	}
	provider, err := newJVMProvider(req.ProviderMode)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	result, err := provider.ApplyChange(a.ctx, cfg, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	_ = jvm.NewAuditStore(filepath.Join(a.configDir, "jvm_audit.jsonl")).Append(jvm.AuditRecord{
		ConnectionID: cfg.ID,
		ProviderMode: req.ProviderMode,
		ResourceID:   req.ResourceID,
		Action:       req.Action,
		Reason:       req.Reason,
		Result:       result.Status,
	})
	return connection.QueryResult{Success: true, Data: result}
}
```

- [ ] **Step 4: 实现前端预览弹窗与审计页签**

```tsx
export const JVMChangePreviewModal: React.FC<{
  open: boolean;
  preview: JVMChangePreview | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}> = ({ open, preview, onCancel, onConfirm }) => (
  <Modal
    title="确认 JVM 变更"
    open={open}
    onCancel={onCancel}
    onOk={() => void onConfirm()}
    okText="确认执行"
    cancelText="取消"
    okButtonProps={{ danger: preview?.riskLevel === 'high' }}
  >
    <Descriptions column={1} size="small">
      <Descriptions.Item label="摘要">{preview?.summary}</Descriptions.Item>
      <Descriptions.Item label="风险级别">{preview?.riskLevel}</Descriptions.Item>
      <Descriptions.Item label="拦截原因">{preview?.blockingReason || '无'}</Descriptions.Item>
    </Descriptions>
    <Divider />
    <Typography.Paragraph code>{JSON.stringify(preview?.before?.value ?? {}, null, 2)}</Typography.Paragraph>
    <Typography.Paragraph code>{JSON.stringify(preview?.after?.value ?? {}, null, 2)}</Typography.Paragraph>
  </Modal>
);
```

```tsx
const handleApply = async () => {
  const previewRes = await (window as any).go.app.App.JVMPreviewChange(config, draftPlan);
  if (!previewRes.success) {
    message.error(previewRes.message || '预览失败');
    return;
  }
  setPreview(previewRes.data);
  setPreviewOpen(true);
};
```

- [ ] **Step 5: 跑写入链路单测**

Run: `go test ./internal/jvm ./internal/app -run 'TestPreviewChangeBlocksReadOnlyConnection|TestJVMApplyChange' -count=1`

Expected: PASS

- [ ] **Step 6: 提交预览与审计链路**

```bash
git add internal/jvm/guard.go internal/jvm/audit_store.go internal/jvm/types.go internal/app/methods_jvm.go internal/app/methods_jvm_test.go frontend/src/components/jvm/JVMChangePreviewModal.tsx frontend/src/components/JVMAuditViewer.tsx frontend/src/components/JVMResourceBrowser.tsx
git commit -m "feat(jvm): 增加 JVM 写入预览与审计"
```

## Task 6: 接入 AI 结构化变更计划

**Files:**
- Create: `frontend/src/utils/jvmAiPlan.ts`
- Create: `frontend/src/utils/jvmAiPlan.test.ts`
- Modify: `frontend/src/components/AIChatPanel.tsx`
- Modify: `frontend/src/components/ai/AIMessageBubble.tsx`
- Modify: `frontend/src/components/JVMResourceBrowser.tsx`

- [ ] **Step 1: 写失败测试，锁定 AI 计划 JSON 解析规则**

```ts
import { describe, expect, it } from 'vitest';
import { extractJVMChangePlan } from './jvmAiPlan';

describe('extractJVMChangePlan', () => {
  it('parses fenced json plan', () => {
    const message = [
      '建议先预览再执行：',
      '```json',
      '{"targetType":"cacheEntry","selector":{"namespace":"orders","key":"user:1"},"action":"updateValue","payload":{"format":"json","value":{"status":"ACTIVE"}},"reason":"修复缓存脏值"}',
      '```',
    ].join('\n');

    const plan = extractJVMChangePlan(message);
    expect(plan?.action).toBe('updateValue');
    expect(plan?.selector.namespace).toBe('orders');
  });

  it('returns null for malformed plan', () => {
    expect(extractJVMChangePlan('```json\n{"action":1}\n```')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认 AI 计划解析器尚未存在**

Run: `cd frontend && npm test -- src/utils/jvmAiPlan.test.ts`

Expected: FAIL，提示 `extractJVMChangePlan` 未定义。

- [ ] **Step 3: 实现 AI 计划解析器**

```ts
export type JVMAIChangePlan = {
  targetType: 'cacheEntry' | 'managedBean';
  selector: { namespace?: string; key?: string; resourcePath?: string };
  action: 'updateValue' | 'evict' | 'clear';
  payload?: { format: 'json' | 'text'; value: unknown };
  reason: string;
};

export const extractJVMChangePlan = (content: string): JVMAIChangePlan | null => {
  const match = String(content || '').match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.targetType || !parsed.selector || !parsed.action || !parsed.reason) return null;
    return parsed as JVMAIChangePlan;
  } catch {
    return null;
  }
};
```

- [ ] **Step 4: 在 AI 气泡里识别 JVM 计划并提供“应用到预览”按钮**

```tsx
const jvmPlan = extractJVMChangePlan(msg.content || '');

{jvmPlan && (
  <Button
    size="small"
    type="primary"
    onClick={() => {
      window.dispatchEvent(new CustomEvent('gonavi:jvm-apply-ai-plan', {
        detail: { plan: jvmPlan }
      }));
    }}
  >
    应用到 JVM 预览
  </Button>
)}
```

```tsx
useEffect(() => {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail?.plan) return;
    setDraftPlan({
      providerMode: tab.providerMode || 'endpoint',
      resourceID: detail.plan.selector.resourcePath || `${detail.plan.selector.namespace}/${detail.plan.selector.key}`,
      action: detail.plan.action,
      payload: detail.plan.payload?.value ?? {},
      reason: detail.plan.reason,
    });
  };
  window.addEventListener('gonavi:jvm-apply-ai-plan', handler as EventListener);
  return () => window.removeEventListener('gonavi:jvm-apply-ai-plan', handler as EventListener);
}, [tab.providerMode]);
```

- [ ] **Step 5: 跑 AI 计划解析测试**

Run: `cd frontend && npm test -- src/utils/jvmAiPlan.test.ts`

Expected: PASS

- [ ] **Step 6: 提交 AI 集成**

```bash
git add frontend/src/utils/jvmAiPlan.ts frontend/src/utils/jvmAiPlan.test.ts frontend/src/components/AIChatPanel.tsx frontend/src/components/ai/AIMessageBubble.tsx frontend/src/components/JVMResourceBrowser.tsx
git commit -m "feat(jvm): 支持 AI 生成 JVM 变更计划"
```

## Task 7: 全量回归、文档回填与交付检查

**Files:**
- Modify: `docs/需求追踪/需求进度追踪-JVM缓存可视化编辑-20260422.md`
- Regenerate/Verify: `frontend/wailsjs/go/app/App.d.ts`
- Regenerate/Verify: `frontend/wailsjs/go/app/App.js`
- Regenerate/Verify: `frontend/wailsjs/go/models.ts`

- [ ] **Step 1: 更新需求追踪文档，写入计划路径与实施阶段**

```md
## 3. 里程碑与进度
- [x] 阶段 1（需求澄清）：完成
- [x] 阶段 2（影响分析）：完成
- [x] 阶段 3（方案设计）：完成
- [x] 阶段 4（实施计划）：完成
- [ ] 阶段 5（实现与自检）：

## 7. 验证记录
- 证据（日志/截图/链接）：
  - `docs/superpowers/specs/2026-04-22-jvm-cache-visual-editing-design.md`
  - `docs/superpowers/plans/2026-04-22-jvm-connector-mvp.md`
```

- [ ] **Step 2: 运行后端全量测试**

Run: `go test ./...`

Expected: PASS，全仓 Go 测试通过。

- [ ] **Step 3: 运行前端全量测试**

Run: `cd frontend && npm test`

Expected: PASS，全量 Vitest 通过。

- [ ] **Step 4: 运行前端生产构建**

Run: `cd frontend && npm run build`

Expected: PASS，生成最新 `frontend/dist`。

- [ ] **Step 5: 运行 Wails 生产构建，确认绑定与嵌入资源完整**

Run: `wails build -clean`

Expected: PASS，命令退出码为 0。

- [ ] **Step 6: 提交最终计划内实现**

```bash
git add docs/需求追踪/需求进度追踪-JVM缓存可视化编辑-20260422.md frontend/wailsjs/go/app/App.d.ts frontend/wailsjs/go/app/App.js frontend/wailsjs/go/models.ts
git commit -m "feat(jvm): 完成 JVM Connector MVP"
```

## Self-Review Notes

- Spec coverage:
  - `JMX + Management Endpoint`：Task 2 / Task 4 / Task 5
  - `统一连接入口`：Task 1 / Task 3
  - `资源浏览`：Task 4
  - `受控修改 + 预览 + 审计`：Task 5
  - `AI 生成修改计划`：Task 6
  - `验证与文档回填`：Task 7
- Placeholder scan:
  - 无 `TODO` / `TBD` / “后续补充” 占位语
- Type consistency:
  - 统一使用 `JVMConfig` / `Capability` / `ResourceSummary` / `ChangeRequest` / `ChangePreview`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-jvm-connector-mvp.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
