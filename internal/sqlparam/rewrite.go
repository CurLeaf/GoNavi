package sqlparam

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Dialect 是占位符方言。
type Dialect int

const (
	// DialectQmark 使用 ? 占位符（MySQL 系、SQLite、SQL Server、ClickHouse 等）。
	DialectQmark Dialect = iota
	// DialectDollar 使用 $1、$2 位置占位符（PostgreSQL 系）。
	DialectDollar
	// DialectOracle 使用 :1、:2 位置占位符（Oracle OCI/godror）。
	DialectOracle
)

// DialectForDBType 返回数据源对应的占位符方言。不支持的调用方按 Qmark 处理，
// 由能力声明层决定是否暴露参数功能。
func DialectForDBType(dbType string) Dialect {
	switch normalizeDBType(dbType) {
	case "oracle":
		return DialectOracle
	case "postgres", "opengauss", "gaussdb", "kingbase", "highgo", "vastbase":
		return DialectDollar
	default:
		return DialectQmark
	}
}

// BindResult 是一次成功绑定后的产物：重写后的 SQL 与按占位符顺序排列的参数值。
type BindResult struct {
	SQL  string
	Args []any
}

// Bind 扫描 sql 中的命名参数，用 values 的声明类型转换值，并按 dbType 对应的
// 占位符方言重写 SQL。
//
// 语义约定：
//   - 参数按名字取值，同名出现多次只绑定一次值（填一次、处处生效）；
//   - 列表参数的一个占位符展开为与元素数量相同的逗号分隔占位符（供 IN 使用，
//     圆括号由调用方 SQL 自带）；
//   - 引号模板 '{name} 后缀'：整段（含引号）替换为一个占位符，绑定值为
//     模板渲染后的字符串（{name} 替换为参数原始输入，其余文本原样保留）；
//   - 未提供值的参数返回 ErrMissingParameter（包装具体参数名）；
//   - 不修改任何合法字符串字面量或注释；值永远通过 Args 绑定，绝不拼进 SQL。
func Bind(sql string, dbType string, values map[string]TypedValue) (BindResult, error) {
	spans := Scan(sql, OptionsForDBType(dbType))
	if len(spans) == 0 {
		return BindResult{SQL: sql}, nil
	}
	st := newBindState(len(sql), DialectForDBType(dbType), values, len(spans))
	for i, span := range spans {
		st.out.WriteString(sql[between(spans, i):span.Start])
		if err := st.writeSpan(span); err != nil {
			return BindResult{}, err
		}
	}
	st.out.WriteString(sql[spans[len(spans)-1].End:])
	return st.result(), nil
}

type bindState struct {
	dialect        Dialect
	values         map[string]TypedValue
	out            strings.Builder
	convertedCache map[string]any
	nameSlots      map[string][]int
	nextSlot       int
	slots          map[int]any
	qmarkArgs      []any
}

func newBindState(sqlLen int, dialect Dialect, values map[string]TypedValue, spanCount int) *bindState {
	st := &bindState{
		dialect:        dialect,
		values:         values,
		convertedCache: make(map[string]any, len(values)),
		nameSlots:      make(map[string][]int, spanCount),
		nextSlot:       1,
		slots:          make(map[int]any),
	}
	st.out.Grow(sqlLen + 8*spanCount)
	return st
}

func (st *bindState) writeSpan(span Span) error {
	if span.Template != "" {
		return st.writeTemplate(span)
	}
	converted, err := convertOnce(span.Name, st.values, st.convertedCache)
	if err != nil {
		return err
	}
	if st.dialect == DialectQmark {
		st.writeQmark(converted)
		return nil
	}
	st.writeNumbered(span.Name, converted)
	return nil
}

func (st *bindState) writeTemplate(span Span) error {
	rendered, err := renderTemplate(span.Template, st.values)
	if err != nil {
		return err
	}
	if st.dialect == DialectQmark {
		st.out.WriteByte('?')
		st.qmarkArgs = append(st.qmarkArgs, rendered)
		return nil
	}
	fmt.Fprintf(&st.out, "%s%d", st.marker(), st.nextSlot)
	st.slots[st.nextSlot] = rendered
	st.nextSlot++
	return nil
}

func (st *bindState) writeQmark(converted any) {
	items, isList := converted.([]any)
	if !isList {
		st.out.WriteByte('?')
		st.qmarkArgs = append(st.qmarkArgs, converted)
		return
	}
	for i, item := range items {
		if i > 0 {
			st.out.WriteByte(',')
		}
		st.out.WriteByte('?')
		st.qmarkArgs = append(st.qmarkArgs, item)
	}
}

func (st *bindState) writeNumbered(name string, converted any) {
	items, isList := converted.([]any)
	spanSlots, ok := st.nameSlots[name]
	if !ok {
		spanSlots = st.allocateSlots(isList, items)
		st.nameSlots[name] = spanSlots
	}
	marker := st.marker()
	for i, slot := range spanSlots {
		if i > 0 {
			st.out.WriteByte(',')
		}
		fmt.Fprintf(&st.out, "%s%d", marker, slot)
		if _, assigned := st.slots[slot]; assigned {
			continue
		}
		if isList {
			st.slots[slot] = items[i]
			continue
		}
		st.slots[slot] = converted
	}
}

func (st *bindState) allocateSlots(isList bool, items []any) []int {
	if !isList {
		slot := st.nextSlot
		st.nextSlot++
		return []int{slot}
	}
	slots := make([]int, 0, len(items))
	for range items {
		slots = append(slots, st.nextSlot)
		st.nextSlot++
	}
	return slots
}

func (st *bindState) marker() string {
	if st.dialect == DialectOracle {
		return ":"
	}
	return "$"
}

func (st *bindState) result() BindResult {
	if st.dialect == DialectQmark {
		return BindResult{SQL: st.out.String(), Args: st.qmarkArgs}
	}
	args := make([]any, st.nextSlot-1)
	for slot, value := range st.slots {
		args[slot-1] = value
	}
	return BindResult{SQL: st.out.String(), Args: args}
}

// renderTemplate 把字符串模板中的 {name} 替换为参数原始输入的字符串形式，
// 其余文本原样保留。模板内参数缺失时返回 ErrMissingParameter。
// 使用原始输入而非转换后的值：用户输入 "2025-01-01" + 模板后缀 " 00:00:00"
// 应渲染为 "2025-01-01 00:00:00"，二次格式化会造成错位。
func renderTemplate(content string, values map[string]TypedValue) (string, error) {
	var b strings.Builder
	b.Grow(len(content) + 16)
	for i := 0; i < len(content); i++ {
		if content[i] != '{' {
			b.WriteByte(content[i])
			continue
		}
		end := strings.IndexByte(content[i:], '}')
		if end <= 1 {
			b.WriteByte(content[i])
			continue
		}
		name := content[i+1 : i+end]
		typed, ok := values[name]
		if !ok {
			return "", fmt.Errorf("%w: %s", ErrMissingParameter, name)
		}
		b.WriteString(renderRawValue(typed.Value))
		i += end
	}
	return b.String(), nil
}

func renderRawValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int64:
		return strconv.FormatInt(v, 10)
	case int:
		return strconv.Itoa(v)
	default:
		return fmt.Sprintf("%v", value)
	}
}

func between(spans []Span, idx int) int {
	if idx == 0 {
		return 0
	}
	return spans[idx-1].End
}

func convertOnce(name string, values map[string]TypedValue, cache map[string]any) (any, error) {
	if cached, ok := cache[name]; ok {
		return cached, nil
	}
	typed, provided := values[name]
	if !provided {
		return nil, fmt.Errorf("%w: %s", ErrMissingParameter, name)
	}
	converted, err := ConvertTypedValue(typed.Type, typed.Value)
	if err != nil {
		return nil, fmt.Errorf("parameter %s: %w", name, err)
	}
	cache[name] = converted
	return converted, nil
}

// MissingParameterNames 返回扫描到但未提供值的参数名（排序去重），供上层生成
// 可操作的错误提示。
func MissingParameterNames(sql string, dbType string, values map[string]TypedValue) []string {
	opts := OptionsForDBType(dbType)
	var missing []string
	seen := make(map[string]struct{})
	for _, span := range Scan(sql, opts) {
		if _, ok := values[span.Name]; ok {
			continue
		}
		if _, ok := seen[span.Name]; ok {
			continue
		}
		seen[span.Name] = struct{}{}
		missing = append(missing, span.Name)
	}
	sort.Strings(missing)
	return missing
}
