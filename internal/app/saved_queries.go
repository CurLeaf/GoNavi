package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/connection"
	"github.com/google/uuid"
)

const savedQueriesFileName = "saved_queries.json"

var savedQueriesMu sync.Mutex

type savedQueriesFile struct {
	Queries []connection.SavedQuery `json:"queries"`
}

type savedQueryRepository struct {
	configDir string
}

func newSavedQueryRepository(configDir string) *savedQueryRepository {
	if strings.TrimSpace(configDir) == "" {
		configDir = resolveAppConfigDir()
	}
	return &savedQueryRepository{configDir: configDir}
}

func (r *savedQueryRepository) queriesPath() string {
	return filepath.Join(r.configDir, savedQueriesFileName)
}

func (r *savedQueryRepository) load() ([]connection.SavedQuery, error) {
	data, err := os.ReadFile(r.queriesPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []connection.SavedQuery{}, nil
		}
		return nil, err
	}

	var file savedQueriesFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, err
	}
	if file.Queries == nil {
		return []connection.SavedQuery{}, nil
	}
	return sanitizeSavedQueries(file.Queries), nil
}

func (r *savedQueryRepository) saveAll(queries []connection.SavedQuery) error {
	if err := os.MkdirAll(r.configDir, 0o755); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(savedQueriesFile{Queries: sanitizeSavedQueries(queries)}, "", "  ")
	if err != nil {
		return err
	}
	return writeSavedQueriesFileAtomic(r.queriesPath(), payload)
}

func writeSavedQueriesFileAtomic(targetPath string, payload []byte) error {
	dir := filepath.Dir(targetPath)
	temp, err := os.CreateTemp(dir, ".saved_queries_*.tmp")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tempPath)
		}
	}()

	if _, err := temp.Write(payload); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tempPath, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tempPath, targetPath); err != nil {
		if removeErr := os.Remove(targetPath); removeErr != nil && !os.IsNotExist(removeErr) {
			return err
		}
		if retryErr := os.Rename(tempPath, targetPath); retryErr != nil {
			return retryErr
		}
	}
	cleanup = false
	return nil
}

func (r *savedQueryRepository) Save(input connection.SavedQuery) (connection.SavedQuery, error) {
	savedQueriesMu.Lock()
	defer savedQueriesMu.Unlock()

	query, ok := sanitizeSavedQuery(input, 0, true)
	if !ok {
		return connection.SavedQuery{}, fmt.Errorf("saved query requires sql, connectionId and dbName")
	}

	queries, err := r.load()
	if err != nil {
		return connection.SavedQuery{}, err
	}

	replaced := false
	for index, item := range queries {
		if item.ID == query.ID {
			queries[index] = query
			replaced = true
			break
		}
	}
	if !replaced {
		queries = append(queries, query)
	}
	if err := r.saveAll(queries); err != nil {
		return connection.SavedQuery{}, err
	}
	return query, nil
}

func (r *savedQueryRepository) Import(payload connection.SavedQueryImportPayload, currentConnections []connection.SavedConnectionView) ([]connection.SavedQuery, error) {
	savedQueriesMu.Lock()
	defer savedQueriesMu.Unlock()

	existing, err := r.load()
	if err != nil {
		return nil, err
	}

	byID := make(map[string]int, len(existing)+len(payload.Queries))
	for index, item := range existing {
		byID[item.ID] = index
	}

	imported := resolveSavedQueryBindings(payload.Queries, currentConnections, payload.LegacyConnections)
	for index, item := range imported {
		query, ok := sanitizeSavedQuery(item, index, true)
		if !ok {
			continue
		}
		if existingIndex, found := byID[query.ID]; found {
			existing[existingIndex] = query
			continue
		}
		byID[query.ID] = len(existing)
		existing = append(existing, query)
	}

	if err := r.saveAll(existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func (r *savedQueryRepository) Rebind(id string, target connection.SavedConnectionView) (connection.SavedQuery, error) {
	savedQueriesMu.Lock()
	defer savedQueriesMu.Unlock()

	targetID := strings.TrimSpace(id)
	if targetID == "" || strings.TrimSpace(target.ID) == "" {
		return connection.SavedQuery{}, fmt.Errorf("saved query and target connection are required")
	}

	queries, err := r.load()
	if err != nil {
		return connection.SavedQuery{}, err
	}

	for index, item := range queries {
		if item.ID != targetID {
			continue
		}
		if strings.TrimSpace(item.OriginalConnectionID) == "" && strings.TrimSpace(item.ConnectionID) != strings.TrimSpace(target.ID) {
			item.OriginalConnectionID = item.ConnectionID
		}
		item.ConnectionID = target.ID
		item = applySavedQueryActiveBinding(item, target)
		query, ok := sanitizeSavedQuery(item, index, false)
		if !ok {
			return connection.SavedQuery{}, fmt.Errorf("saved query is invalid: %s", targetID)
		}
		queries[index] = query
		if err := r.saveAll(queries); err != nil {
			return connection.SavedQuery{}, err
		}
		return query, nil
	}

	return connection.SavedQuery{}, fmt.Errorf("saved query not found: %s", targetID)
}

func (r *savedQueryRepository) Delete(id string) error {
	savedQueriesMu.Lock()
	defer savedQueriesMu.Unlock()

	targetID := strings.TrimSpace(id)
	if targetID == "" {
		return nil
	}

	queries, err := r.load()
	if err != nil {
		return err
	}
	filtered := queries[:0]
	for _, item := range queries {
		if item.ID != targetID {
			filtered = append(filtered, item)
		}
	}
	return r.saveAll(filtered)
}

func sanitizeSavedQueries(items []connection.SavedQuery) []connection.SavedQuery {
	result := make([]connection.SavedQuery, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for index, item := range items {
		query, ok := sanitizeSavedQuery(item, index, false)
		if !ok {
			continue
		}
		if _, exists := seen[query.ID]; exists {
			continue
		}
		seen[query.ID] = struct{}{}
		result = append(result, query)
	}
	return result
}

func sanitizeSavedQuery(input connection.SavedQuery, index int, allowGeneratedID bool) (connection.SavedQuery, bool) {
	id := strings.TrimSpace(input.ID)
	if id == "" && allowGeneratedID {
		id = "saved-" + uuid.NewString()
	}
	if id == "" {
		return connection.SavedQuery{}, false
	}

	sqlText := input.SQL
	connectionID := strings.TrimSpace(input.ConnectionID)
	dbName := strings.TrimSpace(input.DBName)
	if strings.TrimSpace(sqlText) == "" || connectionID == "" || dbName == "" {
		return connection.SavedQuery{}, false
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = fmt.Sprintf("查询-%d", index+1)
	}
	createdAt := input.CreatedAt
	if createdAt <= 0 {
		createdAt = time.Now().UnixMilli()
	}

	return connection.SavedQuery{
		ID:                    id,
		Name:                  name,
		SQL:                   sqlText,
		ConnectionID:          connectionID,
		DBName:                dbName,
		CreatedAt:             createdAt,
		ConnectionFingerprint: strings.TrimSpace(input.ConnectionFingerprint),
		FingerprintVersion:    strings.TrimSpace(input.FingerprintVersion),
		BindingStatus:         strings.TrimSpace(input.BindingStatus),
		OriginalConnectionID:  strings.TrimSpace(input.OriginalConnectionID),
	}, true
}
