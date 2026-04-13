package aiservice

import (
	stdRuntime "runtime"

	"GoNavi-Wails/internal/dailysecret"
)

var aiRuntimeGOOS = func() string {
	return stdRuntime.GOOS
}

func (s *Service) dailySecretStore() *dailysecret.Store {
	return dailysecret.NewStore(s.configDir)
}

func shouldReadLegacyProviderSecretStore() bool {
	return aiRuntimeGOOS() != "darwin"
}
