# GoNavi MCP Server

`gonavi-mcp-server` 会把 GoNavi 已保存连接背后的数据库能力通过 MCP `stdio` 暴露给外部客户端。

## 当前提供的 tools

- `get_connections`
  - 返回 GoNavi 已保存连接的 `id/name/type/target/defaultDatabase` 等摘要信息
- `get_databases`
  - 入参：`connectionId`
- `get_tables`
  - 入参：`connectionId`、可选 `dbName`
- `get_columns`
  - 入参：`connectionId`、可选 `dbName`、`tableName`
- `get_table_ddl`
  - 入参：`connectionId`、可选 `dbName`、`tableName`
- `execute_sql`
  - 入参：`connectionId`、可选 `dbName`、`sql`
  - 默认只允许只读 SQL
  - 如果 SQL 包含 DDL/DML，必须显式传 `allowMutating=true`
  - `maxRowsPerResult` 用来限制单个结果集返回的行数，默认 `200`

## 运行方式

开发态直接运行：

```powershell
go run ./cmd/gonavi-mcp-server
```

也可以先编译：

```powershell
go build -o .\bin\gonavi-mcp-server.exe .\cmd\gonavi-mcp-server
```

## Claude Code / Codex

正式安装包场景，推荐直接在 GoNavi 里使用“AI 设置 -> MCP 服务 -> 安装到 Claude Code / 安装到 Codex”。

它会自动把当前安装的 `GoNavi.exe` 写入 Claude Code 的用户级 `~/.claude.json`，命令形态类似：

```json
{
  "mcpServers": {
    "gonavi": {
      "type": "stdio",
      "command": "C:\\Program Files\\GoNavi\\GoNavi.exe",
      "args": ["mcp-server"],
      "env": {}
    }
  }
}
```

这样用户不需要自己找本机 `gonavi-mcp-server.exe` 路径，安装包本体就能直接作为 MCP 入口。

Codex 当前使用 `~/.codex/config.toml`，GoNavi 会写入类似下面这段：

```toml
[mcp_servers.gonavi]
command = 'C:\Program Files\GoNavi\GoNavi.exe'
args = ['mcp-server']
startup_timeout_sec = 60
```

仓库开发态如果要在本机 `Claude Code CLI` 里稳定使用这个 MCP，仍然推荐走仓库内包装脚本：

```powershell
.\tools\claude-gonavi-mcp.ps1 -p "必须调用 gonavi MCP 的 get_connections 工具"
```

或者：

```cmd
tools\claude-gonavi-mcp.cmd -p "必须调用 gonavi MCP 的 get_connections 工具"
```

这个脚本会先构建 `bin\gonavi-mcp-server.exe`，再通过 `--mcp-config` 和 `--strict-mcp-config` 把 GoNavi MCP 单独注入当前 Claude 会话，避免默认混合 MCP 加载时序导致的首轮工具未挂载问题。

## MCP 客户端配置示例

开发态：

```json
{
  "mcpServers": {
    "gonavi": {
      "command": "go",
      "args": ["run", "./cmd/gonavi-mcp-server"]
    }
  }
}
```

Windows 独立 server 编译产物（开发态）：

```json
{
  "mcpServers": {
    "gonavi": {
      "command": "D:\\Work\\CodeRepos\\GoNavi\\bin\\gonavi-mcp-server.exe",
      "args": []
    }
  }
}
```

Windows 已安装 GoNavi（推荐给最终用户）：

```json
{
  "mcpServers": {
    "gonavi": {
      "type": "stdio",
      "command": "C:\\Program Files\\GoNavi\\GoNavi.exe",
      "args": ["mcp-server"],
      "env": {}
    }
  }
}
```

## 使用说明

- 先调用 `get_connections`，拿到 `connectionId`
- 之后所有数据库工具都只传 `connectionId`，由 GoNavi 服务端内部解析保存连接和密钥
- 如果 `dbName` 为空，会优先使用该保存连接里的默认数据库
- Server 会读取 GoNavi 当前活动数据目录里的连接配置，并通过系统 keyring/凭据管理器解析密文
- 如果本机凭据存储不可用，依赖密钥的连接会返回对应错误
