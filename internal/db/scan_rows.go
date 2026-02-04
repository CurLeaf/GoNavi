package db

import "database/sql"

func scanRows(rows *sql.Rows) ([]map[string]interface{}, []string, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, nil, err
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
			entry[col] = normalizeQueryValue(values[i])
		}
		resultData = append(resultData, entry)
	}

	if err := rows.Err(); err != nil {
		return resultData, columns, err
	}
	return resultData, columns, nil
}

