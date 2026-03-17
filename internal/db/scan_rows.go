package db

import (
	"database/sql"

	"GoNavi-Wails/internal/connection"
)

func scanRows(rows *sql.Rows) ([]map[string]interface{}, []string, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, nil, err
	}

	colTypes, err := rows.ColumnTypes()
	if err != nil || len(colTypes) != len(columns) {
		colTypes = nil
	}

	resultData := make([]map[string]interface{}, 0)

	for rows.Next() {
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range columns {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			continue
		}

		entry := make(map[string]interface{}, len(columns))
		for i, col := range columns {
			dbTypeName := ""
			if colTypes != nil && i < len(colTypes) && colTypes[i] != nil {
				dbTypeName = colTypes[i].DatabaseTypeName()
			}
			entry[col] = normalizeQueryValueWithDBType(values[i], dbTypeName)
		}
		resultData = append(resultData, entry)
	}

	if err := rows.Err(); err != nil {
		return resultData, columns, err
	}
	return resultData, columns, nil
}

// scanMultiRows 遍历 sql.Rows 中的所有结果集，将每个结果集作为 ResultSetData 返回。
// 利用 rows.NextResultSet() 支持一次 query 返回多个结果集的场景。
func scanMultiRows(rows *sql.Rows) ([]connection.ResultSetData, error) {
	var results []connection.ResultSetData
	for {
		data, cols, err := scanRows(rows)
		if err != nil {
			return results, err
		}
		if data == nil {
			data = make([]map[string]interface{}, 0)
		}
		if cols == nil {
			cols = []string{}
		}
		results = append(results, connection.ResultSetData{
			Rows:    data,
			Columns: cols,
		})
		if !rows.NextResultSet() {
			break
		}
	}
	if len(results) == 0 {
		results = []connection.ResultSetData{{
			Rows:    make([]map[string]interface{}, 0),
			Columns: []string{},
		}}
	}
	if err := rows.Err(); err != nil {
		return results, err
	}
	return results, nil
}
