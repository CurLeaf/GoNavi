//go:build gonavi_iotdb_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "iotdb"
	agentDatabaseFactory = func() db.Database {
		return &db.IoTDBDB{}
	}
}
