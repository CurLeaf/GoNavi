package mcpserver

import (
	"runtime/debug"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func NewServer(backend Backend) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "gonavi-ai",
		Version: implementationVersion(),
	}, nil)

	service := NewService(backend)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_connections",
		Description: "列出当前 GoNavi 已保存的数据库连接，先调用它获取 connectionId。不会返回明文密码等敏感信息。",
	}, service.GetConnections)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_databases",
		Description: "根据 connectionId 获取数据库/Schema 列表。",
	}, service.GetDatabases)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_tables",
		Description: "根据 connectionId 和可选 dbName 获取表列表。dbName 为空时优先使用保存连接里的默认数据库。",
	}, service.GetTables)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_columns",
		Description: "根据 connectionId、可选 dbName、tableName 获取字段定义。",
	}, service.GetColumns)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_indexes",
		Description: "根据 connectionId、可选 dbName、tableName 获取索引定义。",
	}, service.GetIndexes)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_foreign_keys",
		Description: "根据 connectionId、可选 dbName、tableName 获取外键关系。",
	}, service.GetForeignKeys)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_triggers",
		Description: "根据 connectionId、可选 dbName、tableName 获取触发器定义。",
	}, service.GetTriggers)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_table_ddl",
		Description: "根据 connectionId、可选 dbName、tableName 获取建表或建视图语句。",
	}, service.GetTableDDL)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "execute_sql",
		Description: "执行 SQL，支持多语句结果集。执行范围受 GoNavi AI 设置中的安全控制约束；命中允许范围内的 DML/DDL 等非只读语句时，仍必须显式传 allowMutating=true。",
	}, service.ExecuteSQL)

	return server
}

func implementationVersion() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		version := strings.TrimSpace(info.Main.Version)
		if version != "" && version != "(devel)" {
			return version
		}
	}
	return "dev"
}
