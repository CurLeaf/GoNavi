package db

import (
	"encoding/hex"
	"fmt"
	"reflect"
	"strings"
	"unicode"
	"unicode/utf8"
)

// normalizeQueryValue normalizes driver-returned values for UI/JSON transport.
// 当前主要处理 []byte：如果是可读文本则转为 string，否则转为十六进制字符串，避免前端出现“空白值”。
func normalizeQueryValue(v interface{}) interface{} {
	return normalizeQueryValueWithDBType(v, "")
}

func normalizeQueryValueWithDBType(v interface{}, databaseTypeName string) interface{} {
	if b, ok := v.([]byte); ok {
		return bytesToDisplayValue(b, databaseTypeName)
	}
	return normalizeCompositeQueryValue(v)
}

func normalizeCompositeQueryValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}

	switch typed := v.(type) {
	case []interface{}:
		items := make([]interface{}, len(typed))
		for i, item := range typed {
			items[i] = normalizeQueryValue(item)
		}
		return items
	case map[string]interface{}:
		out := make(map[string]interface{}, len(typed))
		for key, value := range typed {
			out[key] = normalizeQueryValue(value)
		}
		return out
	}

	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Pointer:
		if rv.IsNil() {
			return nil
		}
		return normalizeQueryValue(rv.Elem().Interface())
	case reflect.Map:
		if rv.IsNil() {
			return nil
		}
		out := make(map[string]interface{}, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			out[mapKeyToString(iter.Key().Interface())] = normalizeQueryValue(iter.Value().Interface())
		}
		return out
	case reflect.Slice, reflect.Array:
		// []byte 在上层已单独处理，这里保留对其它切片/数组的递归规整。
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return nil
		}
		size := rv.Len()
		items := make([]interface{}, size)
		for i := 0; i < size; i++ {
			items[i] = normalizeQueryValue(rv.Index(i).Interface())
		}
		return items
	default:
		return v
	}
}

func mapKeyToString(key interface{}) string {
	if key == nil {
		return "null"
	}
	if s, ok := key.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", key)
}

func bytesToDisplayValue(b []byte, databaseTypeName string) interface{} {
	if b == nil {
		return nil
	}
	if len(b) == 0 {
		return ""
	}

	dbType := strings.ToUpper(strings.TrimSpace(databaseTypeName))
	if isBitLikeDBType(dbType) {
		if u, ok := bytesToUint64(b); ok {
			// JS number precision is limited; keep large bitmasks as string.
			const maxSafeInteger = 9007199254740991 // 2^53 - 1
			if u <= maxSafeInteger {
				return int64(u)
			}
			return fmt.Sprintf("%d", u)
		}
	}

	if utf8.Valid(b) {
		s := string(b)
		if isMostlyPrintable(s) {
			return s
		}
	}

	// Fallback: some drivers return BIT(1) as []byte{0} / []byte{1} without type info.
	if dbType == "" && len(b) == 1 && (b[0] == 0 || b[0] == 1) {
		return int64(b[0])
	}

	return bytesToReadableString(b)
}

func bytesToReadableString(b []byte) interface{} {
	if b == nil {
		return nil
	}
	if len(b) == 0 {
		return ""
	}
	return "0x" + hex.EncodeToString(b)
}

func isBitLikeDBType(typeName string) bool {
	if typeName == "" {
		return false
	}
	switch typeName {
	case "BIT", "VARBIT":
		return true
	default:
	}
	return strings.HasPrefix(typeName, "BIT")
}

func bytesToUint64(b []byte) (uint64, bool) {
	if len(b) == 0 || len(b) > 8 {
		return 0, false
	}
	var u uint64
	for _, v := range b {
		u = (u << 8) | uint64(v)
	}
	return u, true
}

func isMostlyPrintable(s string) bool {
	if s == "" {
		return true
	}

	total := 0
	printable := 0
	for _, r := range s {
		total++
		switch r {
		case '\n', '\r', '\t':
			printable++
			continue
		default:
		}
		if unicode.IsPrint(r) {
			printable++
		}
	}

	// 允许少量不可见字符，避免把正常文本误判为二进制。
	return printable*100 >= total*90
}
