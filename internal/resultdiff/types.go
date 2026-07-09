package resultdiff

// DatasetMode 描述一侧数据集的装载方式。
type DatasetMode string

const (
	DatasetModeSQL  DatasetMode = "sql"
	DatasetModeRows DatasetMode = "rows"
)

// DiffKind 行差异类型。
type DiffKind string

const (
	DiffKindAdded     DiffKind = "added"
	DiffKindRemoved   DiffKind = "removed"
	DiffKindChanged   DiffKind = "changed"
	DiffKindSame      DiffKind = "same"
	DiffKindUnmatched DiffKind = "unmatched"
)

// CompareOptions 控制值规范化与相等判断。
type CompareOptions struct {
	TrimStrings     bool `json:"trimStrings"`
	IgnoreCase      bool `json:"ignoreCase"`
	NullEqualsEmpty bool `json:"nullEqualsEmpty"`
}

// DatasetSpec 一侧数据源描述。
type DatasetSpec struct {
	Mode    DatasetMode              `json:"mode"`
	SQL     string                   `json:"sql,omitempty"`
	Columns []string                 `json:"columns,omitempty"`
	Rows    []map[string]interface{} `json:"rows,omitempty"`
}

// StartRequest 启动一次结果集比对。
type StartRequest struct {
	JobID           string                 `json:"jobId,omitempty"`
	Connection      map[string]interface{} `json:"-"` // 由 App 层注入，不经 JSON
	Database        string                 `json:"database,omitempty"`
	Left            DatasetSpec            `json:"left"`
	Right           DatasetSpec            `json:"right"`
	KeyColumns      []string               `json:"keyColumns"`
	CompareColumns  []string               `json:"compareColumns,omitempty"`
	IgnoreColumns   []string               `json:"ignoreColumns,omitempty"`
	Options         CompareOptions         `json:"options"`
	MaxRowsPerSide  int                    `json:"maxRowsPerSide,omitempty"`
	IncludeSameRows bool                   `json:"includeSameRows,omitempty"`
}

// FieldChange 单个字段的左右值。
type FieldChange struct {
	Name  string      `json:"name"`
	Left  interface{} `json:"left"`
	Right interface{} `json:"right"`
}

// DiffRow 一行对齐后的差异。
type DiffRow struct {
	Kind          DiffKind               `json:"kind"`
	Keys          map[string]interface{} `json:"keys"`
	Left          map[string]interface{} `json:"left,omitempty"`
	Right         map[string]interface{} `json:"right,omitempty"`
	ChangedFields []FieldChange          `json:"changedFields,omitempty"`
	Side          string                 `json:"side,omitempty"` // unmatched 时 left/right
}

// Summary 汇总统计。
type Summary struct {
	Added              int            `json:"added"`
	Removed            int            `json:"removed"`
	Changed            int            `json:"changed"`
	Same               int            `json:"same"`
	Unmatched          int            `json:"unmatched"`
	LeftRowCount       int            `json:"leftRowCount"`
	RightRowCount      int            `json:"rightRowCount"`
	CommonColumns      []string       `json:"commonColumns"`
	LeftOnlyColumns    []string       `json:"leftOnlyColumns"`
	RightOnlyColumns   []string       `json:"rightOnlyColumns"`
	ChangedColumnFreq  map[string]int `json:"changedColumnFreq"`
	Truncated          bool           `json:"truncated"`
	Warnings           []string       `json:"warnings,omitempty"`
	KeyColumns         []string       `json:"keyColumns"`
	ComparedColumns    []string       `json:"comparedColumns"`
	IncludeSameRows    bool           `json:"includeSameRows"`
}

// StartResult 启动后的结果。
type StartResult struct {
	JobID   string  `json:"jobId"`
	Summary Summary `json:"summary"`
}

// PageRequest 分页请求。
type PageRequest struct {
	JobID            string   `json:"jobId"`
	Kinds            []string `json:"kinds,omitempty"` // 空=默认非 same
	ChangedColumn    string   `json:"changedColumn,omitempty"`
	Offset           int      `json:"offset"`
	Limit            int      `json:"limit"`
	IncludeSameRows  bool     `json:"includeSameRows,omitempty"`
}

// PageResult 分页结果。
type PageResult struct {
	JobID  string    `json:"jobId"`
	Total  int       `json:"total"`
	Offset int       `json:"offset"`
	Limit  int       `json:"limit"`
	Rows   []DiffRow `json:"rows"`
}

// UploadChunkRequest 快照模式分块上传。
type UploadChunkRequest struct {
	JobID   string                   `json:"jobId"`
	Side    string                   `json:"side"` // left | right
	Columns []string                 `json:"columns,omitempty"`
	Rows    []map[string]interface{} `json:"rows"`
	Done    bool                     `json:"done"`
}

const (
	DefaultMaxRowsPerSide = 200000
	DefaultPageLimit      = 100
	MaxPageLimit          = 1000
	keySep                = "\x1f"
)
