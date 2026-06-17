package db

import (
	"database/sql"
	"fmt"

	"GoNavi-Wails/internal/connection"
)

func scanRows(rows *sql.Rows) ([]map[string]interface{}, []string, error) {
	return scanRowsForDialect(rows, "")
}

func streamRows(rows *sql.Rows, consumer QueryStreamConsumer) error {
	return streamRowsForDialect(rows, "", consumer)
}

type queryRowScanner struct {
	columns     []string
	dbTypeNames []string
	dialect     string
	values      []interface{}
	normalized  []interface{}
	valuePtrs   []interface{}
}

func scanRowsForDialect(rows *sql.Rows, dialect string) ([]map[string]interface{}, []string, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, nil, err
	}
	columns = ensureUniqueQueryColumnNames(columns)

	colTypes, err := rows.ColumnTypes()
	if err != nil || len(colTypes) != len(columns) {
		colTypes = nil
	}

	scanner := newQueryRowScanner(columns, colTypes, dialect)
	resultData := make([]map[string]interface{}, 0)

	for rows.Next() {
		entry, err := scanner.scanCurrentRow(rows)
		if err != nil {
			continue
		}
		resultData = append(resultData, entry)
	}

	if err := rows.Err(); err != nil {
		return resultData, columns, err
	}
	return resultData, columns, nil
}

func streamRowsForDialect(rows *sql.Rows, dialect string, consumer QueryStreamConsumer) error {
	if consumer == nil {
		return fmt.Errorf("query stream consumer required")
	}

	columns, err := rows.Columns()
	if err != nil {
		return err
	}
	columns = ensureUniqueQueryColumnNames(columns)

	colTypes, err := rows.ColumnTypes()
	if err != nil || len(colTypes) != len(columns) {
		colTypes = nil
	}

	scanner := newQueryRowScanner(columns, colTypes, dialect)
	if err := consumer.SetColumns(columns); err != nil {
		return err
	}
	valueConsumer, useValueConsumer := consumer.(QueryStreamValueConsumer)

	for rows.Next() {
		if useValueConsumer {
			values, err := scanner.scanCurrentRowValues(rows)
			if err != nil {
				continue
			}
			if err := valueConsumer.ConsumeRowValues(values); err != nil {
				return err
			}
			continue
		}
		entry, err := scanner.scanCurrentRow(rows)
		if err != nil {
			continue
		}
		if err := consumer.ConsumeRow(entry); err != nil {
			return err
		}
	}

	return rows.Err()
}

func newQueryRowScanner(columns []string, colTypes []*sql.ColumnType, dialect string) *queryRowScanner {
	values := make([]interface{}, len(columns))
	valuePtrs := make([]interface{}, len(columns))
	for i := range columns {
		valuePtrs[i] = &values[i]
	}
	dbTypeNames := make([]string, len(columns))
	for i := range columns {
		if colTypes != nil && i < len(colTypes) && colTypes[i] != nil {
			dbTypeNames[i] = colTypes[i].DatabaseTypeName()
		}
	}
	return &queryRowScanner{
		columns:     columns,
		dbTypeNames: dbTypeNames,
		dialect:     dialect,
		values:      values,
		normalized:  make([]interface{}, len(columns)),
		valuePtrs:   valuePtrs,
	}
}

func (s *queryRowScanner) scanCurrentRowValues(rows *sql.Rows) ([]interface{}, error) {
	if err := rows.Scan(s.valuePtrs...); err != nil {
		return nil, err
	}
	for i := range s.columns {
		s.normalized[i] = normalizeQueryValueWithDBTypeAndDialect(s.values[i], s.dbTypeNames[i], s.dialect)
	}
	return s.normalized, nil
}

func (s *queryRowScanner) scanCurrentRow(rows *sql.Rows) (map[string]interface{}, error) {
	normalized, err := s.scanCurrentRowValues(rows)
	if err != nil {
		return nil, err
	}
	entry := make(map[string]interface{}, len(s.columns))
	for i, col := range s.columns {
		entry[col] = normalized[i]
	}
	return entry, nil
}

func ensureUniqueQueryColumnNames(columns []string) []string {
	if len(columns) == 0 {
		return columns
	}

	uniqueColumns := make([]string, len(columns))
	taken := make(map[string]struct{}, len(columns))
	nextSuffix := make(map[string]int, len(columns))

	for idx, column := range columns {
		base := column
		if base == "" {
			base = fmt.Sprintf("column_%d", idx+1)
		}

		candidate := base
		if _, exists := taken[candidate]; exists {
			suffix := nextSuffix[base]
			if suffix < 2 {
				suffix = 2
			}
			for {
				candidate = fmt.Sprintf("%s_%d", base, suffix)
				if _, exists := taken[candidate]; !exists {
					break
				}
				suffix++
			}
			nextSuffix[base] = suffix + 1
		} else {
			nextSuffix[base] = 2
		}

		uniqueColumns[idx] = candidate
		taken[candidate] = struct{}{}
	}

	return uniqueColumns
}

// scanMultiRows 遍历 sql.Rows 中的所有结果集，将每个结果集作为 ResultSetData 返回。
// 利用 rows.NextResultSet() 支持一次 query 返回多个结果集的场景。
func scanMultiRows(rows *sql.Rows) ([]connection.ResultSetData, error) {
	return scanMultiRowsForDialect(rows, "")
}

func scanMultiRowsForDialect(rows *sql.Rows, dialect string) ([]connection.ResultSetData, error) {
	var results []connection.ResultSetData
	for {
		data, cols, err := scanRowsForDialect(rows, dialect)
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
