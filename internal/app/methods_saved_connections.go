package app

import "GoNavi-Wails/internal/connection"

func (a *App) savedConnectionRepository() *savedConnectionRepository {
	return newSavedConnectionRepository(a.configDir, a.secretStore)
}

func (a *App) GetSavedConnections() ([]connection.SavedConnectionView, error) {
	return a.savedConnectionRepository().List()
}

func (a *App) SaveConnection(input connection.SavedConnectionInput) (connection.SavedConnectionView, error) {
	return a.savedConnectionRepository().Save(input)
}

func (a *App) DeleteConnection(id string) error {
	return a.savedConnectionRepository().Delete(id)
}

func (a *App) DuplicateConnection(id string) (connection.SavedConnectionView, error) {
	return a.savedConnectionRepository().Duplicate(id)
}

func (a *App) ImportLegacyConnections(items []connection.LegacySavedConnection) ([]connection.SavedConnectionView, error) {
	result := make([]connection.SavedConnectionView, 0, len(items))
	repo := a.savedConnectionRepository()
	for _, item := range items {
		view, err := repo.Save(connection.SavedConnectionInput(item))
		if err != nil {
			return nil, err
		}
		result = append(result, view)
	}
	return result, nil
}

func (a *App) SaveGlobalProxy(input connection.SaveGlobalProxyInput) (connection.GlobalProxyView, error) {
	return a.saveGlobalProxy(input)
}

func (a *App) ImportLegacyGlobalProxy(input connection.LegacyGlobalProxyInput) (connection.GlobalProxyView, error) {
	return a.saveGlobalProxy(connection.SaveGlobalProxyInput(input))
}
