package app

import (
	"strings"

	"GoNavi-Wails/internal/connection"
)

func (a *App) savedConnectionRepository() *savedConnectionRepository {
	return newSavedConnectionRepository(a.configDir, a.secretStore)
}

func (a *App) GetSavedConnections() ([]connection.SavedConnectionView, error) {
	items, err := a.savedConnectionRepository().List()
	if err != nil {
		return nil, err
	}
	return sanitizeSavedConnectionViews(items), nil
}

func (a *App) SaveConnection(input connection.SavedConnectionInput) (connection.SavedConnectionView, error) {
	view, err := a.savedConnectionRepository().Save(input)
	if err != nil {
		return connection.SavedConnectionView{}, err
	}
	return sanitizeSavedConnectionView(view), nil
}

func (a *App) DeleteConnection(id string) error {
	return a.savedConnectionRepository().Delete(id)
}

func (a *App) DuplicateConnection(id string) (connection.SavedConnectionView, error) {
	view, err := a.savedConnectionRepository().Duplicate(id)
	if err != nil {
		return connection.SavedConnectionView{}, err
	}
	return sanitizeSavedConnectionView(view), nil
}

func (a *App) ImportLegacyConnections(items []connection.LegacySavedConnection) ([]connection.SavedConnectionView, error) {
	inputs := make([]connection.SavedConnectionInput, 0, len(items))
	for _, item := range items {
		input := connection.SavedConnectionInput(item)
		input.ClearPrimaryPassword = strings.TrimSpace(item.Config.Password) == ""
		input.ClearSSHPassword = strings.TrimSpace(item.Config.SSH.Password) == ""
		input.ClearProxyPassword = strings.TrimSpace(item.Config.Proxy.Password) == ""
		input.ClearHTTPTunnelPassword = strings.TrimSpace(item.Config.HTTPTunnel.Password) == ""
		input.ClearMySQLReplicaPassword = strings.TrimSpace(item.Config.MySQLReplicaPassword) == ""
		input.ClearMongoReplicaPassword = strings.TrimSpace(item.Config.MongoReplicaPassword) == ""
		input.ClearOpaqueURI = strings.TrimSpace(item.Config.URI) == ""
		input.ClearOpaqueDSN = strings.TrimSpace(item.Config.DSN) == ""
		inputs = append(inputs, input)
	}
	views, err := a.importSavedConnectionsAtomically(inputs)
	if err != nil {
		return nil, err
	}
	return sanitizeSavedConnectionViews(views), nil
}

func (a *App) SaveGlobalProxy(input connection.SaveGlobalProxyInput) (connection.GlobalProxyView, error) {
	return a.saveGlobalProxy(input)
}

func (a *App) ImportLegacyGlobalProxy(input connection.LegacyGlobalProxyInput) (connection.GlobalProxyView, error) {
	return a.saveGlobalProxy(connection.SaveGlobalProxyInput(input))
}
