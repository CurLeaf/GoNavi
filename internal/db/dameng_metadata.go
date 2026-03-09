package db

import (
	"fmt"
	"sort"
	"strings"
)

var damengDatabaseQueries = []string{
	"SELECT SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') AS DATABASE_NAME FROM DUAL",
	"SELECT SYS_CONTEXT('USERENV', 'CURRENT_USER') AS DATABASE_NAME FROM DUAL",
	"SELECT USERNAME AS DATABASE_NAME FROM USER_USERS",
	"SELECT USERNAME AS DATABASE_NAME FROM ALL_USERS ORDER BY USERNAME",
	"SELECT USERNAME AS DATABASE_NAME FROM DBA_USERS ORDER BY USERNAME",
	"SELECT USERNAME AS DATABASE_NAME FROM SYS.DBA_USERS ORDER BY USERNAME",
	"SELECT DISTINCT OWNER AS DATABASE_NAME FROM ALL_OBJECTS ORDER BY OWNER",
	"SELECT DISTINCT OWNER AS DATABASE_NAME FROM ALL_TABLES ORDER BY OWNER",
}

type damengQueryFunc func(query string) ([]map[string]interface{}, []string, error)

func collectDamengDatabaseNames(query damengQueryFunc) ([]string, error) {
	seen := make(map[string]struct{})
	dbs := make([]string, 0, 64)
	var lastErr error

	for _, q := range damengDatabaseQueries {
		data, _, err := query(q)
		if err != nil {
			lastErr = err
			continue
		}
		for _, row := range data {
			name := getDamengRowString(row,
				"DATABASE_NAME",
				"USERNAME",
				"OWNER",
				"SCHEMA_NAME",
				"CURRENT_SCHEMA",
				"CURRENT_USER",
			)
			if name == "" {
				for _, v := range row {
					text := strings.TrimSpace(fmt.Sprintf("%v", v))
					if text == "" || strings.EqualFold(text, "<nil>") {
						continue
					}
					name = text
					break
				}
			}
			if name == "" {
				continue
			}
			key := strings.ToUpper(name)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			dbs = append(dbs, name)
		}
	}

	if len(dbs) == 0 && lastErr != nil {
		return nil, lastErr
	}

	sort.Slice(dbs, func(i, j int) bool {
		return strings.ToUpper(dbs[i]) < strings.ToUpper(dbs[j])
	})
	return dbs, nil
}

func getDamengRowString(row map[string]interface{}, keys ...string) string {
	if len(row) == 0 {
		return ""
	}
	for _, key := range keys {
		for k, v := range row {
			if !strings.EqualFold(strings.TrimSpace(k), strings.TrimSpace(key)) {
				continue
			}
			text := strings.TrimSpace(fmt.Sprintf("%v", v))
			if text == "" || strings.EqualFold(text, "<nil>") {
				return ""
			}
			return text
		}
	}
	return ""
}
