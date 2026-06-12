import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_INSPECTION_CORE_TOOL_INFO: AIBuiltinToolInfo[] = [
  {
    name: "inspect_app_health",
    icon: "🧭",
    desc: "一键查看 AI 应用健康总览",
    detail:
      "汇总 AI 配置、供应商发送前置、MCP 接入、应用日志 ERROR/WARN、最近连接失败/冷却、AI 回复气泡渲染异常和当前工作区页签，给出阻塞项、运行期异常信号和下一步探针建议。适合用户说“AI 不稳定”“整体帮我看看”“连接和 MCP 一起排查”时先做一次全局摸底。",
    params: "keyword?, connectionKeyword?, lineLimit?(默认 120), includeLogLines?(默认 false)",
    tool: {
      type: "function",
      function: {
        name: "inspect_app_health",
        description:
          "读取 GoNavi AI 应用健康总览，汇总 AI 供应商与发送前置、MCP 接入、应用日志 ERROR/WARN、最近连接失败/冷却、AI 回复气泡渲染异常和当前工作区页签，并返回阻塞项、运行期异常信号与下一步探针建议。适用于用户提到 AI 不稳定、整体不成熟、连接/MCP/日志/回复气泡异常需要一起排查或要求先看全局状态时，优先调用该工具。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，读取应用日志时按关键词过滤，例如 ai、mcp、mysql、error；不传则读取最近日志窗口" },
            connectionKeyword: { type: "string", description: "可选，分析连接失败日志时按连接类型、地址或错误关键词过滤；不传时复用 keyword" },
            lineLimit: { type: "number", description: "可选，每次最多分析多少行日志，默认 120，最大 240" },
            includeLogLines: { type: "boolean", description: "可选，是否在结果里附带日志原文行，默认 false；需要引用原文时再开启" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_support_bundle",
    icon: "📦",
    desc: "导出 AI 排障支持包",
    detail:
      "一次性汇总 AI 应用健康、供应商与 MCP 状态、应用日志摘要、连接失败摘要、消息流结构、上下文体量、远程 MCP 接入和工具目录索引。适合用户反馈“AI 不稳定”“MCP/连接/日志一起看”“要给开发排障材料”时先生成一份不含密钥和数据库密码的支持包。",
    params: "keyword?, sessionId?, lineLimit?(默认 120), includeLogLines?(默认 false), includeMessageContent?(默认 false), publicUrl?, tokenConfigured?",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_support_bundle",
        description:
          "生成 GoNavi AI 排障支持包，汇总 AI 应用健康、供应商和发送前置、MCP 配置和远程接入、应用日志摘要、数据库连接失败摘要、当前 AI 消息流、上下文体量风险和工具目录索引。默认不包含数据库密码、供应商密钥、MCP 环境变量值、日志原文或完整消息内容。适用于用户反馈 AI 不稳定、MCP/连接/日志问题交织、需要一次性导出排障证据或准备给开发定位时优先调用。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按关键词过滤日志和工具目录，例如 ai、mcp、mysql、error、openclaw" },
            connectionKeyword: { type: "string", description: "可选，分析连接失败日志时使用的关键词；不传时复用 keyword" },
            sessionId: { type: "string", description: "可选，指定要诊断的 AI 会话 ID；不传时使用当前活动会话" },
            lineLimit: { type: "number", description: "可选，最多分析多少行应用日志，默认 120，最大 240" },
            includeLogLines: { type: "boolean", description: "可选，是否附带日志原文行，默认 false；需要引用原文时再开启" },
            includeMessageContent: { type: "boolean", description: "可选，是否附带消息内容预览，默认 false；排查气泡内容时再开启" },
            includeDetails: { type: "boolean", description: "可选，是否附带上下文体量明细，默认 false" },
            publicUrl: { type: "string", description: "可选，云端 Agent 访问 GoNavi MCP 的公网/隧道 URL，用于远程 MCP 支持包" },
            localAddr: { type: "string", description: "可选，Windows 本机 HTTP MCP 监听地址，默认 127.0.0.1:8765" },
            path: { type: "string", description: "可选，Streamable HTTP MCP 路径，默认 /mcp" },
            exposeStrategy: {
              type: "string",
              enum: ["reverse_proxy", "ssh_reverse_tunnel", "cloudflare_tunnel", "tailscale", "custom"],
              description: "可选，远程暴露方式，用于生成对应安全提醒",
            },
            tokenConfigured: { type: "boolean", description: "可选，是否已经准备随机 Bearer Token；传 false 会返回鉴权告警" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_setup_health",
    icon: "🩺",
    desc: "一键体检当前 AI 配置健康度",
    detail:
      "汇总当前 AI 供应商、聊天发送前置、MCP 服务与外部客户端接入、提示词与 Skills、上下文挂载情况，并给出阻塞项、告警项和下一步建议。适合用户说“AI 为什么不好用”“帮我看下 AI 整体有没有问题”“现在这套 AI 配置还缺什么”时先做一次总览诊断。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_setup_health",
        description:
          "体检当前 AI 配置健康度，返回供应商、模型、聊天发送前置、MCP 接入、提示词与 Skills、表结构上下文挂载等整体快照，并给出阻塞项、建议项和下一步动作。适用于用户提到 AI 为什么不好用、当前 AI 配置哪里还缺、是否已经能稳定工作时，优先读取这份总览诊断，不要拆成多次猜测。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_ai_runtime",
    icon: "🎛️",
    desc: "查看当前 AI 自身运行状态",
    detail:
      "返回当前启用的模型供应商、模型名、安全级别、上下文级别、启用的 Skills，以及当前已暴露的内置工具和 MCP 工具。适合用户问“你现在能调用什么”“当前用的哪个模型”“为什么不能执行写操作”时，先读真实运行状态再回答。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_runtime",
        description:
          "读取当前 AI 运行时快照，包括当前供应商、模型、安全级别、上下文级别、启用的 Skills、当前可用的内置工具与 MCP 工具。适用于用户询问当前 AI 能力边界、当前使用哪个模型、为什么不能执行某些操作时，先读取真实运行状态，避免模型猜测。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_ai_safety",
    icon: "🛡️",
    desc: "查看当前 AI 写入安全边界",
    detail:
      "返回当前 AI 安全级别对应的 SQL 允许范围、非只读语句是否仍需确认 / allowMutating，以及当前活动连接、页签或 JVM 诊断权限是否还叠加了只读限制。适合用户问“为什么现在不能写”“DDL 能不能执行”“allowMutating 要不要传”时先读真实边界。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_safety",
        description:
          "读取当前 AI 安全边界快照，包括当前安全级别允许的 SQL 范围、非查询语句的确认要求、MCP execute_sql 对 allowMutating 的要求，以及当前活动连接、结果页签或 JVM 诊断权限是否额外处于只读限制。适用于用户提到为什么现在不能写、当前是不是只读、DDL 能不能执行、allowMutating 是否必须传时，先读取真实边界再回答。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_ai_providers",
    icon: "🪪",
    desc: "查看当前 AI 供应商与模型配置",
    detail:
      "返回当前配置了哪些 AI 供应商、哪个正在生效、各自的 baseUrl、已选模型、声明模型列表、密钥是否存在、自定义请求头 key，以及缺少密钥/模型/地址等待检查项。适合用户问“为什么没有模型”“API Key 有没有配”“当前到底配了哪些供应商”时先读真实配置。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_providers",
        description:
          "读取当前 AI 供应商配置快照，包括供应商列表、活动供应商、接口地址、已选模型、声明模型列表、是否存在密钥、自定义请求头 key，以及缺少密钥/模型/地址等待检查项。适用于用户提到当前供应商、模型列表为空、API Key 是否配置、为什么 AI 不能正常发起请求时，先读取真实配置再解释。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_ai_chat_readiness",
    icon: "🚦",
    desc: "查看当前 AI 聊天是否具备发送条件",
    detail:
      "返回当前聊天输入区是否已经具备发送条件，包括有没有活动供应商、当前供应商是否缺密钥或接口地址、是否已选模型、当前连接/表结构上下文是否已挂载，以及下一步建议动作。适合用户问“为什么现在不能发送”“输入框到底缺什么配置”“当前 AI 聊天准备好了没有”时先读真实状态。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_chat_readiness",
        description:
          "读取当前 AI 聊天输入区的发送前置状态，包括活动供应商、密钥和接口地址是否完整、是否已选模型、当前连接上下文和已挂载表结构数量，以及建议的下一步动作。适用于用户提到为什么现在不能发送、为什么输入区还没准备好、当前到底缺什么配置时，先读取真实状态再回答。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_ai_upstream_logs",
    icon: "📡",
    desc: "查看 AI 上游请求入参与状态",
    detail:
      "从 gonavi.log 读取最近的 AI 上游请求开始/完成/失败记录，按 provider、requestId 或关键词过滤，返回请求体 body 预览、payload 结构摘要、endpoint、状态码、耗时和错误摘要。适合用户想核对发给上游模型的真实入参、排查请求参数兼容、确认工具是否随请求下发或脱敏日志是否写入时先调用。",
    params: "provider?, requestId?, keyword?, lineLimit?(默认 160), requestLimit?(默认 12), includeBody?(默认 true), includePayloadSummary?(默认 true), includeLines?(默认 false)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_upstream_logs",
        description:
          "读取 GoNavi 应用日志中的 AI 上游请求记录，返回 requestId、provider、method、endpoint、请求 body 预览、脱敏 payload 结构摘要、状态码、耗时和错误摘要。适用于用户提到 AI 请求入参、上游请求体、requestId、provider 请求参数、工具调用没有触发、模型接口报错、或需要核对刚才发给上游模型的真实 payload 时，先读取该工具，不要只凭界面响应推断。",
        parameters: {
          type: "object",
          properties: {
            provider: { type: "string", description: "可选，只看某个供应商，例如 openai、anthropic、gemini；大小写不敏感" },
            requestId: { type: "string", description: "可选，按日志里的 requestId 精确过滤，适合从错误日志继续追踪同一次请求" },
            keyword: { type: "string", description: "可选，在 requestId、provider、endpoint、bodyPreview 或 error 中继续过滤，例如模型名、接口路径、参数名" },
            lineLimit: { type: "number", description: "可选，最多读取多少行日志尾部，默认 160，最大 300" },
            requestLimit: { type: "number", description: "可选，最多返回多少个请求摘要，默认 12，最大 40" },
            includeBody: { type: "boolean", description: "可选，是否返回已脱敏的请求 body 预览，默认 true；只看状态时可设为 false" },
            includePayloadSummary: { type: "boolean", description: "可选，是否解析请求 body 并返回模型、消息角色分布、工具数量/名称、stream/tool_choice 等结构摘要，默认 true；不返回消息正文或密钥" },
            includeLines: { type: "boolean", description: "可选，是否附带脱敏后的原始日志行，默认 false；需要引用原文时再开启" },
            bodyPreviewLimit: { type: "number", description: "可选，单个 body 预览最大字符数，默认 6000，最大 12000" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_tool_catalog",
    icon: "🧭",
    desc: "查看 AI 内置工具目录和参数提示",
    detail:
      "按关键词或工具名返回 GoNavi AI 内置工具、推荐探针流程、参数说明和当前 MCP 工具摘要。适合用户问“你该用哪个工具”“这个工具参数怎么填”“有哪些内置工具”或 AI 需要先选择探针路线时调用。",
    params: "keyword?, toolName?, includeMCPTools?(默认 true), limit?(默认 12)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_tool_catalog",
        description:
          "读取 GoNavi AI 工具目录快照，可按关键词或工具名筛选，返回推荐工具调用流程、内置工具说明、参数提示和当前已发现 MCP 工具摘要。适用于用户询问当前有哪些内置工具、某类问题该先调用哪个探针、工具 arguments 怎么填、或 AI 在处理复杂问题前需要先选择工具路线时优先调用。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按问题关键词过滤工具和流程，例如 mcp、连接失败、事务、快捷键、schema、日志" },
            toolName: { type: "string", description: "可选，按内置工具名精确查询，例如 inspect_mcp_draft 或 inspect_sql_risk" },
            includeMCPTools: { type: "boolean", description: "可选，是否同时返回当前已发现的 MCP 工具摘要，默认 true" },
            limit: { type: "number", description: "可选，最多返回多少条流程、内置工具和 MCP 工具，默认 12，最大 40" },
          },
        },
      },
    },
  },
];
