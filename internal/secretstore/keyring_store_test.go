package secretstore

import (
	"errors"
	"testing"

	"github.com/99designs/keyring"
)

func TestBuildRefRejectsEmptyKind(t *testing.T) {
	t.Parallel()

	if _, err := BuildRef("", "secret-id"); err == nil {
		t.Fatal("BuildRef should reject an empty kind")
	}
}

func TestBuildRefRejectsEmptyID(t *testing.T) {
	t.Parallel()

	if _, err := BuildRef("database", ""); err == nil {
		t.Fatal("BuildRef should reject an empty id")
	}
}

func TestUnavailableStoreHealthCheckReturnsUnavailableError(t *testing.T) {
	t.Parallel()

	store := NewUnavailableStore("keyring backend disabled")

	err := store.HealthCheck()
	if err == nil {
		t.Fatal("HealthCheck should return an unavailable error")
	}

	if !IsUnavailable(err) {
		t.Fatalf("HealthCheck error should be detected by IsUnavailable, got %T", err)
	}
}

func TestKeyringStoreHealthCheckTreatsMissingProbeItemAsHealthy(t *testing.T) {
	t.Parallel()

	store := &keyringStore{ring: fakeKeyringClient{getErr: keyring.ErrKeyNotFound}}
	if err := store.HealthCheck(); err != nil {
		t.Fatalf("HealthCheck should accept ErrKeyNotFound, got %v", err)
	}
}

func TestKeyringStoreHealthCheckReturnsUnavailableErrorOnBackendFailure(t *testing.T) {
	t.Parallel()

	store := &keyringStore{ring: fakeKeyringClient{getErr: errors.New("backend offline")}}
	if err := store.HealthCheck(); err == nil || !IsUnavailable(err) {
		t.Fatalf("HealthCheck should wrap backend failures as unavailable, got %v", err)
	}
}

func TestNewKeyringStoreReturnsUnavailableStoreWhenOpenFails(t *testing.T) {
	t.Parallel()

	store := newKeyringStoreWithOpener("windows", func(cfg keyring.Config) (keyring.Keyring, error) {
		if len(cfg.AllowedBackends) != 1 || cfg.AllowedBackends[0] != keyring.WinCredBackend {
			t.Fatalf("unexpected backend config: %#v", cfg.AllowedBackends)
		}
		return nil, errors.New("no backend")
	})

	if err := store.HealthCheck(); err == nil || !IsUnavailable(err) {
		t.Fatalf("expected unavailable store when open fails, got %v", err)
	}
}

type fakeKeyringClient struct {
	getErr    error
	item      keyring.Item
	removeErr error
}

func (f fakeKeyringClient) Get(string) (keyring.Item, error) {
	if f.getErr != nil {
		return keyring.Item{}, f.getErr
	}
	return f.item, nil
}

func (f fakeKeyringClient) Set(item keyring.Item) error {
	_ = item
	return nil
}

func (f fakeKeyringClient) Remove(string) error {
	return f.removeErr
}

func (f fakeKeyringClient) GetMetadata(string) (keyring.Metadata, error) {
	return keyring.Metadata{}, nil
}

func (f fakeKeyringClient) Keys() ([]string, error) {
	return nil, nil
}
