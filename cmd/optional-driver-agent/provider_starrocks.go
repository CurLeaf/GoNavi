//go:build gonavi_starrocks_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "starrocks"
	agentDatabaseFactory = func() db.Database {
		return &db.StarRocksDB{}
	}
}
