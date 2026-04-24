package jvm

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

func DescribeConnectionTestError(cfg connection.ConnectionConfig, err error) string {
	if err == nil {
		return ""
	}

	raw := strings.TrimSpace(err.Error())
	if raw == "" {
		return "JVM 连接失败"
	}

	switch strings.ToLower(strings.TrimSpace(cfg.JVM.PreferredMode)) {
	case ModeJMX:
		if mapped := describeJMXConnectionError(cfg, raw); mapped != "" {
			return mapped
		}
	case ModeEndpoint:
		if mapped := describeEndpointConnectionError(raw); mapped != "" {
			return mapped
		}
	case ModeAgent:
		if mapped := describeAgentConnectionError(raw); mapped != "" {
			return mapped
		}
	}

	return raw
}

func describeEndpointConnectionError(raw string) string {
	lower := strings.ToLower(raw)

	switch {
	case strings.Contains(lower, "endpoint baseurl is required"):
		return "Endpoint 连接失败：未填写 Endpoint Base URL。"
	case strings.Contains(lower, "endpoint baseurl is invalid"):
		return joinConnectionErrorMessage(
			"Endpoint 连接失败：Endpoint Base URL 格式不合法。",
			"请填写完整的 `http://` 或 `https://` 地址，并指向实现 GoNavi JVM HTTP 合约的管理接口根路径，例如 `http://127.0.0.1:19090/manage/jvm`。",
			raw,
		)
	case strings.Contains(lower, "endpoint scheme is unsupported"):
		return joinConnectionErrorMessage(
			"Endpoint 连接失败：当前只支持 HTTP 或 HTTPS 协议。",
			"请把 Endpoint Base URL 改成 `http://` 或 `https://` 开头的地址。",
			raw,
		)
	case strings.Contains(lower, "unexpected status: 404"), strings.Contains(lower, "request failed: 404"):
		return joinConnectionErrorMessage(
			"Endpoint 连接失败：目标地址已响应，但没有找到 GoNavi JVM 管理接口。",
			"请确认 Base URL 指向的是 JVM 管理接口根路径，而不是普通业务接口、健康检查地址或网关首页。",
			raw,
		)
	case strings.Contains(lower, "connect: connection refused"), strings.Contains(lower, "connection refused"):
		return joinConnectionErrorMessage(
			"Endpoint 连接失败：目标管理接口未监听，或当前地址不可达。",
			"请确认 Base URL 指向实现 GoNavi JVM HTTP 合约的管理接口，并检查服务监听、端口映射和防火墙。",
			raw,
		)
	case strings.Contains(lower, "401 unauthorized"), strings.Contains(lower, "missing or invalid api key"):
		return joinConnectionErrorMessage(
			"Endpoint 连接失败：目标管理接口已响应，但当前 API Key 无效或缺失。",
			"请检查连接中的 Endpoint API Key 是否与目标服务配置一致。",
			raw,
		)
	case strings.Contains(lower, "403 forbidden"):
		return joinConnectionErrorMessage(
			"Endpoint 连接失败：当前请求被目标管理接口拒绝。",
			"请确认当前客户端来源、鉴权配置和访问策略允许 GoNavi 访问该管理接口。",
			raw,
		)
	case strings.Contains(lower, "timed out"), strings.Contains(lower, "timeout"), strings.Contains(lower, "context deadline exceeded"), strings.Contains(lower, "i/o timeout"):
		return joinConnectionErrorMessage(
			"Endpoint 连接失败：访问目标管理接口超时。",
			"请确认 Base URL 可达、目标服务已完成启动，并适当增加连接超时时间。",
			raw,
		)
	default:
		return ""
	}
}

func describeAgentConnectionError(raw string) string {
	lower := strings.ToLower(raw)

	switch {
	case strings.Contains(lower, "agent baseurl is required"):
		return "Agent 连接失败：未填写 Agent Base URL。"
	case strings.Contains(lower, "agent baseurl is invalid"):
		return joinConnectionErrorMessage(
			"Agent 连接失败：Agent Base URL 格式不合法。",
			"请填写完整的 `http://` 或 `https://` 地址，例如 `http://127.0.0.1:19090/gonavi/agent/jvm`。",
			raw,
		)
	case strings.Contains(lower, "agent scheme is unsupported"):
		return joinConnectionErrorMessage(
			"Agent 连接失败：当前只支持 HTTP 或 HTTPS 协议。",
			"请把 Agent Base URL 改成 `http://` 或 `https://` 开头的地址。",
			raw,
		)
	case strings.Contains(lower, "connect: connection refused"), strings.Contains(lower, "connection refused"):
		return joinConnectionErrorMessage(
			"Agent 连接失败：目标 Agent 管理端口未监听，或当前地址不可达。",
			"请确认 Java 服务已通过 `-javaagent` 启动 GoNavi Agent，并检查 Base URL、端口映射和防火墙。",
			raw,
		)
	case strings.Contains(lower, "401 unauthorized"), strings.Contains(lower, "missing or invalid api key"):
		return joinConnectionErrorMessage(
			"Agent 连接失败：Agent 已响应，但当前 API Key 无效或缺失。",
			"请检查连接中的 Agent API Key 是否与目标服务启动参数一致。",
			raw,
		)
	case strings.Contains(lower, "403 forbidden"):
		return joinConnectionErrorMessage(
			"Agent 连接失败：当前请求被 Agent 拒绝。",
			"请确认当前客户端来源、鉴权配置和 Agent 访问策略允许 GoNavi 访问。",
			raw,
		)
	case strings.Contains(lower, "timed out"), strings.Contains(lower, "timeout"), strings.Contains(lower, "context deadline exceeded"), strings.Contains(lower, "i/o timeout"):
		return joinConnectionErrorMessage(
			"Agent 连接失败：访问 Agent 管理端口超时。",
			"请确认目标地址可达、Agent 已完成启动，并适当增加连接超时时间。",
			raw,
		)
	default:
		return ""
	}
}

func describeJMXConnectionError(cfg connection.ConnectionConfig, raw string) string {
	lower := strings.ToLower(raw)
	target := fmt.Sprintf("%s:%d", resolveJMXHost(cfg), resolveJMXPort(cfg))

	switch {
	case strings.Contains(lower, "jmx host is required"):
		return "JMX 连接失败：未填写主机地址。"
	case strings.Contains(lower, "jmx port is invalid"):
		return "JMX 连接失败：端口无效，请填写 1-65535 之间的有效端口。"
	case strings.Contains(lower, `required jmx helper dependency "java" not found`):
		return joinConnectionErrorMessage(
			"JMX 连接失败：当前机器未找到 `java` 运行时，GoNavi 无法启动 JMX helper。",
			"请先安装 JRE/JDK，或通过环境变量 `GONAVI_JMX_JAVA_BIN` 指向正确的 `java` 可执行文件。",
			raw,
		)
	case strings.Contains(lower, "non-jrmp server at remote endpoint"):
		return joinConnectionErrorMessage(
			fmt.Sprintf("JMX 连接失败：%s 不是标准 JMX 远程管理端口，当前更像普通业务端口或 HTTP 端口。", target),
			"请改填应用实际暴露的 JMX 端口，而不是业务 `server.port`。如果服务只开启了 `-Dcom.sun.management.jmxremote`，但没有配置 `jmxremote.port`，也无法直接远程连接。",
			raw,
		)
	case strings.Contains(lower, "no such object in table"):
		return joinConnectionErrorMessage(
			fmt.Sprintf("JMX 连接失败：%s 上虽然有 RMI 服务，但不是可用的 JMX RMIServer 端口。", target),
			"这通常意味着填到了 RMI 注册端口、调试端口或其他 Java 服务端口。请检查 `jmxremote.port` 和 `jmxremote.rmi.port` 配置是否正确。",
			raw,
		)
	case strings.Contains(lower, "connection reset"):
		return joinConnectionErrorMessage(
			fmt.Sprintf("JMX 连接失败：%s 上的服务主动断开了连接，当前端口不是兼容的标准 JMX RMI 端口。", target),
			"请确认填写的是 JVM 真正对外暴露的 JMX 端口，而不是业务端口、调试端口或被代理转发的端口。",
			raw,
		)
	case strings.Contains(lower, "connection refused"):
		return joinConnectionErrorMessage(
			fmt.Sprintf("JMX 连接失败：无法连接到 %s，对应端口没有监听或当前网络不可达。", target),
			"请确认目标 JVM 已开启远程 JMX，并检查主机、防火墙、端口映射和 SSH/代理配置。",
			raw,
		)
	case strings.Contains(lower, "authentication failed"), strings.Contains(lower, "securityexception"):
		return joinConnectionErrorMessage(
			fmt.Sprintf("JMX 连接失败：%s 需要认证，或当前凭据不可用。", target),
			"请确认目标 JMX 是否关闭认证；如果必须认证，需要补充用户名/密码后再连接。",
			raw,
		)
	case strings.Contains(lower, "timed out"), strings.Contains(lower, "timeout"), strings.Contains(lower, "context deadline exceeded"), strings.Contains(lower, "i/o timeout"):
		return joinConnectionErrorMessage(
			fmt.Sprintf("JMX 连接失败：连接 %s 超时。", target),
			"请确认端口可达、网络未被拦截，并适当增加连接超时时间。",
			raw,
		)
	default:
		return ""
	}
}

func joinConnectionErrorMessage(summary string, suggestion string, raw string) string {
	lines := make([]string, 0, 3)
	if trimmed := strings.TrimSpace(summary); trimmed != "" {
		lines = append(lines, trimmed)
	}
	if trimmed := strings.TrimSpace(suggestion); trimmed != "" {
		lines = append(lines, "建议："+trimmed)
	}
	if trimmed := strings.TrimSpace(raw); trimmed != "" {
		lines = append(lines, "技术细节："+trimmed)
	}
	return strings.Join(lines, "\n")
}
