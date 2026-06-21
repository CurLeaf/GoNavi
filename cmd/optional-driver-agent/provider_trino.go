//go:build gonavi_trino_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "trino"
	agentDatabaseFactory = func() db.Database {
		return &db.TrinoDB{}
	}
}
