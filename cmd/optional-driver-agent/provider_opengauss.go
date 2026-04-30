//go:build gonavi_opengauss_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "opengauss"
	agentDatabaseFactory = func() db.Database {
		return &db.OpenGaussDB{}
	}
}
