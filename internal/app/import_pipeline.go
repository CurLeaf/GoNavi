package app

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"github.com/xuri/excelize/v2"
)

const (
	defaultImportPreviewLimit   = 5
	defaultImportApplyBatchSize = 1000
)

type importFileConsumer interface {
	SetColumns(columns []string) error
	ConsumeRow(row map[string]interface{}) error
}

type importPreviewData struct {
	Columns     []string
	TotalRows   int
	PreviewRows []map[string]interface{}
}

type importProgressState struct {
	Current        int  `json:"current"`
	Total          int  `json:"total,omitempty"`
	Success        int  `json:"success"`
	Errors         int  `json:"errors"`
	TotalRowsKnown bool `json:"totalRowsKnown,omitempty"`
}

type importExecutionResult struct {
	Success   int
	Failed    int
	Total     int
	ErrorLogs []string
}

type importPreviewCollector struct {
	columns      []string
	totalRows    int
	previewRows  []map[string]interface{}
	previewLimit int
}

func newImportPreviewCollector(limit int) *importPreviewCollector {
	if limit <= 0 {
		limit = defaultImportPreviewLimit
	}
	return &importPreviewCollector{previewLimit: limit}
}

func (c *importPreviewCollector) SetColumns(columns []string) error {
	c.columns = append([]string(nil), columns...)
	return nil
}

func (c *importPreviewCollector) ConsumeRow(row map[string]interface{}) error {
	c.totalRows++
	if len(c.previewRows) < c.previewLimit {
		c.previewRows = append(c.previewRows, cloneImportRow(row))
	}
	return nil
}

func (c *importPreviewCollector) Result() importPreviewData {
	return importPreviewData{
		Columns:     append([]string(nil), c.columns...),
		TotalRows:   c.totalRows,
		PreviewRows: cloneImportRows(c.previewRows),
	}
}

type importCollectConsumer struct {
	columns []string
	rows    []map[string]interface{}
}

func (c *importCollectConsumer) SetColumns(columns []string) error {
	c.columns = append([]string(nil), columns...)
	return nil
}

func (c *importCollectConsumer) ConsumeRow(row map[string]interface{}) error {
	c.rows = append(c.rows, cloneImportRow(row))
	return nil
}

type importRowWriter interface {
	SetColumns(columns []string)
	ApplyBatch(rows []map[string]interface{}) error
	ApplyOne(row map[string]interface{}) error
	BatchEnabled() bool
}

type importDatabaseRowWriter struct {
	dbInst        db.Database
	applier       db.BatchApplier
	dbType        string
	tableName     string
	columns       []string
	columnTypeMap map[string]string
}

func newImportDatabaseRowWriter(dbInst db.Database, dbType, tableName string, columnTypeMap map[string]string) *importDatabaseRowWriter {
	writer := &importDatabaseRowWriter{
		dbInst:        dbInst,
		dbType:        dbType,
		tableName:     tableName,
		columnTypeMap: columnTypeMap,
	}
	if applier, ok := dbInst.(db.BatchApplier); ok {
		writer.applier = applier
	}
	return writer
}

func (w *importDatabaseRowWriter) SetColumns(columns []string) {
	w.columns = append([]string(nil), columns...)
}

func (w *importDatabaseRowWriter) BatchEnabled() bool {
	return w.applier != nil
}

func (w *importDatabaseRowWriter) ApplyBatch(rows []map[string]interface{}) error {
	if w.applier == nil {
		return fmt.Errorf("当前数据库类型不支持批量提交")
	}
	return w.applier.ApplyChanges(w.tableName, connection.ChangeSet{Inserts: cloneImportRows(rows)})
}

func (w *importDatabaseRowWriter) ApplyOne(row map[string]interface{}) error {
	if w.applier != nil {
		return w.applier.ApplyChanges(w.tableName, connection.ChangeSet{Inserts: []map[string]interface{}{cloneImportRow(row)}})
	}
	query, err := buildImportInsertQuery(w.dbType, w.tableName, w.columns, row, w.columnTypeMap)
	if err != nil {
		return err
	}
	_, err = w.dbInst.Exec(query)
	return err
}

type importBatchConsumer struct {
	writer         importRowWriter
	batchSize      int
	totalRows      int
	totalRowsKnown bool
	report         func(importProgressState)
	batch          []map[string]interface{}
	batchStartRow  int
	currentRow     int
	successCount   int
	errorLogs      []string
}

func newImportBatchConsumer(writer importRowWriter, batchSize int, totalRows int, totalRowsKnown bool, report func(importProgressState)) *importBatchConsumer {
	if batchSize <= 0 {
		batchSize = defaultImportApplyBatchSize
	}
	return &importBatchConsumer{
		writer:         writer,
		batchSize:      batchSize,
		totalRows:      totalRows,
		totalRowsKnown: totalRowsKnown,
		report:         report,
	}
}

func (c *importBatchConsumer) SetColumns(columns []string) error {
	if c.writer != nil {
		c.writer.SetColumns(columns)
	}
	return nil
}

func (c *importBatchConsumer) ConsumeRow(row map[string]interface{}) error {
	c.currentRow++
	if len(c.batch) == 0 {
		c.batchStartRow = c.currentRow
	}
	c.batch = append(c.batch, cloneImportRow(row))
	if len(c.batch) >= c.batchSize {
		return c.flush()
	}
	return nil
}

func (c *importBatchConsumer) Flush() error {
	return c.flush()
}

func (c *importBatchConsumer) Result() importExecutionResult {
	return importExecutionResult{
		Success:   c.successCount,
		Failed:    len(c.errorLogs),
		Total:     c.currentRow,
		ErrorLogs: append([]string(nil), c.errorLogs...),
	}
}

func (c *importBatchConsumer) flush() error {
	if len(c.batch) == 0 {
		return nil
	}
	rows := c.batch
	startRow := c.batchStartRow
	c.batch = nil
	c.batchStartRow = 0

	if c.writer != nil && c.writer.BatchEnabled() {
		if err := c.writer.ApplyBatch(rows); err == nil {
			c.successCount += len(rows)
			c.emitProgress(startRow + len(rows) - 1)
			return nil
		}
	}

	for idx, row := range rows {
		if c.writer != nil {
			if err := c.writer.ApplyOne(row); err != nil {
				c.errorLogs = append(c.errorLogs, fmt.Sprintf("Row %d: %s", startRow+idx, err.Error()))
			} else {
				c.successCount++
			}
		}
		c.emitProgress(startRow + idx)
	}
	return nil
}

func (c *importBatchConsumer) emitProgress(current int) {
	if c.report == nil {
		return
	}
	c.report(importProgressState{
		Current:        current,
		Total:          c.totalRows,
		Success:        c.successCount,
		Errors:         len(c.errorLogs),
		TotalRowsKnown: c.totalRowsKnown,
	})
}

func buildImportPreview(filePath string, previewLimit int) (importPreviewData, error) {
	collector := newImportPreviewCollector(previewLimit)
	if err := streamImportFile(filePath, collector); err != nil {
		return importPreviewData{}, err
	}
	return collector.Result(), nil
}

func parseImportFile(filePath string) ([]map[string]interface{}, []string, error) {
	collector := &importCollectConsumer{}
	if err := streamImportFile(filePath, collector); err != nil {
		return nil, nil, err
	}
	return collector.rows, collector.columns, nil
}

func streamImportFile(filePath string, consumer importFileConsumer) error {
	lower := strings.ToLower(filePath)
	switch {
	case strings.HasSuffix(lower, ".json"):
		return streamJSONImportFile(filePath, consumer)
	case strings.HasSuffix(lower, ".csv"):
		return streamCSVImportFile(filePath, consumer)
	case strings.HasSuffix(lower, ".xlsx"), strings.HasSuffix(lower, ".xls"):
		return streamExcelImportFile(filePath, consumer)
	default:
		return fmt.Errorf("Unsupported file format")
	}
}

func streamJSONImportFile(filePath string, consumer importFileConsumer) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	decoder := json.NewDecoder(bufio.NewReader(f))
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("JSON Parse Error: %w", err)
	}
	delim, ok := token.(json.Delim)
	if !ok || delim != '[' {
		return fmt.Errorf("JSON Parse Error: root array expected")
	}

	var columns []string
	for decoder.More() {
		var raw map[string]interface{}
		if err := decoder.Decode(&raw); err != nil {
			return fmt.Errorf("JSON Parse Error: %w", err)
		}
		if columns == nil {
			columns = importJSONColumns(raw)
			if err := consumer.SetColumns(columns); err != nil {
				return err
			}
		}
		if err := consumer.ConsumeRow(normalizeImportMapRow(columns, raw)); err != nil {
			return err
		}
	}
	if _, err := decoder.Token(); err != nil {
		return fmt.Errorf("JSON Parse Error: %w", err)
	}
	return nil
}

func streamCSVImportFile(filePath string, consumer importFileConsumer) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	reader := csv.NewReader(bufio.NewReader(f))
	reader.ReuseRecord = true

	header, err := reader.Read()
	if err != nil {
		if err == io.EOF {
			return fmt.Errorf("CSV empty or missing header")
		}
		return fmt.Errorf("CSV Parse Error: %w", err)
	}
	columns := cloneImportColumns(header)
	if !hasImportUsableColumns(columns) {
		return fmt.Errorf("CSV empty or missing header")
	}
	if err := consumer.SetColumns(columns); err != nil {
		return err
	}

	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("CSV Parse Error: %w", err)
		}
		if err := consumer.ConsumeRow(buildImportRowFromValues(columns, record)); err != nil {
			return err
		}
	}
}

func streamExcelImportFile(filePath string, consumer importFileConsumer) error {
	workbook, err := excelize.OpenFile(filePath)
	if err != nil {
		return fmt.Errorf("Excel Parse Error: %w", err)
	}
	defer workbook.Close()

	sheetName := workbook.GetSheetName(0)
	if sheetName == "" {
		return fmt.Errorf("Excel file has no sheets")
	}

	rows, err := workbook.Rows(sheetName)
	if err != nil {
		return fmt.Errorf("Excel Read Error: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Error(); err != nil {
			return fmt.Errorf("Excel Read Error: %w", err)
		}
		return fmt.Errorf("Excel empty or missing header")
	}
	header, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("Excel Read Error: %w", err)
	}
	columns := cloneImportColumns(header)
	if !hasImportUsableColumns(columns) {
		return fmt.Errorf("Excel empty or missing header")
	}
	if err := consumer.SetColumns(columns); err != nil {
		return err
	}

	for rows.Next() {
		record, err := rows.Columns()
		if err != nil {
			return fmt.Errorf("Excel Read Error: %w", err)
		}
		if err := consumer.ConsumeRow(buildImportRowFromValues(columns, record)); err != nil {
			return err
		}
	}
	if err := rows.Error(); err != nil {
		return fmt.Errorf("Excel Read Error: %w", err)
	}
	return nil
}

func buildImportInsertQuery(dbType, tableName string, columns []string, row map[string]interface{}, columnTypeMap map[string]string) (string, error) {
	quotedCols := make([]string, 0, len(columns))
	values := make([]string, 0, len(columns))
	for _, column := range columns {
		if strings.TrimSpace(column) == "" {
			continue
		}
		quotedCols = append(quotedCols, quoteIdentByType(dbType, column))
		colType := columnTypeMap[normalizeColumnName(column)]
		values = append(values, formatImportSQLValue(dbType, colType, row[column]))
	}
	if len(quotedCols) == 0 {
		return "", fmt.Errorf("导入文件缺少有效列头")
	}
	return fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoteQualifiedIdentByType(dbType, tableName),
		strings.Join(quotedCols, ", "),
		strings.Join(values, ", ")), nil
}

func importJSONColumns(row map[string]interface{}) []string {
	columns := make([]string, 0, len(row))
	for key := range row {
		if strings.TrimSpace(key) == "" {
			continue
		}
		columns = append(columns, key)
	}
	sort.Strings(columns)
	return columns
}

func cloneImportColumns(raw []string) []string {
	return append([]string(nil), raw...)
}

func hasImportUsableColumns(columns []string) bool {
	for _, column := range columns {
		if strings.TrimSpace(column) != "" {
			return true
		}
	}
	return false
}

func buildImportRowFromValues(columns []string, values []string) map[string]interface{} {
	row := make(map[string]interface{}, len(columns))
	for idx, column := range columns {
		if strings.TrimSpace(column) == "" {
			continue
		}
		if idx >= len(values) {
			row[column] = nil
			continue
		}
		if values[idx] == "NULL" {
			row[column] = nil
			continue
		}
		row[column] = values[idx]
	}
	return row
}

func normalizeImportMapRow(columns []string, raw map[string]interface{}) map[string]interface{} {
	row := make(map[string]interface{}, len(columns))
	for _, column := range columns {
		if value, ok := raw[column]; ok {
			row[column] = value
			continue
		}
		row[column] = nil
	}
	return row
}

func cloneImportRow(row map[string]interface{}) map[string]interface{} {
	if row == nil {
		return nil
	}
	cloned := make(map[string]interface{}, len(row))
	for key, value := range row {
		cloned[key] = value
	}
	return cloned
}

func cloneImportRows(rows []map[string]interface{}) []map[string]interface{} {
	if len(rows) == 0 {
		return nil
	}
	cloned := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		cloned = append(cloned, cloneImportRow(row))
	}
	return cloned
}
