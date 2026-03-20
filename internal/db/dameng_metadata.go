package db

import (
	"fmt"
	"sort"
	"strings"

	"GoNavi-Wails/internal/logger"
)

var damengDatabaseQueries = []string{
	// 优先使用达梦原生系统表
	"SELECT DISTINCT OBJECT_NAME AS DATABASE_NAME FROM SYS.SYSOBJECTS WHERE TYPE$ = 'SCH' AND OBJECT_NAME NOT IN ('SYS','SYSDBA','SYSAUDITOR','SYSSSO','CTISYS','__RECYCLE_USER__') ORDER BY OBJECT_NAME",
	"SELECT SCHEMA_NAME AS DATABASE_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('SYS','SYSDBA','SYSAUDITOR','SYSSSO','CTISYS','INFORMATION_SCHEMA') ORDER BY SCHEMA_NAME",
	// Oracle 兼容层
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

	for idx, q := range damengDatabaseQueries {
		data, _, err := query(q)
		if err != nil {
			logger.Warnf("达梦 GetDatabases 查询[%d]失败：%v（SQL: %.80s…）", idx, err, q)
			lastErr = err
			continue
		}
		newCount := 0
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
			newCount++
		}
		logger.Infof("达梦 GetDatabases 查询[%d]成功：返回 %d 行，新增 %d 条（SQL: %.80s…）", idx, len(data), newCount, q)
	}

	logger.Infof("达梦 GetDatabases 最终结果：共 %d 条数据库/schema", len(dbs))
	if len(dbs) == 0 && lastErr != nil {
		logger.Warnf("达梦 GetDatabases 所有查询均失败，返回最后错误：%v", lastErr)
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
