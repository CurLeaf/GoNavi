import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_INSPECTION_MCP_TOOL_INFO: AIBuiltinToolInfo[] = [
  {
    name: "inspect_mcp_setup",
    icon: "🪛",
    desc: "查看当前 MCP 配置与外部接入状态",
    detail:
      "返回当前本地配置了哪些 MCP 服务、哪些已启用、每个服务声明了什么启动命令，以及 Claude Code / Codex 本机客户端写入状态、OpenClaw / Hermans 远程 Agent 接入边界与命令检测结果。适合用户问“我现在配了哪些 MCP”“为什么外部客户端还用不了”“MCP 到底写没写进去”时先读真实状态。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_mcp_setup",
        description:
          "读取当前本地 MCP 配置快照，包括 MCP 服务列表、启用状态、启动命令、环境变量 key、已发现工具，以及外部客户端的 GoNavi MCP 写入状态、本机 CLI 检测结果和远程 Agent 接入边界。适用于用户提到 MCP 服务配置、Claude/Codex/OpenClaw/Hermans 是否已接入、为什么外部客户端用不了、当前到底启用了哪些 MCP 时，先读取真实配置再回答。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_mcp_remote_access",
    icon: "🌉",
    desc: "查看 OpenClaw/Hermans 远程 MCP 接入方式",
    detail:
      "返回 GoNavi Streamable HTTP MCP 的本机启动命令、远程 URL/鉴权填写方式、OpenClaw/Hermans 云端 Agent 接入边界、可选桥接方案和安全提醒。适合用户说“OpenClaw 在云上怎么连 Windows GoNavi”“不要把数据库密码交给 Agent”“HTTP MCP 该怎么暴露”时先读这份远程接入快照。",
    params: "publicUrl?, localAddr?, path?, exposeStrategy?, tokenConfigured?",
    tool: {
      type: "function",
      function: {
        name: "inspect_mcp_remote_access",
        description:
          "读取 GoNavi MCP 远程 Agent 接入快照，返回 Streamable HTTP 模式启动命令、/mcp URL、Bearer Token 鉴权要求、OpenClaw/Hermans 云端接入步骤、数据库密码留在 Windows 本机的安全边界，以及隧道/反向代理/Tailscale 等暴露方式的风险提示。适用于用户提到 OpenClaw、Hermans、云端 Linux Agent、远程 MCP、不要复制数据库密码、或本机 GoNavi 如何给外部 Agent 访问表结构时优先调用。",
        parameters: {
          type: "object",
          properties: {
            publicUrl: { type: "string", description: "可选，云端 Agent 最终能访问的 HTTPS 或私有网络 URL；如果没带 /mcp，工具会按 path 补上" },
            localAddr: { type: "string", description: "可选，Windows 本机 HTTP MCP 监听地址，默认 127.0.0.1:8765；不建议直接绑定 0.0.0.0" },
            path: { type: "string", description: "可选，Streamable HTTP MCP 路径，默认 /mcp" },
            exposeStrategy: {
              type: "string",
              enum: ["reverse_proxy", "ssh_reverse_tunnel", "cloudflare_tunnel", "tailscale", "custom"],
              description: "可选，计划使用的远程暴露方式，用于返回对应风险提醒",
            },
            tokenConfigured: { type: "boolean", description: "可选，是否已经准备随机 Bearer Token；传 false 会返回鉴权告警" },
          },
        },
      },
    },
  },
  {
    name: "inspect_mcp_authoring_guide",
    icon: "🧭",
    desc: "查看新增 MCP 的填写指引",
    detail:
      "返回新增 MCP 表单里各字段的作用、推荐填写顺序、完整命令自动拆分规则，以及 npx / Node / uvx / Python / EXE 模板样例。适合用户问“command/args/env 到底怎么填”“给我一个 npx / node / uvx / python 示例”“为什么启动命令不能整行填”时，先读这份真实接入指引。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_mcp_authoring_guide",
        description:
          "读取 GoNavi 当前内置的 MCP 新增指引，包括推荐填写顺序、字段作用、常见命令示例、完整命令自动拆分规则，以及 npx / Node / uvx / Python / EXE 模板样例。适用于用户提到新增 MCP 不知道 command、args、env、timeout 怎么填，或想要一个最接近的模板时，先读取这份真实前端接入指南，不要凭记忆口述。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_mcp_draft",
    icon: "🧪",
    desc: "校验 MCP 新增草稿",
    detail:
      "按完整启动命令或分字段草稿试算 GoNavi 的 MCP 新增配置，返回自动拆分结果、启动预览、字段校验问题、推荐模板和下一步修复建议。适合用户贴出一整行 MCP 启动命令、问 command/args/env/timeout 该怎么拆，或保存前想确认配置有没有明显问题时使用。",
    params: "fullCommand?, command?, args?, envText?, timeoutSeconds?, templateKey?, name?",
    tool: {
      type: "function",
      function: {
        name: "inspect_mcp_draft",
        description:
          "校验一份待新增的 MCP 服务草稿。支持传 fullCommand/rawCommand/commandLine 让 GoNavi 自动拆分，也支持传 command、args、envText、timeoutSeconds 和 templateKey 做分字段校验；返回解析后的字段、启动命令预览、错误/告警、推荐模板和 nextActions。适用于用户贴出 MCP README 启动命令、问新增 MCP 参数怎么填、或 AI 准备指导用户保存前，先用真实校验器试算。",
        parameters: {
          type: "object",
          properties: {
            fullCommand: { type: "string", description: "可选，README 或用户贴出的一整行 MCP 启动命令，例如 $env:GITHUB_TOKEN=...; uvx mcp-server-github --stdio" },
            command: { type: "string", description: "可选，分字段草稿里的启动命令，只应是 npx、node、uvx、python 或 exe 路径本身" },
            args: {
              oneOf: [
                { type: "array", items: { type: "string" } },
                { type: "string" },
              ],
              description: "可选，分字段草稿里的命令参数；数组更准确，也可传逗号或换行分隔字符串",
            },
            envText: { type: "string", description: "可选，环境变量草稿，每行 KEY=VALUE；不要传 export、set 或 $env: 前缀" },
            timeoutSeconds: { type: "number", description: "可选，单次工具发现或调用超时秒数；推荐 20，慢启动服务可用 45 或 60" },
            templateKey: { type: "string", enum: ["npx", "uvx", "node", "python", "exe"], description: "可选，先套用一个内置模板再覆盖用户传入字段" },
            name: { type: "string", description: "可选，MCP 服务名称，例如 GitHub、Filesystem、Browser" },
          },
        },
      },
    },
  },
  {
    name: "inspect_mcp_tool_schema",
    icon: "🧩",
    desc: "查看 MCP 工具参数怎么传",
    detail:
      "按 alias、serverId 或关键词查看当前已发现 MCP 工具的 inputSchema，返回必填参数、字段类型、枚举值、嵌套对象路径和调用前提示。适合新增 MCP 成功后，用户或 AI 不知道某个 MCP 工具到底该传哪些参数时先读真实 schema。",
    params: "alias?, serverId?, keyword?, includeSchema?(默认 false), limit?(默认 8)",
    tool: {
      type: "function",
      function: {
        name: "inspect_mcp_tool_schema",
        description:
          "读取当前已发现 MCP 工具的参数 schema 摘要，可按 alias、serverId 或关键词过滤，并返回必填字段、类型、枚举值、嵌套参数路径和调用前提示。适用于用户问某个 MCP 工具参数怎么填、AI 准备调用外部 MCP 工具但不确定 arguments JSON 怎么写、或工具调用报参数错误时，先读取真实 inputSchema 再继续。",
        parameters: {
          type: "object",
          properties: {
            alias: { type: "string", description: "可选，按 MCP 工具 alias 精确查询，例如 github_create_issue；优先通过 inspect_mcp_setup 获取真实 alias" },
            serverId: { type: "string", description: "可选，只看某个 MCP serverId 下发现的工具" },
            keyword: { type: "string", description: "可选，按工具 alias、原始名称、标题、描述或服务名做关键词筛选" },
            includeSchema: { type: "boolean", description: "可选，是否附带完整原始 inputSchema，默认 false；需要深查复杂嵌套 schema 时再开启" },
            limit: { type: "number", description: "可选，最多返回多少个匹配工具，默认 8，最大 30" },
          },
        },
      },
    },
  },
];
