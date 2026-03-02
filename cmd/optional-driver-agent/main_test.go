package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"testing"
)

type duckMapLike map[any]any

func TestWriteResponse_NormalizesMapAnyAny(t *testing.T) {
	resp := agentResponse{
		ID:      1,
		Success: true,
		Data: []map[string]interface{}{
			{
				"id":   int64(7),
				"meta": duckMapLike{"k": "v", 2: "two"},
			},
		},
	}

	var out bytes.Buffer
	writer := bufio.NewWriter(&out)
	if err := writeResponse(writer, resp); err != nil {
		t.Fatalf("writeResponse 返回错误: %v", err)
	}

	var decoded struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(out.Bytes()), &decoded); err != nil {
		t.Fatalf("解码响应失败: %v", err)
	}

	if len(decoded.Data) != 1 {
		t.Fatalf("期望 1 行数据，实际 %d", len(decoded.Data))
	}
	meta, ok := decoded.Data[0]["meta"].(map[string]interface{})
	if !ok {
		t.Fatalf("meta 字段类型异常: %T", decoded.Data[0]["meta"])
	}
	if meta["k"] != "v" {
		t.Fatalf("字符串 key 转换异常: %v", meta["k"])
	}
	if meta["2"] != "two" {
		t.Fatalf("数字 key 未字符串化: %v", meta["2"])
	}
}

func TestNormalizeAgentResponseData_KeepByteSlice(t *testing.T) {
	raw := []byte{0x61, 0x62, 0x63}
	normalized := normalizeAgentResponseData(raw)
	out, ok := normalized.([]byte)
	if !ok {
		t.Fatalf("期望 []byte，实际 %T", normalized)
	}
	if !bytes.Equal(out, raw) {
		t.Fatalf("[]byte 内容被意外改写: %v", out)
	}
}
