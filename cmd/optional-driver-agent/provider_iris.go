//go:build gonavi_iris_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "iris"
	agentDatabaseFactory = func() db.Database {
		return &db.IrisDB{}
	}
}
