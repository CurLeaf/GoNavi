package db

import (
	"database/sql"
	"strings"
	"time"
)

const (
	defaultSQLMaxOpenConns    = 4
	defaultSQLMaxIdleConns    = 1
	defaultSQLConnMaxLifetime = 30 * time.Minute
	defaultSQLConnMaxIdleTime = 30 * time.Second
)

func configureSQLConnectionPool(db *sql.DB, dbType string) {
	if db == nil {
		return
	}
	switch strings.ToLower(strings.TrimSpace(dbType)) {
	case "sqlite", "duckdb":
		return
	case "oracle", "oceanbase":
		db.SetMaxOpenConns(defaultSQLMaxOpenConns)
		db.SetMaxIdleConns(defaultSQLMaxIdleConns)
		db.SetConnMaxIdleTime(defaultSQLConnMaxIdleTime)
		db.SetConnMaxLifetime(defaultSQLConnMaxLifetime)
		return
	case "sqlserver":
		db.SetMaxOpenConns(defaultSQLMaxOpenConns)
		db.SetMaxIdleConns(defaultSQLMaxIdleConns)
		db.SetConnMaxIdleTime(defaultSQLConnMaxIdleTime)
		db.SetConnMaxLifetime(defaultSQLConnMaxLifetime)
		return
	}
	db.SetMaxOpenConns(defaultSQLMaxOpenConns)
	db.SetMaxIdleConns(0)
	db.SetConnMaxIdleTime(defaultSQLConnMaxIdleTime)
	db.SetConnMaxLifetime(defaultSQLConnMaxLifetime)
}
