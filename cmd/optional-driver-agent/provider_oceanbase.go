//go:build gonavi_oceanbase_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "oceanbase"
	agentDatabaseFactory = func() db.Database {
		return &db.OceanBaseDB{}
	}
}
