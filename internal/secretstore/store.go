package secretstore

import (
	"errors"
	"fmt"
	"strings"
)

const (
	serviceName    = "gonavi"
	healthCheckRef = "oskeyring://gonavi/healthcheck/ping"
)

type SecretStore interface {
	Put(ref string, payload []byte) error
	Get(ref string) ([]byte, error)
	Delete(ref string) error
	HealthCheck() error
}

type StoreStatus string

const (
	StatusAvailable   StoreStatus = "available"
	StatusUnavailable StoreStatus = "unavailable"
)

type UnavailableError struct {
	Reason string
}

func (e *UnavailableError) Error() string {
	reason := strings.TrimSpace(e.Reason)
	if reason == "" {
		return "secret store unavailable"
	}
	return fmt.Sprintf("secret store unavailable: %s", reason)
}

func IsUnavailable(err error) bool {
	var target *UnavailableError
	return errors.As(err, &target)
}

type unavailableStore struct {
	err error
}

func NewUnavailableStore(reason string) SecretStore {
	return unavailableStore{err: &UnavailableError{Reason: strings.TrimSpace(reason)}}
}

func (s unavailableStore) Put(string, []byte) error {
	return s.err
}

func (s unavailableStore) Get(string) ([]byte, error) {
	return nil, s.err
}

func (s unavailableStore) Delete(string) error {
	return s.err
}

func (s unavailableStore) HealthCheck() error {
	return s.err
}

func BuildRef(kind, id string) (string, error) {
	kind = strings.TrimSpace(kind)
	id = strings.TrimSpace(id)
	if kind == "" || id == "" {
		return "", fmt.Errorf("invalid secret ref")
	}
	return fmt.Sprintf("oskeyring://%s/%s/%s", serviceName, kind, id), nil
}
