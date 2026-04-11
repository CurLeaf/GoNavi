package app

import (
	"strings"

	"GoNavi-Wails/internal/connection"
)

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
	return a.importSavedConnectionsAtomically(inputs)
}

func (a *App) SaveGlobalProxy(input connection.SaveGlobalProxyInput) (connection.GlobalProxyView, error) {
	return a.saveGlobalProxy(input)
}

func (a *App) ImportLegacyGlobalProxy(input connection.LegacyGlobalProxyInput) (connection.GlobalProxyView, error) {
	return a.saveGlobalProxy(connection.SaveGlobalProxyInput(input))
}
