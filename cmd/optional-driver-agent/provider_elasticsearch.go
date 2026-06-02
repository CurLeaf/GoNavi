//go:build gonavi_elasticsearch_driver

package main

import "GoNavi-Wails/internal/db"

func init() {
	agentDriverType = "elasticsearch"
	agentDatabaseFactory = func() db.Database {
		return &db.ElasticsearchDB{}
	}
}
