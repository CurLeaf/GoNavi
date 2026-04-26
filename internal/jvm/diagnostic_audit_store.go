package jvm

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type DiagnosticAuditStore struct {
	path string
}

func NewDiagnosticAuditStore(path string) *DiagnosticAuditStore {
	return &DiagnosticAuditStore{path: path}
}

func (s *DiagnosticAuditStore) Append(record DiagnosticAuditRecord) error {
	if strings.TrimSpace(s.path) == "" {
		return errors.New("diagnostic audit store path is empty")
	}
	if record.Timestamp == 0 {
		record.Timestamp = time.Now().UnixMilli()
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()

	return json.NewEncoder(file).Encode(record)
}

func (s *DiagnosticAuditStore) List(connectionID string, limit int) ([]DiagnosticAuditRecord, error) {
	if strings.TrimSpace(s.path) == "" {
		return nil, errors.New("diagnostic audit store path is empty")
	}

	file, err := os.Open(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []DiagnosticAuditRecord{}, nil
		}
		return nil, err
	}
	defer file.Close()

	normalizedConnectionID := strings.TrimSpace(connectionID)
	records := make([]DiagnosticAuditRecord, 0, 16)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var record DiagnosticAuditRecord
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			return nil, err
		}
		if normalizedConnectionID != "" && strings.TrimSpace(record.ConnectionID) != normalizedConnectionID {
			continue
		}
		records = append(records, record)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	sort.SliceStable(records, func(i, j int) bool {
		return records[i].Timestamp > records[j].Timestamp
	})

	if limit > 0 && len(records) > limit {
		return records[:limit], nil
	}
	return records, nil
}
