package db

import "strings"

// duckDBDSNAllowUnsignedExtensions 在打开 DuckDB 时允许加载本地编译的未签名扩展。
// 官方扩展仓库不覆盖 windows_amd64_mingw 等平台，mysql_scanner 等扩展依赖该开关。
func duckDBDSNAllowUnsignedExtensions(dsn string) string {
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	return dsn + sep + "allow_unsigned_extensions=true"
}
