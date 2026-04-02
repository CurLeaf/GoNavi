package secretstore

import (
	"errors"
	"fmt"
	"runtime"

	"github.com/99designs/keyring"
)

type keyringClient interface {
	Get(key string) (keyring.Item, error)
	Set(item keyring.Item) error
	Remove(key string) error
}

type keyringStore struct {
	ring keyringClient
}

type keyringOpener func(cfg keyring.Config) (keyring.Keyring, error)

func NewKeyringStore() SecretStore {
	return newKeyringStoreWithOpener(runtime.GOOS, keyring.Open)
}

func newKeyringStoreWithOpener(goos string, open keyringOpener) SecretStore {
	cfg, err := keyringConfigFor(goos)
	if err != nil {
		return NewUnavailableStore(err.Error())
	}

	ring, err := open(cfg)
	if err != nil {
		return NewUnavailableStore(err.Error())
	}

	return &keyringStore{ring: ring}
}

func (s *keyringStore) Put(ref string, payload []byte) error {
	return wrapKeyringError(s.ring.Set(keyring.Item{Key: ref, Data: payload}))
}

func (s *keyringStore) Get(ref string) ([]byte, error) {
	item, err := s.ring.Get(ref)
	if err != nil {
		return nil, wrapKeyringError(err)
	}
	return item.Data, nil
}

func (s *keyringStore) Delete(ref string) error {
	return wrapKeyringError(s.ring.Remove(ref))
}

func (s *keyringStore) HealthCheck() error {
	_, err := s.ring.Get(healthCheckRef)
	if err == nil || errors.Is(err, keyring.ErrKeyNotFound) {
		return nil
	}
	return wrapKeyringError(err)
}

func wrapKeyringError(err error) error {
	if err == nil || errors.Is(err, keyring.ErrKeyNotFound) || IsUnavailable(err) {
		return err
	}
	return &UnavailableError{Reason: err.Error()}
}

func keyringConfigFor(goos string) (keyring.Config, error) {
	backends := allowedBackendsFor(goos)
	if len(backends) == 0 {
		return keyring.Config{}, fmt.Errorf("unsupported keyring platform: %s", goos)
	}

	return keyring.Config{
		ServiceName:                    serviceName,
		AllowedBackends:                backends,
		KeychainTrustApplication:       true,
		KeychainAccessibleWhenUnlocked: true,
		LibSecretCollectionName:        "default",
		KeyCtlScope:                    "user",
		WinCredPrefix:                  serviceName,
	}, nil
}

func allowedBackendsFor(goos string) []keyring.BackendType {
	switch goos {
	case "windows":
		return []keyring.BackendType{keyring.WinCredBackend}
	case "darwin":
		return []keyring.BackendType{keyring.KeychainBackend}
	case "linux":
		return []keyring.BackendType{
			keyring.SecretServiceBackend,
			keyring.KWalletBackend,
			keyring.KeyCtlBackend,
		}
	default:
		return nil
	}
}
