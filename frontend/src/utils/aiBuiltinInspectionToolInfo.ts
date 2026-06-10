import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_INSPECTION_TOOL_INFO: AIBuiltinToolInfo[] = [
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
  {
    name: "inspect_ai_guidance",
    icon: "🧠",
    desc: "查看当前 AI 提示词与 Skills 配置",
    detail:
      "返回当前用户自定义的全局/数据库/JVM 提示词，以及当前启用的 Skills、作用域、依赖工具和 skill prompt 内容。适合用户问“你现在到底带了哪些提示词”“为什么你会这样回答”“当前有哪些 Skills 在生效”时先读真实配置。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_guidance",
        description:
          "读取当前 AI 的提示与技能配置快照，包括用户自定义提示词、当前启用的 Skills、作用域、依赖工具和各自的 system prompt。适用于用户提到当前提示词、当前 Skill、为什么 AI 当前会这样回答、当前有哪些规则在生效时，先读取真实配置再解释。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_ai_context",
    icon: "🧷",
    desc: "查看当前 AI 已关联的表结构上下文",
    detail:
      "返回当前对话已经挂载到 AI 上下文里的表清单、所属连接与数据库，以及每张表的 DDL 预览。适合用户说“看看我现在带了哪些表结构”“当前 AI 上下文是什么”时，先读取真实挂载状态再继续分析。",
    params: "includeDDL?(默认 false), ddlLimit?(默认 4000)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_context",
        description:
          "读取当前对话已经关联到 AI 上下文里的表结构快照，包括连接、数据库、表名，以及可选的 DDL 内容。适用于用户提到当前 AI 上下文、当前关联表、当前挂载的表结构时，先读取真实状态，避免模型凭记忆复述。",
        parameters: {
          type: "object",
          properties: {
            includeDDL: { type: "boolean", description: "可选，是否附带每张表的 DDL 内容，默认 false" },
            ddlLimit: { type: "number", description: "可选，DDL 截断长度，默认 4000，最大 12000" },
          },
        },
      },
    },
  },
  {
    name: "inspect_current_connection",
    icon: "🛰️",
    desc: "查看当前活动连接/数据源摘要",
    detail:
      "返回当前活动连接的类型、地址、端口、当前数据库、是否启用 SSH/代理/HTTP 隧道，以及当前活动页签绑定的表信息。适合用户问“我现在连的是哪个库”“这个连接走没走 SSH”“当前数据源是什么类型”时先读取真实连接状态。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_current_connection",
        description:
          "读取当前活动连接或当前页签对应数据源的真实摘要，包括连接类型、地址、端口、当前数据库、SSH/代理/HTTP 隧道状态，以及当前页签绑定的表上下文。适用于用户提到当前连接、当前数据源、当前库地址、是否走 SSH、当前连的是哪种数据库时，先读取真实界面上下文，避免模型猜测。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_connection_capabilities",
    icon: "🧱",
    desc: "查看当前连接支持哪些前端能力",
    detail:
      "返回当前或指定连接的数据源能力矩阵，包括是否支持查询编辑器、SQL 导出、复制 INSERT、新建/重命名/删除数据库、结果是否强制只读，以及是否倾向手动总数或近似计数。适合用户问“为什么这里不能建库/删库”“这个数据源为什么结果不能编辑”“这个类型支持哪些操作”时，先读取真实能力边界。",
    params: "connectionId?(默认取当前活动连接)",
    tool: {
      type: "function",
      function: {
        name: "inspect_connection_capabilities",
        description:
          "读取当前活动连接或指定 saved connection 的前端能力矩阵，包括是否支持查询编辑器、SQL 导出、复制 INSERT、新建/重命名/删除数据库、结果是否强制只读，以及是否适合手动总数或近似计数。适用于用户提到当前连接为什么不能建库、为什么结果集不能编辑、某种数据库类型到底支持哪些前端动作时，先读取真实能力配置，避免模型凭经验猜测。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "可选，指定要查看的连接 ID；不传时默认读取当前活动连接" },
          },
        },
      },
    },
  },
  {
    name: "inspect_saved_connections",
    icon: "🧭",
    desc: "查看本地已保存连接清单",
    detail:
      "可按关键词或数据库类型过滤，返回本地保存的数据源列表、连接类型分布，以及每条连接的地址、当前库、SSH/代理/HTTP 隧道状态。适合用户问“我本地存了哪些连接”“帮我找 mysql / postgres 连接”“哪条连接配置了 SSH”时先读真实本地连接资产。",
    params: "keyword?, type?, limit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_saved_connections",
        description:
          "读取本地已保存连接清单，可按关键词和数据库类型过滤，并返回每条连接的类型、地址、当前库、SSH/代理/HTTP 隧道等摘要。适用于用户提到本地保存了哪些连接、要找哪条 mysql/postgres 连接、哪条连接启用了 SSH 或代理时，先读取真实本地连接资产再回答。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按连接名、ID、类型、主机、数据库名或 SSH/代理地址做关键词筛选" },
            type: { type: "string", description: "可选，只看某种数据库类型，例如 mysql、postgres、redis、mongodb" },
            limit: { type: "number", description: "可选，最多返回多少条连接，默认 20，最大 100" },
          },
        },
      },
    },
  },
  {
    name: "inspect_external_sql_directories",
    icon: "🗂️",
    desc: "查看本地外部 SQL 目录资产",
    detail:
      "可按关键词、连接或数据库过滤，返回本地配置的外部 SQL 目录、目录路径、绑定连接/数据库，以及当前是否已经打开这些目录里的 SQL 文件。适合用户提到“外部 SQL 目录”“某个脚本在哪个目录”“现在打开的 SQL 文件来自哪个外部目录”时，先读真实资产。",
    params: "keyword?, connectionId?, dbName?, limit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_external_sql_directories",
        description:
          "读取本地配置的外部 SQL 目录清单，可按关键词、连接和数据库过滤，并返回目录路径、绑定连接/数据库，以及当前打开的外部 SQL 文件页签摘要。适用于用户提到外部 SQL 目录、某个 SQL 文件放在哪、当前打开的脚本来自哪个目录时，先读取真实本地资产再回答。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按目录名、路径、连接名或数据库名做关键词筛选" },
            connectionId: { type: "string", description: "可选，只看绑定到某个连接的外部 SQL 目录" },
            dbName: { type: "string", description: "可选，只看绑定到某个数据库的外部 SQL 目录" },
            limit: { type: "number", description: "可选，最多返回多少条目录，默认 20，最大 100" },
          },
        },
      },
    },
  },
  {
    name: "inspect_external_sql_file",
    icon: "📄",
    desc: "读取外部 SQL 文件内容",
    detail:
      "传入具体 filePath，读取已配置外部 SQL 目录中的 SQL 文件内容，并返回所属目录、绑定连接/数据库、是否已有打开页签，以及截断后的正文预览。适合用户提到“看一下这个目录里的某个脚本”“帮我解释 report.sql 在写什么”时，先读取真实文件内容再分析。",
    params: "filePath, previewCharLimit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_external_sql_file",
        description:
          "读取指定外部 SQL 文件的内容预览，仅用于已配置外部 SQL 目录中的 SQL 文件。返回文件路径、所属目录、绑定连接/数据库、是否已在工作区打开，以及截断后的正文内容。适用于用户提到某个目录中的具体 SQL 脚本、想让 AI 直接解释脚本逻辑、或想确认某个外部 SQL 文件内容时，先读真实文件再回答。",
        parameters: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "必填，要读取的 SQL 文件绝对路径，通常先通过 inspect_external_sql_directories 找到" },
            previewCharLimit: { type: "number", description: "可选，正文预览最多返回多少字符，默认 12000，最大 40000" },
          },
          required: ["filePath"],
        },
      },
    },
  },
  {
    name: "inspect_active_tab",
    icon: "📍",
    desc: "查看当前活动页签上下文",
    detail:
      "返回当前活动页签的类型、连接、数据库、表名，以及当前 SQL / 命令页签里的草稿内容（超长会截断）。适合用户说“看我当前这条 SQL”“优化这个编辑器里的语句”时，先让 AI 直接读取当前工作区上下文。",
    params: "includeContent?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_active_tab",
        description:
          "获取当前活动页签的上下文快照，包括页签类型、连接、数据库、表名，以及当前 SQL / 命令页签里的草稿内容。适用于用户提到当前页签、当前 SQL、当前编辑器、这条语句时，先读取真实界面上下文，避免让模型猜测。",
        parameters: {
          type: "object",
          properties: {
            includeContent: { type: "boolean", description: "可选，是否附带页签中的 SQL / 命令草稿内容，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_workspace_tabs",
    icon: "🗃️",
    desc: "查看当前工作区打开的页签总览",
    detail:
      "返回当前工作区里打开的页签列表、哪个是活动页签，以及每个页签对应的连接、数据库、表名等上下文。适合用户说“我现在开了哪些 SQL”“看看我工作区里有哪些页签”“帮我对比这几个查询页签”时，先读取真实工作区布局再继续分析。",
    params: "limit?(默认 12), includeContent?(默认 false)",
    tool: {
      type: "function",
      function: {
        name: "inspect_workspace_tabs",
        description:
          "获取当前工作区已打开页签的总览，包括活动页签、页签类型、连接、数据库、表名，以及可选的 SQL / 命令草稿内容。适用于用户提到当前工作区、打开了哪些页签、哪几个查询页签、想对比多个编辑器内容时，先读取真实界面状态，避免模型猜测。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "可选，最多返回多少个页签，默认 12，最大 30" },
            includeContent: { type: "boolean", description: "可选，是否附带页签中的 SQL / 命令草稿内容，默认 false" },
          },
        },
      },
    },
  },
  {
    name: "inspect_recent_sql_logs",
    icon: "🧾",
    desc: "查看最近 SQL 执行日志",
    detail:
      "传入可选 limit 和 status，返回最近 SQL 执行记录，包括数据库、耗时、成功/失败、报错、受影响行数和 SQL 文本。适合追查刚执行失败的语句、定位慢查询，并让 AI 基于真实执行历史给出解释或优化建议。",
    params: "limit?, status?(all|success|error)",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_sql_logs",
        description:
          "获取最近 SQL 执行日志摘要，可按成功/失败过滤。适用于回看刚执行过的 SQL、排查失败原因、定位慢查询，以及让 AI 基于真实执行历史给出解释和优化建议。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "可选，返回多少条日志，默认 20，最大 100" },
            status: {
              type: "string",
              description: "可选，按执行状态过滤，支持 all、success、error，默认 all",
              enum: ["all", "success", "error"],
            },
          },
        },
      },
    },
  },
  {
    name: "inspect_recent_sql_activity",
    icon: "📊",
    desc: "总结最近 SQL 活动分布",
    detail:
      "可按 status、activityKind、dbName 和 keyword 过滤，返回最近 SQL 活动的结构化总结，包括读写/DDL 比例、语句类型分布、数据库分布、最近报错、最近写操作和最慢语句。适合用户提到“最近都执行了什么”“是不是刚删过数据”“哪个库最近报错最多”“最近主要在跑查询还是写入”时先读真实执行画像。",
    params: "limit?, status?(all|success|error), activityKind?(all|read|write|ddl|transaction|session|other), dbName?, keyword?",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_sql_activity",
        description:
          "汇总最近 SQL 活动的结构化画像，可按执行状态、活动类型、数据库名和关键词过滤。适用于排查最近主要在执行哪些读写操作、某个库近期错误是否集中、是否发生过删除或 DDL、以及让 AI 基于真实执行现场先做全局判断。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "可选，最近活动样例最多返回多少条，默认 30，最大 100" },
            status: {
              type: "string",
              description: "可选，按执行状态过滤，支持 all、success、error，默认 all",
              enum: ["all", "success", "error"],
            },
            activityKind: {
              type: "string",
              description: "可选，按活动类型过滤，支持 all、read、write、ddl、transaction、session、other，默认 all",
              enum: ["all", "read", "write", "ddl", "transaction", "session", "other"],
            },
            dbName: { type: "string", description: "可选，只看数据库名里包含该关键词的日志" },
            keyword: { type: "string", description: "可选，按 SQL 文本、报错信息、语句类型或数据库名做关键词筛选" },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_editor_transaction",
    icon: "🔁",
    desc: "查看 SQL 编辑器事务提交状态",
    detail:
      "返回 SQL 编辑器 DML 托管事务语义、当前手动/自动提交设置、活动 SQL 页签是否会进入托管事务、待提交事务以及最近写入/事务执行记录。适合用户问“手动/自动提交到底是什么意思”“当前有没有事务没提交”“执行 update/insert/delete 会不会自动提交”时先读真实状态。",
    params: "includeSqlPreview?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_editor_transaction",
        description:
          "读取 SQL 编辑器事务状态快照，包括 DML 始终进入托管事务的真实语义、当前提交模式、自动提交延迟、活动 SQL 页签是否会触发托管事务、待提交事务列表和最近写入/事务日志。适用于用户提到 SQL 编辑器手动提交、自动提交、未提交事务、DML 执行后是否提交或事务语义不清时，先读取真实状态再解释。",
        parameters: {
          type: "object",
          properties: {
            includeSqlPreview: { type: "boolean", description: "可选，是否返回活动 SQL 页签的 SQL 预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_risk",
    icon: "🛑",
    desc: "检查当前或指定 SQL 的执行风险",
    detail:
      "读取传入 SQL 或当前活动查询页签内容，识别多语句、写入、DDL、DELETE/UPDATE 无 WHERE、DROP/TRUNCATE 等风险，并结合当前 AI 安全策略返回是否允许执行。适合用户让 AI 执行、解释风险、确认能不能跑某条 SQL 前先做一次安全体检。",
    params: "sql?(默认读取当前活动查询页签), previewCharLimit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_risk",
        description:
          "检查传入 SQL 或当前活动查询页签 SQL 的执行风险，返回语句数量、活动类型、风险级别、危险点、是否需要用户确认，以及当前 AI 安全策略检查结果。适用于用户要求执行、删除、更新、DDL、批量 SQL、或询问某条 SQL 能不能跑时，先读取这份风险快照再回答或继续执行。",
        parameters: {
          type: "object",
          properties: {
            sql: { type: "string", description: "可选，要检查的 SQL；不传时默认读取当前活动查询页签的 SQL 草稿" },
            previewCharLimit: { type: "number", description: "可选，SQL 预览最多返回多少字符，默认 12000，最大 40000" },
          },
        },
      },
    },
  },
  {
    name: "inspect_app_logs",
    icon: "🪵",
    desc: "查看 GoNavi 应用日志尾部",
    detail:
      "可按关键词过滤，返回最近一段 GoNavi 应用日志里的 INFO/WARN/ERROR 行、级别分布、日志文件路径，以及当前是否发生了日志窗口截断。适合用户提到“gonavi.log”“启动报错”“MCP 拉不起来”“数据库连接为什么失败”时，先读真实日志尾部再继续定位。",
    params: "keyword?, lineLimit?(默认 80)",
    tool: {
      type: "function",
      function: {
        name: "inspect_app_logs",
        description:
          "读取 GoNavi 应用日志尾部，可按关键词过滤，并返回最近日志行、级别分布、日志路径和截断状态。适用于用户提到 gonavi.log、应用启动异常、MCP 启动失败、数据库连接报错或要求“看一下最近日志”时，优先读取真实应用日志，不要只凭界面现象推测。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按日志内容关键词过滤，例如 mcp、mysql、timeout、error" },
            lineLimit: { type: "number", description: "可选，最多返回多少行日志，默认 80，最大 200" },
          },
        },
      },
    },
  },
  {
    name: "inspect_recent_connection_failures",
    icon: "🧯",
    desc: "总结最近数据库连接失败与冷却原因",
    detail:
      "从最近一段 gonavi.log 里提取数据库连接失败、连接验证失败、SSH 隧道异常和连接冷却命中记录，自动归类主要问题类型、最新地址、最新根因和下一步建议。适合用户提到“为什么连接不上”“连接最近失败正在冷却”“验证失败”“SSH 隧道是不是有问题”时，先读这份结构化总结，而不是人工翻整段日志。",
    params: "keyword?, lineLimit?(默认 120)",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_connection_failures",
        description:
          "汇总最近 GoNavi 应用日志中的数据库连接失败、连接验证失败、SSH 隧道失败和冷却命中记录，并返回主要异常类别、最新地址、最新根因与建议动作。适用于用户提到为什么连接不上、最近一直命中连接冷却、服务端验证失败、multiStatements 或参数兼容异常时，优先读取这份结构化连接失败总结，不要直接让模型肉眼翻整段日志。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按连接类型、地址或异常关键词过滤，例如 mysql、ssh、timeout、127.0.0.1" },
            lineLimit: { type: "number", description: "可选，最多分析多少行日志，默认 120，最大 240" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_last_render_error",
    icon: "🧯",
    desc: "查看最近一次 AI 消息渲染异常记录",
    detail:
      "返回最近一次被前端隔离下来的 AI 消息渲染异常，包括是哪条消息、消息内容预览、错误摘要和组件栈摘要。适合用户提到“AI 某条回复空白了”“某个气泡渲染失败”“消息块报错但面板没全挂”时，先读这份真实前端异常快照。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_last_render_error",
        description:
          "读取最近一次 AI 消息渲染异常的本地快照，包括消息 ID、角色、内容预览、错误摘要、组件栈摘要和下一步排查建议。适用于用户提到 AI 消息空白、某条回复渲染失败、气泡局部报错但面板仍然存活时，先读取真实前端异常记录，不要只凭现象猜测。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_saved_queries",
    icon: "💾",
    desc: "查看本地已保存的 SQL 查询",
    detail:
      "可按关键词、连接或数据库过滤，返回保存查询的名称、所属连接、数据库和 SQL 预览。适合用户提到“我之前保存过的查询”“帮我找那条历史 SQL”时先从真实本地收藏里检索。",
    params: "keyword?, connectionId?, dbName?, limit?, includeSql?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_saved_queries",
        description:
          "读取本地已保存的 SQL 查询列表，可按关键词、连接和数据库过滤，并返回每条查询的名称、所属连接、数据库与 SQL 预览。适用于用户想找历史查询、复用旧 SQL、核对保存脚本时，先读取真实本地记录。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按查询名称、SQL 文本、连接名或数据库名做关键词筛选" },
            connectionId: { type: "string", description: "可选，只看某个连接下保存的查询" },
            dbName: { type: "string", description: "可选，只看某个数据库下保存的查询" },
            limit: { type: "number", description: "可选，最多返回多少条，默认 12，最大 50" },
            includeSql: { type: "boolean", description: "可选，是否附带 SQL 预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_sessions",
    icon: "🗂️",
    desc: "查看本地 AI 历史会话清单",
    detail:
      "可按关键词过滤，返回本地 AI 会话标题、更新时间、消息数量、是否是当前会话，以及首条用户提问和最近一条消息预览。适合用户提到“之前那条 AI 对话”“帮我找上次聊过的记录”“最近哪个会话讲过这个问题”时先读真实会话资产。",
    params: "keyword?, limit?, includePreview?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_sessions",
        description:
          "读取本地 AI 历史会话清单，可按关键词过滤，并返回会话标题、更新时间、消息数量、是否是当前活动会话，以及首条用户问题和最近消息预览。适用于用户提到之前的 AI 对话、上次聊过的记录、最近哪个会话讲过某个问题时，先读取真实会话清单再继续定位。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按会话标题、会话 ID、首条用户问题或最近消息内容做关键词筛选" },
            limit: { type: "number", description: "可选，最多返回多少条会话，默认 10，最大 50" },
            includePreview: { type: "boolean", description: "可选，是否附带首条用户问题和最近消息预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_message_flow",
    icon: "🧬",
    desc: "诊断当前 AI 会话消息流",
    detail:
      "读取当前或指定 AI 会话的最近消息流，统计用户/助手/tool 消息、工具调用是否都有结果、是否出现连续 assistant 气泡、空 assistant 占位或未清理 loading。适合用户反馈“AI 回复被拆成多个气泡”“工具调用后没继续回答”“消息流看着不对”时先看真实消息结构。",
    params: "sessionId?(默认当前会话), limit?(默认 24), includeContent?(默认 true), previewLimit?(默认 180)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_message_flow",
        description:
          "读取当前或指定 AI 会话的最近消息流诊断，包括消息角色序列、assistant/tool 消息数量、工具调用与 tool 结果匹配情况、连续 assistant 消息、空 assistant 消息和 loading 残留。适用于用户提到 AI 回复被拆成多个气泡、流式追加异常、工具调用没有闭环、某轮回答没有继续生成时，先读取真实消息结构再定位。",
        parameters: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "可选，指定要诊断的 AI 会话 ID；不传时读取当前活动会话" },
            limit: { type: "number", description: "可选，最多返回最近多少条消息，默认 24，最大 80" },
            includeContent: { type: "boolean", description: "可选，是否附带消息内容预览，默认 true" },
            previewLimit: { type: "number", description: "可选，每条消息预览字符数，默认 180，最大 1000" },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_snippets",
    icon: "🧩",
    desc: "查看 SQL 片段模板",
    detail:
      "返回本地 SQL 片段的 prefix、名称、说明和模板预览，可按关键词过滤。适合用户想找现成模板、补全片段、团队约定 SQL 模板时先读取真实片段库。",
    params: "keyword?, limit?, includeBody?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_snippets",
        description:
          "读取本地 SQL 片段模板列表，可按关键词过滤，并返回 prefix、名称、说明和模板预览。适用于用户想找 snippet、复用模板、核对 SQL 片段配置时，先读取真实本地片段库。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按 prefix、名称、描述或模板内容做关键词筛选" },
            limit: { type: "number", description: "可选，最多返回多少条，默认 20，最大 80" },
            includeBody: { type: "boolean", description: "可选，是否附带模板内容预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_shortcuts",
    icon: "⌨️",
    desc: "查看当前快捷键配置与平台差异",
    detail:
      "返回当前快捷键动作、当前平台绑定、Win/Mac 双平台组合键、是否被用户改过，以及默认值对照。适合用户问“当前这个快捷键是什么”“Win 和 Mac 分别怎么按”“我是不是改过默认快捷键”时先读真实配置。",
    params: "action?, keyword?, includeDisabled?(默认 true), includeAllPlatforms?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_shortcuts",
        description:
          "读取当前 GoNavi 快捷键配置快照，可按动作名或关键词过滤，并返回当前平台绑定、Win/Mac 双平台组合键、默认值和是否被用户改过。适用于用户提到快捷键、Win/Mac 键位差异、当前结果区/AI/查询相关快捷键是什么时，先读取真实配置，不要凭记忆回答默认值。",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", description: "可选，按动作 key 精确过滤，例如 toggleQueryResultsPanel、sendAIChatMessage、toggleAIPanel" },
            keyword: { type: "string", description: "可选，按动作名、说明、作用域、组合键或默认值做关键词筛选" },
            includeDisabled: { type: "boolean", description: "可选，是否包含当前被禁用的快捷键，默认 true" },
            includeAllPlatforms: { type: "boolean", description: "可选，是否同时返回 Windows 和 macOS 两个平台绑定，默认 true" },
          },
        },
      },
    },
  },
];
