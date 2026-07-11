package resultdiff

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Session 保存一次比对的中间数据与结果。
type Session struct {
	ID              string
	CreatedAt       time.Time
	KeyColumns      []string
	CompareColumns  []string
	IgnoreColumns   []string
	Options         CompareOptions
	MaxRowsPerSide  int
	IncludeSameRows bool

	mu sync.RWMutex

	// 装载缓冲（rows 模式）
	leftColumns  []string
	rightColumns []string
	leftRows     []map[string]interface{}
	rightRows    []map[string]interface{}
	leftDone     bool
	rightDone    bool

	// 计算结果
	computed bool
	summary  Summary
	rows     []DiffRow
	err      error
}

// Manager 管理内存中的 diff 会话。
type Manager struct {
	mu       sync.Mutex
	sessions map[string]*Session
	ttl      time.Duration
}

// NewManager 创建会话管理器。
func NewManager(ttl time.Duration) *Manager {
	if ttl <= 0 {
		ttl = 30 * time.Minute
	}
	m := &Manager{
		sessions: make(map[string]*Session),
		ttl:      ttl,
	}
	return m
}

// Create 新建会话。
func (m *Manager) Create(req StartRequest) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gcLocked()

	id := strings.TrimSpace(req.JobID)
	if id == "" {
		id = "rdiff-" + uuid.NewString()
	}
	maxRows := req.MaxRowsPerSide
	if maxRows <= 0 {
		maxRows = DefaultMaxRowsPerSide
	}
	s := &Session{
		ID:              id,
		CreatedAt:       time.Now(),
		KeyColumns:      normalizeColumnList(req.KeyColumns),
		CompareColumns:  normalizeColumnList(req.CompareColumns),
		IgnoreColumns:   normalizeColumnList(req.IgnoreColumns),
		Options:         req.Options,
		MaxRowsPerSide:  maxRows,
		IncludeSameRows: req.IncludeSameRows,
		leftRows:        make([]map[string]interface{}, 0),
		rightRows:       make([]map[string]interface{}, 0),
	}
	m.sessions[id] = s
	return s
}

// Get 获取会话。
func (m *Manager) Get(jobID string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.gcLocked()
	s, ok := m.sessions[strings.TrimSpace(jobID)]
	if !ok {
		return nil, fmt.Errorf("result diff job not found: %s", jobID)
	}
	return s, nil
}

// Close 释放会话。
func (m *Manager) Close(jobID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, strings.TrimSpace(jobID))
}

func (m *Manager) gcLocked() {
	if m.ttl <= 0 {
		return
	}
	now := time.Now()
	for id, s := range m.sessions {
		if now.Sub(s.CreatedAt) > m.ttl {
			delete(m.sessions, id)
		}
	}
}

// AppendRows 向一侧追加行。
func (s *Session) AppendRows(side string, columns []string, rows []map[string]interface{}, done bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.computed {
		return fmt.Errorf("job already computed")
	}
	side = strings.TrimSpace(strings.ToLower(side))
	switch side {
	case "left":
		if len(columns) > 0 && len(s.leftColumns) == 0 {
			s.leftColumns = normalizeColumnList(columns)
		}
		if err := s.appendSideLocked(&s.leftRows, rows); err != nil {
			return err
		}
		if done {
			s.leftDone = true
		}
	case "right":
		if len(columns) > 0 && len(s.rightColumns) == 0 {
			s.rightColumns = normalizeColumnList(columns)
		}
		if err := s.appendSideLocked(&s.rightRows, rows); err != nil {
			return err
		}
		if done {
			s.rightDone = true
		}
	default:
		return fmt.Errorf("invalid side: %s", side)
	}
	return nil
}

func (s *Session) appendSideLocked(dest *[]map[string]interface{}, rows []map[string]interface{}) error {
	if len(rows) == 0 {
		return nil
	}
	next := len(*dest) + len(rows)
	if next > s.MaxRowsPerSide {
		return fmt.Errorf("row count exceeds maxRowsPerSide=%d (would be %d)", s.MaxRowsPerSide, next)
	}
	*dest = append(*dest, rows...)
	return nil
}

// SetLoaded 直接设置两侧已装载数据（SQL 模式）。
func (s *Session) SetLoaded(
	leftCols []string, leftRows []map[string]interface{},
	rightCols []string, rightRows []map[string]interface{},
) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(leftRows) > s.MaxRowsPerSide {
		return fmt.Errorf("left row count %d exceeds maxRowsPerSide=%d", len(leftRows), s.MaxRowsPerSide)
	}
	if len(rightRows) > s.MaxRowsPerSide {
		return fmt.Errorf("right row count %d exceeds maxRowsPerSide=%d", len(rightRows), s.MaxRowsPerSide)
	}
	s.leftColumns = normalizeColumnList(leftCols)
	s.rightColumns = normalizeColumnList(rightCols)
	s.leftRows = leftRows
	s.rightRows = rightRows
	s.leftDone = true
	s.rightDone = true
	return nil
}

// Compute 执行 diff。
func (s *Session) Compute() (Summary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.computed {
		return s.summary, s.err
	}
	if !s.leftDone || !s.rightDone {
		return Summary{}, fmt.Errorf("both sides must be fully loaded before compute")
	}
	summary, rows, err := ComputeDiff(
		s.leftRows, s.leftColumns,
		s.rightRows, s.rightColumns,
		s.KeyColumns, s.CompareColumns, s.IgnoreColumns,
		s.Options, s.IncludeSameRows,
	)
	s.summary = summary
	s.rows = rows
	s.err = err
	s.computed = err == nil
	// 释放原始行以降低内存（结果 rows 仍保留 left/right 引用）
	// 注意：DiffRow 引用了原 map，不能清空 leftRows/rightRows 内容
	return summary, err
}

// Page 分页。
func (s *Session) Page(req PageRequest) (PageResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if !s.computed {
		return PageResult{}, fmt.Errorf("job not computed yet")
	}
	includeSame := req.IncludeSameRows || s.IncludeSameRows
	page := FilterPage(s.rows, req.Kinds, req.ChangedColumn, req.Offset, req.Limit, includeSame)
	page.JobID = s.ID
	return page, nil
}

// Summary 返回汇总。
func (s *Session) Summary() (Summary, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.summary, s.computed
}
