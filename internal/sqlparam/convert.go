package sqlparam

import (
	"errors"
	"fmt"
	"strconv"
	"time"
)

// 参数声明类型，与前端参数面板的类型选择一一对应。
const (
	TypeString   = "string"
	TypeNumber   = "number"
	TypeBoolean  = "boolean"
	TypeDatetime = "datetime"
	TypeNull     = "null"
	TypeList     = "list"
)

// TypedValue 是一个参数的声明类型与原始值。Value 来自前端 JSON 反序列化：
// 标量为 string/bool/float64/int64/nil，列表为 []any。
type TypedValue struct {
	Type  string
	Value any
}

// 转换失败与使用错误的哨兵错误。上层用 errors.Is 判定后给出可操作提示。
var (
	// ErrMissingParameter 表示某个扫描到的参数没有提供值。
	ErrMissingParameter = errors.New("missing bound parameter")
	// ErrEmptyList 表示列表参数没有提供任何元素。
	ErrEmptyList = errors.New("list parameter requires at least one element")
	// ErrInvalidValue 表示值与声明类型不匹配或无法解析。
	ErrInvalidValue = errors.New("invalid parameter value")
	// ErrNestedList 表示列表元素中又嵌套了列表，暂不支持。
	ErrNestedList = errors.New("nested list parameters are not supported")
)

// datetime 解析格式按常见输入优先级排列；前端统一传 ISO 8601，
// 其余格式兜底手输或粘贴场景。
var datetimeLayouts = []string{
	time.RFC3339Nano,
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02 15:04:05",
	"2006-01-02 15:04",
	"2006-01-02",
	"2006/01/02 15:04:05",
	"2006/01/02",
}

// ConvertTypedValue 将声明类型的原始值转换为可传给 database/sql 的绑定值。
// 返回值只能是 nil、string、bool、int64、float64、time.Time 或 []any（元素同为
// 这些标量）；database/sql 驱动负责最终到列类型的适配。
func ConvertTypedValue(declaredType string, value any) (any, error) {
	switch declaredType {
	case TypeNull:
		return nil, nil
	case TypeString:
		return convertString(value)
	case TypeNumber:
		return convertNumber(value)
	case TypeBoolean:
		return convertBoolean(value)
	case TypeDatetime:
		return convertDatetime(value)
	case TypeList:
		return convertList(value)
	default:
		return nil, fmt.Errorf("%w: unknown parameter type %q", ErrInvalidValue, declaredType)
	}
}

func convertString(value any) (any, error) {
	switch v := value.(type) {
	case nil:
		// 类型声明为 string 但未填值等价于显式 NULL，与面板 NULL 勾选一致。
		return nil, nil
	case string:
		return v, nil
	case bool:
		return strconv.FormatBool(v), nil
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64), nil
	case int64:
		return strconv.FormatInt(v, 10), nil
	default:
		return nil, fmt.Errorf("%w: string parameter got %T", ErrInvalidValue, value)
	}
}

func convertNumber(value any) (any, error) {
	switch v := value.(type) {
	case nil:
		return nil, nil
	case float64:
		return normalizeJSONNumber(v), nil
	case int64:
		return v, nil
	case int:
		return int64(v), nil
	case string:
		return parseNumberString(v)
	default:
		return nil, fmt.Errorf("%w: number parameter got %T", ErrInvalidValue, value)
	}
}

func parseNumberString(v string) (any, error) {
	text := trimSpaceBytes(v)
	if text == "" {
		return nil, fmt.Errorf("%w: number parameter got empty string", ErrInvalidValue)
	}
	if parsed, err := strconv.ParseInt(text, 10, 64); err == nil {
		return parsed, nil
	}
	parsed, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return nil, fmt.Errorf("%w: expected a number", ErrInvalidValue)
	}
	return normalizeJSONNumber(parsed), nil
}

// normalizeJSONNumber 把整数值的 JSON 数字收敛为 int64，避免 PG 等驱动对
// 整数列收到 float64 时报编码错误；非整数保持 float64。
func normalizeJSONNumber(v float64) any {
	if v == float64(int64(v)) {
		return int64(v)
	}
	return v
}

func convertBoolean(value any) (any, error) {
	switch v := value.(type) {
	case nil:
		return nil, nil
	case bool:
		return v, nil
	case string:
		parsed, err := strconv.ParseBool(trimSpaceBytes(v))
		if err != nil {
			return nil, fmt.Errorf("%w: expected a boolean", ErrInvalidValue)
		}
		return parsed, nil
	default:
		return nil, fmt.Errorf("%w: boolean parameter got %T", ErrInvalidValue, value)
	}
}

func convertDatetime(value any) (any, error) {
	text, ok := value.(string)
	if !ok {
		return nil, fmt.Errorf("%w: datetime parameter got %T", ErrInvalidValue, value)
	}
	trimmed := trimSpaceBytes(text)
	if trimmed == "" {
		return nil, nil
	}
	for _, layout := range datetimeLayouts {
		if parsed, err := time.ParseInLocation(layout, trimmed, time.Local); err == nil {
			return parsed, nil
		}
	}
	return nil, fmt.Errorf("%w: expected YYYY-MM-DD or ISO 8601 datetime", ErrInvalidValue)
}

func convertList(value any) (any, error) {
	items, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("%w: list parameter got %T", ErrInvalidValue, value)
	}
	if len(items) == 0 {
		return nil, ErrEmptyList
	}
	converted := make([]any, 0, len(items))
	for _, item := range items {
		scalar, err := convertListItem(item)
		if err != nil {
			return nil, err
		}
		converted = append(converted, scalar)
	}
	return converted, nil
}

func convertListItem(item any) (any, error) {
	switch v := item.(type) {
	case nil:
		return nil, nil
	case string:
		return v, nil
	case bool:
		return v, nil
	case float64:
		return normalizeJSONNumber(v), nil
	case int64:
		return v, nil
	case int:
		return int64(v), nil
	case []any:
		return nil, ErrNestedList
	default:
		return nil, fmt.Errorf("%w: list element got %T", ErrInvalidValue, item)
	}
}

func trimSpaceBytes(s string) string {
	start := 0
	for start < len(s) && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	end := len(s)
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
