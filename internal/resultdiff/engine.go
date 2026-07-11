package resultdiff

import (
	"fmt"
	"sort"
	"strings"
)

// ComputeDiff 对两侧已装载行做 key 对齐与字段级 diff。
func ComputeDiff(
	leftRows []map[string]interface{},
	leftCols []string,
	rightRows []map[string]interface{},
	rightCols []string,
	keyColumns []string,
	compareColumns []string,
	ignoreColumns []string,
	opts CompareOptions,
	includeSameRows bool,
) (Summary, []DiffRow, error) {
	keys := normalizeColumnList(keyColumns)
	if len(keys) == 0 {
		return Summary{}, nil, fmt.Errorf("key columns required")
	}

	leftColSet := columnSet(leftCols, leftRows)
	rightColSet := columnSet(rightCols, rightRows)
	common, leftOnly, rightOnly := splitColumns(leftColSet, rightColSet)

	ignoreSet := toLowerSet(ignoreColumns)
	keySet := toLowerSet(keys)

	compared := resolveComparedColumns(common, compareColumns, ignoreSet, keySet)
	if len(compared) == 0 {
		// 至少允许只比 key 存在性；字段变更将始终为空
		compared = nil
	}

	leftMap, leftUnmatched := indexByKeys(leftRows, keys, opts)
	rightMap, rightUnmatched := indexByKeys(rightRows, keys, opts)

	summary := Summary{
		LeftRowCount:      len(leftRows),
		RightRowCount:     len(rightRows),
		CommonColumns:     common,
		LeftOnlyColumns:   leftOnly,
		RightOnlyColumns:  rightOnly,
		ChangedColumnFreq: map[string]int{},
		KeyColumns:        keys,
		ComparedColumns:   compared,
		IncludeSameRows:   includeSameRows,
	}

	var rows []DiffRow
	seen := make(map[string]struct{}, len(leftMap)+len(rightMap))

	// 先遍历 left：removed / changed / same
	for key, leftRow := range leftMap {
		seen[key] = struct{}{}
		rightRow, ok := rightMap[key]
		if !ok {
			summary.Removed++
			rows = append(rows, DiffRow{
				Kind:  DiffKindRemoved,
				Keys:  pickKeys(leftRow, keys),
				Left:  leftRow,
				Right: nil,
			})
			continue
		}
		changes := diffFields(leftRow, rightRow, compared, opts)
		if len(changes) == 0 {
			summary.Same++
			if includeSameRows {
				rows = append(rows, DiffRow{
					Kind:  DiffKindSame,
					Keys:  pickKeys(leftRow, keys),
					Left:  leftRow,
					Right: rightRow,
				})
			}
			continue
		}
		summary.Changed++
		for _, ch := range changes {
			summary.ChangedColumnFreq[ch.Name]++
		}
		rows = append(rows, DiffRow{
			Kind:          DiffKindChanged,
			Keys:          pickKeys(leftRow, keys),
			Left:          leftRow,
			Right:         rightRow,
			ChangedFields: changes,
		})
	}

	// right 独有 → added
	for key, rightRow := range rightMap {
		if _, ok := seen[key]; ok {
			continue
		}
		summary.Added++
		rows = append(rows, DiffRow{
			Kind:  DiffKindAdded,
			Keys:  pickKeys(rightRow, keys),
			Left:  nil,
			Right: rightRow,
		})
	}

	for _, row := range leftUnmatched {
		summary.Unmatched++
		rows = append(rows, DiffRow{
			Kind: DiffKindUnmatched,
			Keys: pickKeys(row, keys),
			Left: row,
			Side: "left",
		})
	}
	for _, row := range rightUnmatched {
		summary.Unmatched++
		rows = append(rows, DiffRow{
			Kind:  DiffKindUnmatched,
			Keys:  pickKeys(row, keys),
			Right: row,
			Side:  "right",
		})
	}

	// 稳定排序：kind 优先级 + key 字符串
	sort.SliceStable(rows, func(i, j int) bool {
		pi, pj := kindOrder(rows[i].Kind), kindOrder(rows[j].Kind)
		if pi != pj {
			return pi < pj
		}
		return formatKeyMap(rows[i].Keys, keys, opts) < formatKeyMap(rows[j].Keys, keys, opts)
	})

	return summary, rows, nil
}

// FilterPage 按 kind / 变更列过滤并分页。
func FilterPage(all []DiffRow, kinds []string, changedColumn string, offset, limit int, includeSame bool) PageResult {
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 {
		limit = DefaultPageLimit
	}
	if limit > MaxPageLimit {
		limit = MaxPageLimit
	}

	kindSet := map[string]struct{}{}
	for _, k := range kinds {
		k = strings.TrimSpace(strings.ToLower(k))
		if k != "" {
			kindSet[k] = struct{}{}
		}
	}
	// 默认排除 same
	defaultExcludeSame := len(kindSet) == 0 && !includeSame
	changedColumn = strings.TrimSpace(changedColumn)

	filtered := make([]DiffRow, 0, len(all))
	for _, row := range all {
		if defaultExcludeSame && row.Kind == DiffKindSame {
			continue
		}
		if len(kindSet) > 0 {
			if _, ok := kindSet[string(row.Kind)]; !ok {
				continue
			}
		}
		if changedColumn != "" {
			if row.Kind != DiffKindChanged {
				continue
			}
			found := false
			for _, ch := range row.ChangedFields {
				if strings.EqualFold(ch.Name, changedColumn) {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		filtered = append(filtered, row)
	}

	total := len(filtered)
	if offset >= total {
		return PageResult{Total: total, Offset: offset, Limit: limit, Rows: []DiffRow{}}
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return PageResult{
		Total:  total,
		Offset: offset,
		Limit:  limit,
		Rows:   filtered[offset:end],
	}
}

func kindOrder(k DiffKind) int {
	switch k {
	case DiffKindChanged:
		return 0
	case DiffKindAdded:
		return 1
	case DiffKindRemoved:
		return 2
	case DiffKindUnmatched:
		return 3
	case DiffKindSame:
		return 4
	default:
		return 9
	}
}

func normalizeColumnList(cols []string) []string {
	out := make([]string, 0, len(cols))
	seen := map[string]struct{}{}
	for _, c := range cols {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		lower := strings.ToLower(c)
		if _, ok := seen[lower]; ok {
			continue
		}
		seen[lower] = struct{}{}
		out = append(out, c)
	}
	return out
}

func toLowerSet(cols []string) map[string]struct{} {
	set := make(map[string]struct{}, len(cols))
	for _, c := range cols {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		set[strings.ToLower(c)] = struct{}{}
	}
	return set
}

func columnSet(explicit []string, rows []map[string]interface{}) map[string]string {
	// lower -> original display name
	set := map[string]string{}
	for _, c := range explicit {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		set[strings.ToLower(c)] = c
	}
	for _, row := range rows {
		for k := range row {
			k = strings.TrimSpace(k)
			if k == "" {
				continue
			}
			lower := strings.ToLower(k)
			if _, ok := set[lower]; !ok {
				set[lower] = k
			}
		}
	}
	return set
}

func splitColumns(left, right map[string]string) (common, leftOnly, rightOnly []string) {
	for lower, name := range left {
		if _, ok := right[lower]; ok {
			common = append(common, name)
		} else {
			leftOnly = append(leftOnly, name)
		}
	}
	for lower, name := range right {
		if _, ok := left[lower]; !ok {
			rightOnly = append(rightOnly, name)
		}
	}
	sort.Strings(common)
	sort.Strings(leftOnly)
	sort.Strings(rightOnly)
	return common, leftOnly, rightOnly
}

func resolveComparedColumns(common []string, compareColumns []string, ignoreSet, keySet map[string]struct{}) []string {
	wanted := normalizeColumnList(compareColumns)
	var out []string
	if len(wanted) == 0 {
		for _, c := range common {
			lower := strings.ToLower(c)
			if _, skip := ignoreSet[lower]; skip {
				continue
			}
			// key 列默认也参与比较（可发现 key 列本身格式差异），但通常相同
			out = append(out, c)
		}
		return out
	}
	commonLower := map[string]string{}
	for _, c := range common {
		commonLower[strings.ToLower(c)] = c
	}
	for _, w := range wanted {
		lower := strings.ToLower(w)
		if _, skip := ignoreSet[lower]; skip {
			continue
		}
		if name, ok := commonLower[lower]; ok {
			out = append(out, name)
		}
		_ = keySet
	}
	return out
}

func indexByKeys(rows []map[string]interface{}, keyColumns []string, opts CompareOptions) (map[string]map[string]interface{}, []map[string]interface{}) {
	indexed := make(map[string]map[string]interface{}, len(rows))
	var unmatched []map[string]interface{}
	for _, row := range rows {
		key, ok := buildKey(row, keyColumns, opts)
		if !ok {
			unmatched = append(unmatched, row)
			continue
		}
		// 重复 key：保留首次，后续进 unmatched 并标记
		if _, exists := indexed[key]; exists {
			unmatched = append(unmatched, row)
			continue
		}
		indexed[key] = row
	}
	return indexed, unmatched
}

func buildKey(row map[string]interface{}, keyColumns []string, opts CompareOptions) (string, bool) {
	parts := make([]string, 0, len(keyColumns))
	for _, col := range keyColumns {
		val, found := lookupValue(row, col)
		if !found || val == nil {
			if opts.NullEqualsEmpty {
				parts = append(parts, "")
				continue
			}
			return "", false
		}
		s := normalizeValue(val, opts)
		if s == "" && !opts.NullEqualsEmpty {
			// 空串是否算有效 key：允许
		}
		parts = append(parts, s)
	}
	return strings.Join(parts, keySep), true
}

func formatKeyMap(keys map[string]interface{}, keyColumns []string, opts CompareOptions) string {
	parts := make([]string, 0, len(keyColumns))
	for _, col := range keyColumns {
		val, _ := lookupValue(keys, col)
		parts = append(parts, normalizeValue(val, opts))
	}
	return strings.Join(parts, keySep)
}

func pickKeys(row map[string]interface{}, keyColumns []string) map[string]interface{} {
	out := make(map[string]interface{}, len(keyColumns))
	for _, col := range keyColumns {
		if val, ok := lookupValue(row, col); ok {
			out[col] = val
		} else {
			out[col] = nil
		}
	}
	return out
}

func diffFields(left, right map[string]interface{}, columns []string, opts CompareOptions) []FieldChange {
	var changes []FieldChange
	for _, col := range columns {
		lv, _ := lookupValue(left, col)
		rv, _ := lookupValue(right, col)
		if valuesEqual(lv, rv, opts) {
			continue
		}
		changes = append(changes, FieldChange{Name: col, Left: lv, Right: rv})
	}
	return changes
}

func lookupValue(row map[string]interface{}, col string) (interface{}, bool) {
	if row == nil {
		return nil, false
	}
	if v, ok := row[col]; ok {
		return v, true
	}
	// case-insensitive fallback
	lower := strings.ToLower(col)
	for k, v := range row {
		if strings.ToLower(k) == lower {
			return v, true
		}
	}
	return nil, false
}

func valuesEqual(left, right interface{}, opts CompareOptions) bool {
	if left == nil && right == nil {
		return true
	}
	ls := normalizeValue(left, opts)
	rs := normalizeValue(right, opts)
	if opts.NullEqualsEmpty {
		if (left == nil && rs == "") || (right == nil && ls == "") {
			return ls == rs
		}
	}
	return ls == rs
}

func normalizeValue(v interface{}, opts CompareOptions) string {
	if v == nil {
		return ""
	}
	s := strings.TrimSpace(fmt.Sprintf("%v", v))
	if s == "<nil>" {
		s = ""
	}
	if opts.TrimStrings {
		s = strings.TrimSpace(s)
	}
	if opts.IgnoreCase {
		s = strings.ToLower(s)
	}
	return s
}
