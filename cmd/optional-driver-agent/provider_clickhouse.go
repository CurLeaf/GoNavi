//go:build gonavi_clickhouse_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "clickhouse"
	agentDatabaseFactory = func() db.Database {
		return &db.ClickHouseDB{}
	}
}
