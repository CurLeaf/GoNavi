//go:build gonavi_gaussdb_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "gaussdb"
	agentDatabaseFactory = func() db.Database {
		return &db.GaussDB{}
	}
}
