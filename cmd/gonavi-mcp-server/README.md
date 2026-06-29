# GoNavi MCP Server

`gonavi-mcp-server` 会把 GoNavi 已保存连接背后的数据库能力通过 MCP 暴露给外部客户端。本机客户端默认使用 `stdio`；云端 Agent 可使用显式开启的 Streamable HTTP 模式。

## 当前提供的 tools

- `get_connections`
  - 返回 GoNavi 已保存连接的 `id/name/type/target/defaultDatabase` 等摘要信息
- `get_databases`
  - 入参：`connectionId`
- `get_tables`
  - 入参：`connectionId`、可选 `dbName`
  - 返回表列表，并在 `views` 字段附带视图列表，兼容旧客户端只调用 `get_tables` 的场景
- `get_views`
  - 入参：`connectionId`、可选 `dbName`
  - 返回视图列表
- `get_objects`
  - 入参：`connectionId`、可选 `dbName`、可选 `objectTypes`
  - 返回表、视图、触发器、函数、过程、序列、包、事件，以及消息队列类 `topic/queue/exchange` 等对象清单
- `get_columns`
  - 入参：`connectionId`、可选 `dbName`、`tableName`
- `get_table_ddl`
  - 入参：`connectionId`、可选 `dbName`、`tableName`
- `execute_sql`
  - 入参：`connectionId`、可选 `dbName`、`sql`
  - 默认只允许只读 SQL
  - 如果 SQL 包含 DDL/DML，必须显式传 `allowMutating=true`
  - `maxRowsPerResult` 用来限制单个结果集返回的行数，默认 `200`

远程 Agent 只需要结构元数据时，启动 HTTP 模式请加 `--schema-only`。该模式不注册 `execute_sql`，只保留连接摘要、对象清单、表/视图、字段、索引、外键、触发器和 DDL 工具。

## 运行方式

开发态直接运行：

```powershell
go run ./cmd/gonavi-mcp-server
```

显式运行本机 `stdio`：

```powershell
go run ./cmd/gonavi-mcp-server stdio
```

也可以先编译：

```powershell
go build -o .\bin\gonavi-mcp-server.exe .\cmd\gonavi-mcp-server
```

远程 Agent 使用 Streamable HTTP 时必须设置 bearer token：

```powershell
$env:GONAVI_MCP_HTTP_TOKEN = "<随机token>"
go run ./cmd/gonavi-mcp-server http --addr 127.0.0.1:8765 --path /mcp --schema-only
```

安装包主程序也支持同样模式：

```powershell
& "C:\Program Files\GoNavi\GoNavi.exe" mcp-server http --addr 127.0.0.1:8765 --path /mcp --token "<随机token>" --schema-only
```

默认建议只监听 `127.0.0.1`，再通过 SSH 隧道、反向代理或内网网关暴露给云端 Agent。不要在没有 TLS、防火墙和鉴权的情况下直接监听公网地址。

无图形界面或需要把配置交给云端 Agent 时，可直接生成 OpenClaw / Hermans 等远程 MCP 配置：

```powershell
& "C:\Program Files\GoNavi\GoNavi.exe" mcp-server remote-config --client openclaw --url "https://<你的域名或隧道地址>/mcp" --token "<随机token>" --schema-only
```

独立 server 开发态也支持同样能力：

```powershell
go run ./cmd/gonavi-mcp-server remote-config --client hermans --url "https://<你的域名或隧道地址>/mcp" --token "<随机token>" --schema-only
```

## Claude Code / Codex / OpenClaw / Hermans

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

OpenClaw、Hermans 这类部署在云端或远端 Linux 的 Agent，不能直接使用 Windows 本机的 `stdio` 命令。GoNavi 的连接信息和数据库密码仍应留在 Windows 本机，由 GoNavi MCP 读取保存连接和系统凭据；远端 Agent 只拿到 MCP tools 和 `connectionId`。

推荐接入形态：

1. Windows 本机运行 GoNavi，并保持能访问已保存的数据库连接。
2. 在 Windows 本机启动 `GoNavi.exe mcp-server http --addr 127.0.0.1:8765 --path /mcp --token <随机token> --schema-only`。
3. 通过 SSH 隧道、反向代理或内网网关把 `http://127.0.0.1:8765/mcp` 暴露为云端 Agent 可访问的 HTTPS 地址。
4. 在 OpenClaw / Hermans 中添加远程 MCP Server，transport 选择 Streamable HTTP，URL 指向 `/mcp` 地址，并设置请求头 `Authorization: Bearer <随机token>`。
5. 先调用 `get_connections` 获取 `connectionId`，再调用 `get_databases`、`get_objects`、`get_tables`、`get_views`、`get_columns`、`get_table_ddl` 等工具读取结构。

如果目标 Agent 支持 `mcpServers` JSON，可按下面的通用片段配置：

```json
{
  "mcpServers": {
    "gonavi": {
      "type": "streamable-http",
      "url": "https://<你的域名或隧道地址>/mcp",
      "headers": {
        "Authorization": "Bearer <随机token>"
      }
    }
  }
}
```

不要把数据库 `host/user/password` 写入云端 Agent 的配置文件。默认 `--schema-only` 不暴露 `execute_sql`；如果你明确需要远程执行 SQL，可以去掉该参数，此时 `execute_sql` 仍受 GoNavi AI 安全设置控制，写操作必须显式传 `allowMutating=true`。

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
