package app

import (
	"strings"

	"GoNavi-Wails/internal/connection"
)

func (a *App) savedQueryRepository() *savedQueryRepository {
	return newSavedQueryRepository(a.configDir)
}

func (a *App) GetSavedQueries() ([]connection.SavedQuery, error) {
	savedQueriesMu.Lock()
	defer savedQueriesMu.Unlock()

	queries, err := a.savedQueryRepository().load()
	if err != nil {
		return nil, err
	}
	currentConnections, err := a.savedConnectionRepository().List()
	if err != nil {
		return queries, nil
	}
	return resolveSavedQueryBindings(queries, currentConnections, nil), nil
}

func (a *App) SaveQuery(input connection.SavedQuery) (connection.SavedQuery, error) {
	if strings.TrimSpace(input.Name) == "" {
		input.Name = a.localizedSavedQueryDefaultName(0)
	}
	currentConnections, err := a.savedConnectionRepository().List()
	if err == nil {
		input = resolveSavedQueryBindings([]connection.SavedQuery{input}, currentConnections, nil)[0]
	}
	return a.savedQueryRepository().Save(input)
}

func (a *App) ImportSavedQueries(payload connection.SavedQueryImportPayload) ([]connection.SavedQuery, error) {
	if len(payload.Queries) > 0 {
		localizedQueries := append([]connection.SavedQuery(nil), payload.Queries...)
		for index := range localizedQueries {
			if strings.TrimSpace(localizedQueries[index].Name) == "" {
				localizedQueries[index].Name = a.localizedSavedQueryDefaultName(index)
			}
		}
		payload.Queries = localizedQueries
	}
	currentConnections, err := a.savedConnectionRepository().List()
	if err != nil {
		currentConnections = nil
	}
	return a.savedQueryRepository().Import(payload, currentConnections)
}

func (a *App) localizedSavedQueryDefaultName(index int) string {
	return a.appText("saved_query.default_name", map[string]any{"index": index + 1})
}

func (a *App) DeleteQuery(id string) error {
	return a.savedQueryRepository().Delete(id)
}

func (a *App) RebindSavedQuery(id string, connectionID string) (connection.SavedQuery, error) {
	target, err := a.savedConnectionRepository().Find(connectionID)
	if err != nil {
		return connection.SavedQuery{}, err
	}
	return a.savedQueryRepository().Rebind(id, target)
}

func (a *App) GetUnboundSavedQueries() ([]connection.SavedQuery, error) {
	queries, err := a.GetSavedQueries()
	if err != nil {
		return nil, err
	}
	result := make([]connection.SavedQuery, 0)
	for _, query := range queries {
		if query.BindingStatus == savedQueryBindingOrphan {
			result = append(result, query)
		}
	}
	return result, nil
}
