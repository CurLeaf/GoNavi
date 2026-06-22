package jvm

import (
	"errors"
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/shared/i18n"
)

func TestConnectionErrorMessageSourceUsesLocalizedTextForGenericWrapperAndEndpoint(t *testing.T) {
	sourceBytes, err := os.ReadFile("connection_error_message.go")
	if err != nil {
		t.Fatalf("read connection_error_message.go: %v", err)
	}
	source := string(sourceBytes)

	for _, rawText := range []string{
		`return "JVM 连接失败"`,
		`return "Endpoint 连接失败：未填写 Endpoint Base URL。"`,
		`"Endpoint 连接失败：Endpoint Base URL 格式不合法。"`,
		`"请填写完整的 ` + "`http://` 或 `https://` 地址，并指向实现 GoNavi JVM HTTP 合约的管理接口根路径，例如 `http://127.0.0.1:19090/manage/jvm`。" + ``,
		`"Endpoint 连接失败：当前只支持 HTTP 或 HTTPS 协议。"`,
		`"请把 Endpoint Base URL 改成 ` + "`http://` 或 `https://` 开头的地址。" + ``,
		`"Endpoint 连接失败：目标地址已响应，但没有找到 GoNavi JVM 管理接口。"`,
		`"请确认 Base URL 指向的是 JVM 管理接口根路径，而不是普通业务接口、健康检查地址或网关首页。"`,
		`"Endpoint 连接失败：目标管理接口未监听，或当前地址不可达。"`,
		`"请确认 Base URL 指向实现 GoNavi JVM HTTP 合约的管理接口，并检查服务监听、端口映射和防火墙。"`,
		`"Endpoint 连接失败：目标管理接口已响应，但当前 API Key 无效或缺失。"`,
		`"请检查连接中的 Endpoint API Key 是否与目标服务配置一致。"`,
		`"Endpoint 连接失败：当前请求被目标管理接口拒绝。"`,
		`"请确认当前客户端来源、鉴权配置和访问策略允许 GoNavi 访问该管理接口。"`,
		`"Endpoint 连接失败：访问目标管理接口超时。"`,
		`"请确认 Base URL 可达、目标服务已完成启动，并适当增加连接超时时间。"`,
		`"建议："+trimmed`,
		`"技术细节："+trimmed`,
	} {
		if strings.Contains(source, rawText) {
			t.Fatalf("connection_error_message.go still contains raw localized endpoint text %q", rawText)
		}
	}

	for _, key := range []string{
		"jvm.backend.connection_error.generic",
		"jvm.backend.connection_error.suggestion",
		"jvm.backend.connection_error.technical_detail",
		"jvm.backend.connection_error.endpoint.base_url_required",
		"jvm.backend.connection_error.endpoint.base_url_invalid.summary",
		"jvm.backend.connection_error.endpoint.base_url_invalid.help",
		"jvm.backend.connection_error.endpoint.scheme_unsupported.summary",
		"jvm.backend.connection_error.endpoint.scheme_unsupported.help",
		"jvm.backend.connection_error.endpoint.not_found.summary",
		"jvm.backend.connection_error.endpoint.not_found.help",
		"jvm.backend.connection_error.endpoint.connection_refused.summary",
		"jvm.backend.connection_error.endpoint.connection_refused.help",
		"jvm.backend.connection_error.endpoint.unauthorized.summary",
		"jvm.backend.connection_error.endpoint.unauthorized.help",
		"jvm.backend.connection_error.endpoint.forbidden.summary",
		"jvm.backend.connection_error.endpoint.forbidden.help",
		"jvm.backend.connection_error.endpoint.timeout.summary",
		"jvm.backend.connection_error.endpoint.timeout.help",
	} {
		if !strings.Contains(source, key) {
			t.Fatalf("connection_error_message.go does not reference i18n key %q", key)
		}
	}
}

func TestConnectionErrorMessageSourceUsesLocalizedTextForAgent(t *testing.T) {
	sourceBytes, err := os.ReadFile("connection_error_message.go")
	if err != nil {
		t.Fatalf("read connection_error_message.go: %v", err)
	}
	source := string(sourceBytes)

	for _, rawText := range []string{
		`return "Agent 连接失败：未填写 Agent Base URL。"`,
		`"Agent 连接失败：Agent Base URL 格式不合法。"`,
		`"请填写完整的 ` + "`http://` 或 `https://` 地址，例如 `http://127.0.0.1:19090/gonavi/agent/jvm`。" + ``,
		`"Agent 连接失败：当前只支持 HTTP 或 HTTPS 协议。"`,
		`"请把 Agent Base URL 改成 ` + "`http://` 或 `https://` 开头的地址。" + ``,
		`"Agent 连接失败：目标 Agent 管理端口未监听，或当前地址不可达。"`,
		`"请确认 Java 服务已通过 ` + "`-javaagent`" + ` 启动 GoNavi Agent，并检查 Base URL、端口映射和防火墙。"`,
		`"Agent 连接失败：Agent 已响应，但当前 API Key 无效或缺失。"`,
		`"请检查连接中的 Agent API Key 是否与目标服务启动参数一致。"`,
		`"Agent 连接失败：当前请求被 Agent 拒绝。"`,
		`"请确认当前客户端来源、鉴权配置和 Agent 访问策略允许 GoNavi 访问。"`,
		`"Agent 连接失败：访问 Agent 管理端口超时。"`,
		`"请确认目标地址可达、Agent 已完成启动，并适当增加连接超时时间。"`,
	} {
		if strings.Contains(source, rawText) {
			t.Fatalf("connection_error_message.go still contains raw localized agent text %q", rawText)
		}
	}

	for _, key := range []string{
		"jvm.backend.connection_error.agent.base_url_required",
		"jvm.backend.connection_error.agent.base_url_invalid.summary",
		"jvm.backend.connection_error.agent.base_url_invalid.help",
		"jvm.backend.connection_error.agent.scheme_unsupported.summary",
		"jvm.backend.connection_error.agent.scheme_unsupported.help",
		"jvm.backend.connection_error.agent.connection_refused.summary",
		"jvm.backend.connection_error.agent.connection_refused.help",
		"jvm.backend.connection_error.agent.unauthorized.summary",
		"jvm.backend.connection_error.agent.unauthorized.help",
		"jvm.backend.connection_error.agent.forbidden.summary",
		"jvm.backend.connection_error.agent.forbidden.help",
		"jvm.backend.connection_error.agent.timeout.summary",
		"jvm.backend.connection_error.agent.timeout.help",
	} {
		if !strings.Contains(source, key) {
			t.Fatalf("connection_error_message.go does not reference i18n key %q", key)
		}
	}
}

func TestConnectionErrorMessageSourceUsesLocalizedTextForJMX(t *testing.T) {
	sourceBytes, err := os.ReadFile("connection_error_message.go")
	if err != nil {
		t.Fatalf("read connection_error_message.go: %v", err)
	}
	source := string(sourceBytes)

	for _, rawText := range []string{
		`return "JMX 连接失败：未填写主机地址。"`,
		`return "JMX 连接失败：端口无效，请填写 1-65535 之间的有效端口。"`,
		`"JMX 连接失败：当前机器未找到 ` + "`java`" + ` 运行时，GoNavi 无法启动 JMX helper。"`,
		`"请先安装 JRE/JDK，或通过环境变量 ` + "`GONAVI_JMX_JAVA_BIN`" + ` 指向正确的 ` + "`java`" + ` 可执行文件。"`,
		`fmt.Sprintf("JMX 连接失败：%s 不是标准 JMX 远程管理端口，当前更像普通业务端口或 HTTP 端口。", target)`,
		`"请改填应用实际暴露的 JMX 端口，而不是业务 ` + "`server.port`" + `。如果服务只开启了 ` + "`-Dcom.sun.management.jmxremote`" + `，但没有配置 ` + "`jmxremote.port`" + `，也无法直接远程连接。"`,
		`fmt.Sprintf("JMX 连接失败：%s 上虽然有 RMI 服务，但不是可用的 JMX RMIServer 端口。", target)`,
		`"这通常意味着填到了 RMI 注册端口、调试端口或其他 Java 服务端口。请检查 ` + "`jmxremote.port`" + ` 和 ` + "`jmxremote.rmi.port`" + ` 配置是否正确。"`,
		`fmt.Sprintf("JMX 连接失败：%s 上的服务主动断开了连接，当前端口不是兼容的标准 JMX RMI 端口。", target)`,
		`"请确认填写的是 JVM 真正对外暴露的 JMX 端口，而不是业务端口、调试端口或被代理转发的端口。"`,
		`fmt.Sprintf("JMX 连接失败：无法连接到 %s，对应端口没有监听或当前网络不可达。", target)`,
		`"请确认目标 JVM 已开启远程 JMX，并检查主机、防火墙、端口映射和 SSH/代理配置。"`,
		`fmt.Sprintf("JMX 连接失败：%s 需要认证，或当前凭据不可用。", target)`,
		`"请确认目标 JMX 是否关闭认证；如果必须认证，需要补充用户名/密码后再连接。"`,
		`fmt.Sprintf("JMX 连接失败：连接 %s 超时。", target)`,
		`"请确认端口可达、网络未被拦截，并适当增加连接超时时间。"`,
	} {
		if strings.Contains(source, rawText) {
			t.Fatalf("connection_error_message.go still contains raw localized JMX text %q", rawText)
		}
	}

	for _, key := range []string{
		"jvm.backend.connection_error.jmx.host_required",
		"jvm.backend.connection_error.jmx.port_invalid",
		"jvm.backend.connection_error.jmx.java_missing.summary",
		"jvm.backend.connection_error.jmx.java_missing.help",
		"jvm.backend.connection_error.jmx.non_jrmp.summary",
		"jvm.backend.connection_error.jmx.non_jrmp.help",
		"jvm.backend.connection_error.jmx.no_such_object.summary",
		"jvm.backend.connection_error.jmx.no_such_object.help",
		"jvm.backend.connection_error.jmx.connection_reset.summary",
		"jvm.backend.connection_error.jmx.connection_reset.help",
		"jvm.backend.connection_error.jmx.connection_refused.summary",
		"jvm.backend.connection_error.jmx.connection_refused.help",
		"jvm.backend.connection_error.jmx.auth.summary",
		"jvm.backend.connection_error.jmx.auth.help",
		"jvm.backend.connection_error.jmx.timeout.summary",
		"jvm.backend.connection_error.jmx.timeout.help",
	} {
		if !strings.Contains(source, key) {
			t.Fatalf("connection_error_message.go does not reference i18n key %q", key)
		}
	}
}

func TestConnectionErrorMessageCatalogKeysExist(t *testing.T) {
	catalogs, err := i18n.LoadCatalogs()
	if err != nil {
		t.Fatalf("LoadCatalogs() error = %v", err)
	}

	keys := []string{
		"jvm.backend.connection_error.generic",
		"jvm.backend.connection_error.suggestion",
		"jvm.backend.connection_error.technical_detail",
		"jvm.backend.connection_error.endpoint.base_url_required",
		"jvm.backend.connection_error.endpoint.base_url_invalid.summary",
		"jvm.backend.connection_error.endpoint.base_url_invalid.help",
		"jvm.backend.connection_error.endpoint.scheme_unsupported.summary",
		"jvm.backend.connection_error.endpoint.scheme_unsupported.help",
		"jvm.backend.connection_error.endpoint.not_found.summary",
		"jvm.backend.connection_error.endpoint.not_found.help",
		"jvm.backend.connection_error.endpoint.connection_refused.summary",
		"jvm.backend.connection_error.endpoint.connection_refused.help",
		"jvm.backend.connection_error.endpoint.unauthorized.summary",
		"jvm.backend.connection_error.endpoint.unauthorized.help",
		"jvm.backend.connection_error.endpoint.forbidden.summary",
		"jvm.backend.connection_error.endpoint.forbidden.help",
		"jvm.backend.connection_error.endpoint.timeout.summary",
		"jvm.backend.connection_error.endpoint.timeout.help",
		"jvm.backend.connection_error.agent.base_url_required",
		"jvm.backend.connection_error.agent.base_url_invalid.summary",
		"jvm.backend.connection_error.agent.base_url_invalid.help",
		"jvm.backend.connection_error.agent.scheme_unsupported.summary",
		"jvm.backend.connection_error.agent.scheme_unsupported.help",
		"jvm.backend.connection_error.agent.connection_refused.summary",
		"jvm.backend.connection_error.agent.connection_refused.help",
		"jvm.backend.connection_error.agent.unauthorized.summary",
		"jvm.backend.connection_error.agent.unauthorized.help",
		"jvm.backend.connection_error.agent.forbidden.summary",
		"jvm.backend.connection_error.agent.forbidden.help",
		"jvm.backend.connection_error.agent.timeout.summary",
		"jvm.backend.connection_error.agent.timeout.help",
		"jvm.backend.connection_error.jmx.host_required",
		"jvm.backend.connection_error.jmx.port_invalid",
		"jvm.backend.connection_error.jmx.java_missing.summary",
		"jvm.backend.connection_error.jmx.java_missing.help",
		"jvm.backend.connection_error.jmx.non_jrmp.summary",
		"jvm.backend.connection_error.jmx.non_jrmp.help",
		"jvm.backend.connection_error.jmx.no_such_object.summary",
		"jvm.backend.connection_error.jmx.no_such_object.help",
		"jvm.backend.connection_error.jmx.connection_reset.summary",
		"jvm.backend.connection_error.jmx.connection_reset.help",
		"jvm.backend.connection_error.jmx.connection_refused.summary",
		"jvm.backend.connection_error.jmx.connection_refused.help",
		"jvm.backend.connection_error.jmx.auth.summary",
		"jvm.backend.connection_error.jmx.auth.help",
		"jvm.backend.connection_error.jmx.timeout.summary",
		"jvm.backend.connection_error.jmx.timeout.help",
	}

	for _, language := range i18n.SupportedLanguages() {
		catalog := catalogs[language]
		for _, key := range keys {
			if strings.TrimSpace(catalog[key]) == "" {
				t.Fatalf("%s catalog missing jvm connection error key %q", language, key)
			}
		}
	}
}

func TestDescribeConnectionTestErrorLocalizesAgentMessagesInEnglish(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			PreferredMode: ModeAgent,
			AllowedModes:  []string{ModeAgent},
		},
	}

	raw := `agent baseurl is invalid: parse ":bad-url": missing protocol scheme`
	got := DescribeConnectionTestError(cfg, errors.New(raw))
	want := strings.Join([]string{
		"Agent connection failed: Agent Base URL is invalid.",
		"Suggestion: Enter a full http:// or https:// URL, for example http://127.0.0.1:19090/gonavi/agent/jvm.",
		`Technical detail: agent baseurl is invalid: parse ":bad-url": missing protocol scheme`,
	}, "\n")
	if got != want {
		t.Fatalf("expected English agent message %q, got %q", want, got)
	}
}

func TestDescribeConnectionTestErrorLocalizesGenericAndEndpointMessagesInEnglish(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		JVM: connection.JVMConfig{
			PreferredMode: ModeEndpoint,
			AllowedModes:  []string{ModeEndpoint},
		},
	}

	if got := DescribeConnectionTestError(cfg, errors.New("   ")); got != "JVM connection failed" {
		t.Fatalf("expected English generic message, got %q", got)
	}

	raw := `endpoint baseurl is invalid: parse ":bad-url": missing protocol scheme`
	got := DescribeConnectionTestError(cfg, errors.New(raw))
	want := strings.Join([]string{
		"Endpoint connection failed: Endpoint Base URL is invalid.",
		"Suggestion: Enter a full http:// or https:// URL that points to the management API root implementing the GoNavi JVM HTTP contract, for example http://127.0.0.1:19090/manage/jvm.",
		`Technical detail: endpoint baseurl is invalid: parse ":bad-url": missing protocol scheme`,
	}, "\n")
	if got != want {
		t.Fatalf("expected English endpoint message %q, got %q", want, got)
	}
}

func TestDescribeConnectionTestErrorLocalizesJMXMessagesInEnglish(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		Host: "localhost",
		Port: 18080,
		JVM: connection.JVMConfig{
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}

	raw := `jmx helper ping failed for localhost:18080: JMX command ping failed for localhost:18080: Failed to retrieve RMIServer stub: javax.naming.CommunicationException [Root exception is java.rmi.ConnectIOException: non-JRMP server at remote endpoint]; details={"exception":"java.lang.IllegalStateException"}`
	got := DescribeConnectionTestError(cfg, errors.New(raw))
	want := strings.Join([]string{
		"JMX connection failed: localhost:18080 is not a standard JMX remote management port; it looks like a business or HTTP port.",
		"Suggestion: Use the actual JMX port exposed by the application, not the business `server.port`. If the service only enables `-Dcom.sun.management.jmxremote` without `jmxremote.port`, it cannot be connected remotely.",
		`Technical detail: jmx helper ping failed for localhost:18080: JMX command ping failed for localhost:18080: Failed to retrieve RMIServer stub: javax.naming.CommunicationException [Root exception is java.rmi.ConnectIOException: non-JRMP server at remote endpoint]; details={"exception":"java.lang.IllegalStateException"}`,
	}, "\n")
	if got != want {
		t.Fatalf("expected English JMX message %q, got %q", want, got)
	}
}
