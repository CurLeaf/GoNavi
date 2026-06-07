# AI 扩展能力路线

当前 GoNavi 的 AI 链路是：

1. 前端 `AIChatPanel` 组装 system messages。
2. 前端声明本地固定工具 `LOCAL_TOOLS`。
3. 后端 `aiservice.Service` 只负责 Provider 配置、安全级别与模型转发。

这套结构已经足够承接“用户级提示词”，但要继续承接 MCP 和 Skills，需要先把“提示词 / 工具 / 技能”三层职责拆开。

## 1. 用户级自定义提示词

已落地的方向：

- 配置存储在 `ai_config.json` 的 `userPromptSettings`。
- 由 `AISettingsModal` 提供编辑入口。
- 由 `AIChatPanel` 在运行时追加为 system message。

建议长期保持 4 个层级：

- `global`: 所有 AI 会话统一追加。
- `database`: 数据库 / SQL 场景追加。
- `jvm`: JVM 资源浏览与分析场景追加。
- `jvmDiagnostic`: JVM 诊断命令规划场景追加。

这样既能满足“个人习惯”定制，也不会把所有场景揉成一条超长总提示词。

## 2. MCP 能力开放

目标不是把 MCP 做成新的聊天面板，而是把它变成“外部工具源”。

建议后续拆成三层：

1. `tool registry`
   - 统一收口内置工具、本地扩展工具、MCP 工具。
   - 对模型只暴露统一的 `tools[]`。
2. `mcp server config`
   - 保存 server 名称、transport、启动命令或 URL、超时、启用状态。
   - 由后端维护生命周期与连通性。
3. `mcp runtime bridge`
   - 负责 `list tools / call tool / errors / timeout / auth`。

### MCP 是否需要单独 GitHub 仓库

不需要把“GoNavi 对 MCP 的支持”单独拆仓库。

更合理的边界是：

- `GoNavi 主仓库`
  - 维护 MCP client、配置、UI、工具注册和运行时桥接。
- `单独仓库（可选）`
  - 只在你要发布一个可复用的 MCP Server 时才有价值。
  - 例如 `gonavi-mcp-sql-tools`、`gonavi-mcp-jvm-agent` 这类独立 server。

结论：

- “客户端支持 MCP” 不需要新仓库。
- “某个独立 MCP Server” 是否拆仓库，取决于它要不要单独发布、复用或部署。

## 3. Skills 设计

Skills 不建议直接等同于“另一种提示词”。

更合适的定义是：

- `skill manifest`
  - 名称、说明、适用场景、是否默认启用。
- `skill prompt`
  - 该技能追加的 system prompt / few-shot / 输出约束。
- `skill tool requirements`
  - 该技能依赖哪些内置工具或 MCP 工具。
- `skill shortcuts`
  - 可选地给欢迎卡片、斜杠命令或快速动作提供入口。

一个 Skill 本质上应该是“提示词 + 工具依赖 + 使用入口”的组合，而不是单独一段文案。

### Skills 是否需要单独 GitHub 仓库

第一阶段不需要。

建议顺序：

1. 先在 GoNavi 主仓库内把 Skills manifest/runtime 跑通。
2. 等格式稳定后，再考虑增加“本地目录导入”或“Git 仓库导入”。

只有当你明确要做下面两件事时，独立仓库才值得：

- 把 Skills 当作社区共享资产分发。
- 让不同团队独立维护自己的 skill pack。

## 建议的下一步实现顺序

1. 抽出统一 `ToolRegistry`，让 `LOCAL_TOOLS` 不再硬编码在聊天面板内部。
2. 在 AI 设置中新增 `MCP Servers` 配置页。
3. 后端先支持最小 transport：
   - `stdio`
   - `http/sse`（如果后续确认需要）
4. 在 AI 设置中新增 `Skills` 配置页。
5. 让 Skill 以 manifest 形式声明：
   - `id`
   - `name`
   - `description`
   - `systemPrompt`
   - `requiredTools`
   - `scopes`
6. 再决定是否增加“从 Git 仓库同步 MCP/Skills 包”的分发能力。
