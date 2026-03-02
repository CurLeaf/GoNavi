package app

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestFormatExportCellText_FloatNoScientificNotation(t *testing.T) {
	got := formatExportCellText(1.445663e+06)
	if strings.Contains(strings.ToLower(got), "e+") || strings.Contains(strings.ToLower(got), "e-") {
		t.Fatalf("不应输出科学计数法，got=%q", got)
	}
	if got != "1445663" {
		t.Fatalf("浮点整值导出异常，want=%q got=%q", "1445663", got)
	}
}

func TestWriteRowsToFile_Markdown_NumberKeepPlainText(t *testing.T) {
	f, err := os.CreateTemp("", "gonavi-export-*.md")
	if err != nil {
		t.Fatalf("创建临时文件失败: %v", err)
	}
	defer os.Remove(f.Name())
	defer f.Close()

	data := []map[string]interface{}{
		{"id": 1.445663e+06},
	}
	columns := []string{"id"}

	if err := writeRowsToFile(f, data, columns, "md"); err != nil {
		t.Fatalf("写入 md 失败: %v", err)
	}

	contentBytes, err := os.ReadFile(f.Name())
	if err != nil {
		t.Fatalf("读取 md 失败: %v", err)
	}
	content := string(contentBytes)
	if strings.Contains(strings.ToLower(content), "e+") || strings.Contains(strings.ToLower(content), "e-") {
		t.Fatalf("md 导出包含科学计数法: %s", content)
	}
	if !strings.Contains(content, "| 1445663 |") {
		t.Fatalf("md 导出未保留整数字面量，content=%s", content)
	}
}

func TestWriteRowsToFile_JSON_NumberKeepPlainText(t *testing.T) {
	f, err := os.CreateTemp("", "gonavi-export-*.json")
	if err != nil {
		t.Fatalf("创建临时文件失败: %v", err)
	}
	defer os.Remove(f.Name())
	defer f.Close()

	data := []map[string]interface{}{
		{"id": 1.445663e+06},
	}
	columns := []string{"id"}

	if err := writeRowsToFile(f, data, columns, "json"); err != nil {
		t.Fatalf("写入 json 失败: %v", err)
	}

	contentBytes, err := os.ReadFile(f.Name())
	if err != nil {
		t.Fatalf("读取 json 失败: %v", err)
	}
	content := string(contentBytes)
	if strings.Contains(strings.ToLower(content), "e+") || strings.Contains(strings.ToLower(content), "e-") {
		t.Fatalf("json 导出包含科学计数法: %s", content)
	}

	var decoded []map[string]json.Number
	decoder := json.NewDecoder(bytes.NewReader(contentBytes))
	decoder.UseNumber()
	if err := decoder.Decode(&decoded); err != nil {
		t.Fatalf("解析导出 json 失败: %v", err)
	}
	if len(decoded) != 1 {
		t.Fatalf("导出行数异常，got=%d", len(decoded))
	}
	if decoded[0]["id"].String() != "1445663" {
		t.Fatalf("json 数值格式异常，want=1445663 got=%s", decoded[0]["id"].String())
	}
}
