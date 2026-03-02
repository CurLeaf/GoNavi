package db

import "testing"

type duckMapLike map[any]any

func TestNormalizeQueryValueWithDBType_BitBytes(t *testing.T) {
	v := normalizeQueryValueWithDBType([]byte{0x00}, "BIT")
	if v != int64(0) {
		t.Fatalf("BIT 0x00 期望为 0，实际=%v(%T)", v, v)
	}

	v = normalizeQueryValueWithDBType([]byte{0x01}, "bit")
	if v != int64(1) {
		t.Fatalf("BIT 0x01 期望为 1，实际=%v(%T)", v, v)
	}

	v = normalizeQueryValueWithDBType([]byte{0x01, 0x02}, "BIT VARYING")
	if v != int64(258) {
		t.Fatalf("BIT 0x0102 期望为 258，实际=%v(%T)", v, v)
	}
}

func TestNormalizeQueryValueWithDBType_BitLargeAsString(t *testing.T) {
	v := normalizeQueryValueWithDBType([]byte{0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff}, "BIT")
	if s, ok := v.(string); !ok || s != "18446744073709551615" {
		t.Fatalf("BIT 0xffffffffffffffff 期望为 string(18446744073709551615)，实际=%v(%T)", v, v)
	}
}

func TestNormalizeQueryValueWithDBType_ByteFallbacks(t *testing.T) {
	v := normalizeQueryValueWithDBType([]byte("abc"), "")
	if v != "abc" {
		t.Fatalf("文本 []byte 期望返回 string，实际=%v(%T)", v, v)
	}

	v = normalizeQueryValueWithDBType([]byte{0x00}, "")
	if v != int64(0) {
		t.Fatalf("未知类型 0x00 期望返回 0，实际=%v(%T)", v, v)
	}

	v = normalizeQueryValueWithDBType([]byte{0xff}, "")
	if v != "0xff" {
		t.Fatalf("未知类型 0xff 期望返回 0xff，实际=%v(%T)", v, v)
	}
}

func TestNormalizeQueryValueWithDBType_MapAnyAnyForJSON(t *testing.T) {
	input := duckMapLike{
		"id":    int64(1),
		1:       "one",
		true:    []interface{}{duckMapLike{2: "two"}},
		"bytes": []byte("ok"),
	}

	v := normalizeQueryValueWithDBType(input, "")
	root, ok := v.(map[string]interface{})
	if !ok {
		t.Fatalf("期望转换为 map[string]interface{}，实际=%T", v)
	}

	if root["id"] != int64(1) {
		t.Fatalf("id 字段异常，实际=%v(%T)", root["id"], root["id"])
	}
	if root["1"] != "one" {
		t.Fatalf("数字 key 未被字符串化，实际=%v(%T)", root["1"], root["1"])
	}
	if root["bytes"] != "ok" {
		t.Fatalf("嵌套 []byte 未被转换，实际=%v(%T)", root["bytes"], root["bytes"])
	}

	arr, ok := root["true"].([]interface{})
	if !ok || len(arr) != 1 {
		t.Fatalf("bool key 下的数组结构异常，实际=%v(%T)", root["true"], root["true"])
	}
	nested, ok := arr[0].(map[string]interface{})
	if !ok {
		t.Fatalf("嵌套 map 未被转换，实际=%v(%T)", arr[0], arr[0])
	}
	if nested["2"] != "two" {
		t.Fatalf("嵌套 map 数字 key 未转换，实际=%v(%T)", nested["2"], nested["2"])
	}
}
