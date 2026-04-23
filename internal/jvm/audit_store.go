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

type AuditStore struct {
	path string
}

func NewAuditStore(path string) *AuditStore {
	return &AuditStore{path: path}
}

func (s *AuditStore) Append(record AuditRecord) error {
	if strings.TrimSpace(s.path) == "" {
		return errors.New("audit store path is empty")
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

func (s *AuditStore) List(connectionID string, limit int) ([]AuditRecord, error) {
	if strings.TrimSpace(s.path) == "" {
		return nil, errors.New("audit store path is empty")
	}

	file, err := os.Open(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []AuditRecord{}, nil
		}
		return nil, err
	}
	defer file.Close()

	normalizedConnectionID := strings.TrimSpace(connectionID)
	records := make([]AuditRecord, 0, 16)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var record AuditRecord
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
