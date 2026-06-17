package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

func TestSavedQueryRepositorySaveUpdateAndDelete(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	query := connection.SavedQuery{
		ID:           "saved-1",
		Name:         "Orders",
		SQL:          "select * from orders",
		ConnectionID: "conn-1",
		DBName:       "app",
		CreatedAt:    100,
	}
	if _, err := app.SaveQuery(query); err != nil {
		t.Fatalf("SaveQuery returned error: %v", err)
	}

	saved, err := app.GetSavedQueries()
	if err != nil {
		t.Fatalf("GetSavedQueries returned error: %v", err)
	}
	if len(saved) != 1 || saved[0].Name != "Orders" {
		t.Fatalf("expected saved query to be persisted, got %#v", saved)
	}

	query.Name = "Orders Updated"
	query.SQL = "select id from orders"
	if _, err := app.SaveQuery(query); err != nil {
		t.Fatalf("SaveQuery update returned error: %v", err)
	}
	saved, err = app.GetSavedQueries()
	if err != nil {
		t.Fatalf("GetSavedQueries after update returned error: %v", err)
	}
	if len(saved) != 1 || saved[0].Name != "Orders Updated" || saved[0].SQL != "select id from orders" {
		t.Fatalf("expected saved query to be updated in place, got %#v", saved)
	}

	if err := app.DeleteQuery("saved-1"); err != nil {
		t.Fatalf("DeleteQuery returned error: %v", err)
	}
	saved, err = app.GetSavedQueries()
	if err != nil {
		t.Fatalf("GetSavedQueries after delete returned error: %v", err)
	}
	if len(saved) != 0 {
		t.Fatalf("expected saved query to be deleted, got %#v", saved)
	}
	if _, err := os.Stat(filepath.Join(app.configDir, savedQueriesFileName)); err != nil {
		t.Fatalf("expected saved query file to remain readable after delete: %v", err)
	}
}

func TestImportSavedQueriesUpsertsAndSkipsInvalidItems(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	if _, err := app.SaveQuery(connection.SavedQuery{
		ID:           "saved-1",
		Name:         "Old",
		SQL:          "select 1",
		ConnectionID: "conn-1",
		DBName:       "app",
		CreatedAt:    100,
	}); err != nil {
		t.Fatalf("seed SaveQuery returned error: %v", err)
	}

	imported, err := app.ImportSavedQueries(connection.SavedQueryImportPayload{
		Queries: []connection.SavedQuery{
			{
				ID:           "saved-1",
				Name:         "New",
				SQL:          "select 2",
				ConnectionID: "conn-1",
				DBName:       "app",
				CreatedAt:    100,
			},
			{
				ID:           "saved-2",
				Name:         "Second",
				SQL:          "select 3",
				ConnectionID: "conn-2",
				DBName:       "analytics",
				CreatedAt:    200,
			},
			{
				ID:           "invalid",
				Name:         "Missing SQL",
				ConnectionID: "conn-3",
				DBName:       "app",
			},
		},
	})
	if err != nil {
		t.Fatalf("ImportSavedQueries returned error: %v", err)
	}
	if len(imported) != 2 {
		t.Fatalf("expected 2 valid saved queries after import, got %#v", imported)
	}
	if imported[0].Name != "New" || imported[0].SQL != "select 2" {
		t.Fatalf("expected import to upsert saved-1, got %#v", imported[0])
	}
	if imported[1].ID != "saved-2" {
		t.Fatalf("expected import to append saved-2, got %#v", imported[1])
	}
}

func TestSavedQueryRepositoryPreservesSQLWhitespace(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	query := connection.SavedQuery{
		ID:           "saved-whitespace",
		Name:         "Formatted",
		SQL:          "\n  select * from orders;\n",
		ConnectionID: "conn-1",
		DBName:       "app",
		CreatedAt:    100,
	}
	persisted, err := app.SaveQuery(query)
	if err != nil {
		t.Fatalf("SaveQuery returned error: %v", err)
	}
	if persisted.SQL != query.SQL {
		t.Fatalf("expected saved SQL whitespace to be preserved, got %q", persisted.SQL)
	}
}

func TestSavedQueryRepositoryLocalizesGeneratedName(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()
	app.SetLanguage("en-US")

	persisted, err := app.SaveQuery(connection.SavedQuery{
		ID:           "saved-generated-name",
		SQL:          "select 1",
		ConnectionID: "conn-1",
		DBName:       "app",
		CreatedAt:    100,
	})
	if err != nil {
		t.Fatalf("SaveQuery returned error: %v", err)
	}
	if persisted.Name != "Query 1" {
		t.Fatalf("expected localized generated saved query name, got %q", persisted.Name)
	}
}

func TestSavedQueriesDoesNotHardcodeGeneratedNameChinese(t *testing.T) {
	source, err := os.ReadFile("saved_queries.go")
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	if strings.Contains(string(source), `fmt.Sprintf("查询-%d", index+1)`) {
		t.Fatal("saved_queries.go still hardcodes generated saved query name")
	}
}

func TestSavedQueryRepositorySerializesConcurrentWrites(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	const count = 24
	var wg sync.WaitGroup
	errCh := make(chan error, count)
	for index := 0; index < count; index++ {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := app.SaveQuery(connection.SavedQuery{
				ID:           fmt.Sprintf("saved-%02d", index),
				Name:         fmt.Sprintf("Query %02d", index),
				SQL:          fmt.Sprintf("select %d", index),
				ConnectionID: "conn-1",
				DBName:       "app",
				CreatedAt:    int64(index + 1),
			})
			if err != nil {
				errCh <- err
			}
		}()
	}
	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Fatalf("SaveQuery returned error during concurrent write: %v", err)
	}

	saved, err := app.GetSavedQueries()
	if err != nil {
		t.Fatalf("GetSavedQueries returned error: %v", err)
	}
	if len(saved) != count {
		t.Fatalf("expected %d saved queries after concurrent writes, got %d: %#v", count, len(saved), saved)
	}
}

func TestImportSavedQueriesRebindsLegacyConnectionByUniqueFingerprint(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	current, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-current",
		Name: "Current",
		Config: connection.ConnectionConfig{
			ID:       "conn-current",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "app",
			Database: "app",
			Password: "new-secret",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	imported, err := app.ImportSavedQueries(connection.SavedQueryImportPayload{
		Queries: []connection.SavedQuery{
			{
				ID:           "saved-legacy",
				Name:         "Legacy",
				SQL:          "select 1",
				ConnectionID: "conn-old",
				DBName:       "app",
				CreatedAt:    100,
			},
		},
		LegacyConnections: []connection.SavedConnectionInput{
			{
				ID:   "conn-old",
				Name: "Old",
				Config: connection.ConnectionConfig{
					ID:       "conn-old",
					Type:     "postgres",
					Host:     "DB.LOCAL",
					Port:     5432,
					User:     "app",
					Database: "app",
					Password: "old-secret",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("ImportSavedQueries returned error: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected 1 imported query, got %#v", imported)
	}
	query := imported[0]
	if query.ConnectionID != current.ID {
		t.Fatalf("expected query to rebind to %s, got %#v", current.ID, query)
	}
	if query.OriginalConnectionID != "conn-old" {
		t.Fatalf("expected original connection id to be preserved, got %#v", query)
	}
	if query.BindingStatus != savedQueryBindingRebound {
		t.Fatalf("expected rebound binding status, got %#v", query)
	}
	if query.ConnectionFingerprint == "" || query.FingerprintVersion != savedQueryFingerprintVersion {
		t.Fatalf("expected fingerprint metadata, got %#v", query)
	}
}

func TestImportSavedQueriesDoesNotRebindAmbiguousFingerprint(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	for _, id := range []string{"conn-a", "conn-b"} {
		if _, err := app.SaveConnection(connection.SavedConnectionInput{
			ID:   id,
			Name: id,
			Config: connection.ConnectionConfig{
				ID:       id,
				Type:     "mysql",
				Host:     "db.local",
				Port:     3306,
				User:     "app",
				Database: "app",
			},
		}); err != nil {
			t.Fatalf("SaveConnection %s returned error: %v", id, err)
		}
	}

	imported, err := app.ImportSavedQueries(connection.SavedQueryImportPayload{
		Queries: []connection.SavedQuery{
			{
				ID:           "saved-ambiguous",
				Name:         "Ambiguous",
				SQL:          "select 1",
				ConnectionID: "conn-old",
				DBName:       "app",
				CreatedAt:    100,
			},
		},
		LegacyConnections: []connection.SavedConnectionInput{
			{
				ID:   "conn-old",
				Name: "Old",
				Config: connection.ConnectionConfig{
					ID:       "conn-old",
					Type:     "mysql",
					Host:     "db.local",
					Port:     3306,
					User:     "app",
					Database: "app",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("ImportSavedQueries returned error: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected 1 imported query, got %#v", imported)
	}
	query := imported[0]
	if query.ConnectionID != "conn-old" {
		t.Fatalf("expected ambiguous query to keep old connection id, got %#v", query)
	}
	if query.BindingStatus != savedQueryBindingOrphan {
		t.Fatalf("expected orphan binding status, got %#v", query)
	}
}

func TestGetSavedQueriesRebindsStoredFingerprint(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	current, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-current",
		Name: "Current",
		Config: connection.ConnectionConfig{
			ID:       "conn-current",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "app",
			Database: "app",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}
	fingerprint, ok := buildSavedConnectionFingerprint(current)
	if !ok {
		t.Fatal("expected current connection fingerprint to be available")
	}
	if err := app.savedQueryRepository().saveAll([]connection.SavedQuery{
		{
			ID:                    "saved-stored-fingerprint",
			Name:                  "Stored Fingerprint",
			SQL:                   "select 1",
			ConnectionID:          "conn-old",
			DBName:                "app",
			CreatedAt:             100,
			ConnectionFingerprint: fingerprint,
			FingerprintVersion:    savedQueryFingerprintVersion,
		},
	}); err != nil {
		t.Fatalf("saveAll returned error: %v", err)
	}

	queries, err := app.GetSavedQueries()
	if err != nil {
		t.Fatalf("GetSavedQueries returned error: %v", err)
	}
	if len(queries) != 1 {
		t.Fatalf("expected 1 query, got %#v", queries)
	}
	if queries[0].ConnectionID != current.ID {
		t.Fatalf("expected query to rebind to %s, got %#v", current.ID, queries[0])
	}
	if queries[0].OriginalConnectionID != "conn-old" {
		t.Fatalf("expected original connection id to be preserved, got %#v", queries[0])
	}
	if queries[0].BindingStatus != savedQueryBindingRebound {
		t.Fatalf("expected rebound binding status, got %#v", queries[0])
	}
}

func TestRebindSavedQueryUpdatesConnectionAndFingerprint(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()

	target, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-target",
		Name: "Target",
		Config: connection.ConnectionConfig{
			ID:       "conn-target",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "app",
			Database: "app",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}
	if _, err := app.SaveQuery(connection.SavedQuery{
		ID:           "saved-orphan",
		Name:         "Orphan",
		SQL:          "select 1",
		ConnectionID: "conn-old",
		DBName:       "app",
		CreatedAt:    100,
	}); err != nil {
		t.Fatalf("SaveQuery returned error: %v", err)
	}

	rebound, err := app.RebindSavedQuery("saved-orphan", target.ID)
	if err != nil {
		t.Fatalf("RebindSavedQuery returned error: %v", err)
	}
	if rebound.ConnectionID != target.ID {
		t.Fatalf("expected query to bind to target connection, got %#v", rebound)
	}
	if rebound.OriginalConnectionID != "conn-old" {
		t.Fatalf("expected original connection id to be retained, got %#v", rebound)
	}
	if rebound.BindingStatus != savedQueryBindingActive {
		t.Fatalf("expected active binding status, got %#v", rebound)
	}
	if rebound.ConnectionFingerprint == "" {
		t.Fatalf("expected fingerprint to be stored, got %#v", rebound)
	}
}
