package app

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestConnectionPackageCryptoRoundTrip(t *testing.T) {
	payload := connectionPackagePayload{
		ExportedAt: "2026-04-10T12:00:00+08:00",
		Connections: []connectionPackageItem{
			{
				ID:               "conn-1",
				Name:             "local-mysql",
				IncludeDatabases: []string{"app"},
				IconType:         "database",
				IconColor:        "#2f855a",
				Config: connection.ConnectionConfig{
					Type:     "mysql",
					Host:     "127.0.0.1",
					Port:     3306,
					User:     "root",
					Database: "app",
				},
			},
		},
	}

	file, err := encryptConnectionPackage(payload, "strong-password")
	if err != nil {
		t.Fatalf("encryptConnectionPackage returned error: %v", err)
	}

	raw, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("json.Marshal envelope returned error: %v", err)
	}
	if !isConnectionPackageEnvelope(string(raw)) {
		t.Fatalf("isConnectionPackageEnvelope should return true for valid envelope")
	}

	var decoded connectionPackageFile
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("json.Unmarshal envelope returned error: %v", err)
	}

	got, err := decryptConnectionPackage(decoded, "strong-password")
	if err != nil {
		t.Fatalf("decryptConnectionPackage returned error: %v", err)
	}
	if !reflect.DeepEqual(got, payload) {
		t.Fatalf("round-trip mismatch: got=%+v want=%+v", got, payload)
	}
}

func TestConnectionPackageDecryptWrongPasswordReturnsUnifiedError(t *testing.T) {
	payload := connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-1",
				Name: "test",
				Config: connection.ConnectionConfig{
					Type: "mysql",
				},
			},
		},
	}

	file, err := encryptConnectionPackage(payload, "correct-password")
	if err != nil {
		t.Fatalf("encryptConnectionPackage returned error: %v", err)
	}

	_, err = decryptConnectionPackage(file, "wrong-password")
	if !errors.Is(err, errConnectionPackageDecryptFailed) {
		t.Fatalf("wrong password should return unified error, got: %v", err)
	}
}

func TestConnectionPackageDecryptTamperedHeaderFailsAADValidation(t *testing.T) {
	payload := connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-1",
				Name: "test",
				Config: connection.ConnectionConfig{
					Type: "mysql",
				},
			},
		},
	}

	file, err := encryptConnectionPackage(payload, "correct-password")
	if err != nil {
		t.Fatalf("encryptConnectionPackage returned error: %v", err)
	}

	t.Run("cipher", func(t *testing.T) {
		tampered := file
		tampered.Nonce = "AAAAAAAAAAAAAAAA"
		_, err := decryptConnectionPackage(tampered, "correct-password")
		if !errors.Is(err, errConnectionPackageDecryptFailed) {
			t.Fatalf("tampered nonce should fail with unified error, got: %v", err)
		}
	})

	t.Run("kdf-salt", func(t *testing.T) {
		tampered := file
		tampered.KDF.Salt = "AAAAAAAAAAAAAAAAAAAAAA=="
		_, err := decryptConnectionPackage(tampered, "correct-password")
		if !errors.Is(err, errConnectionPackageDecryptFailed) {
			t.Fatalf("tampered kdf salt should fail with unified error, got: %v", err)
		}
	})
}

func TestConnectionPackagePasswordRequired(t *testing.T) {
	payload := connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-1",
				Name: "test",
				Config: connection.ConnectionConfig{
					Type: "mysql",
				},
			},
		},
	}

	_, err := encryptConnectionPackage(payload, "   ")
	if !errors.Is(err, errConnectionPackagePasswordRequired) {
		t.Fatalf("encryptConnectionPackage should return password required error, got: %v", err)
	}

	_, err = decryptConnectionPackage(connectionPackageFile{}, "   ")
	if !errors.Is(err, errConnectionPackagePasswordRequired) {
		t.Fatalf("decryptConnectionPackage should return password required error, got: %v", err)
	}
}

func TestConnectionPackageDecryptUnsupportedHeaderReturnsUnsupportedError(t *testing.T) {
	payload := connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-1",
				Name: "test",
				Config: connection.ConnectionConfig{
					Type: "mysql",
				},
			},
		},
	}

	file, err := encryptConnectionPackage(payload, "correct-password")
	if err != nil {
		t.Fatalf("encryptConnectionPackage returned error: %v", err)
	}

	t.Run("schemaVersion", func(t *testing.T) {
		tampered := file
		tampered.SchemaVersion = tampered.SchemaVersion + 1
		_, err := decryptConnectionPackage(tampered, "correct-password")
		if !errors.Is(err, errConnectionPackageUnsupported) {
			t.Fatalf("unsupported schemaVersion should return unsupported error, got: %v", err)
		}
	})

	t.Run("kind", func(t *testing.T) {
		tampered := file
		tampered.Kind = "other_connection_package"
		_, err := decryptConnectionPackage(tampered, "correct-password")
		if !errors.Is(err, errConnectionPackageUnsupported) {
			t.Fatalf("unsupported kind should return unsupported error, got: %v", err)
		}
	})

	t.Run("cipher", func(t *testing.T) {
		tampered := file
		tampered.Cipher = "AES-128-GCM"
		_, err := decryptConnectionPackage(tampered, "correct-password")
		if !errors.Is(err, errConnectionPackageUnsupported) {
			t.Fatalf("unsupported cipher should return unsupported error, got: %v", err)
		}
	})

	t.Run("kdf-name", func(t *testing.T) {
		tampered := file
		tampered.KDF.Name = "PBKDF2"
		_, err := decryptConnectionPackage(tampered, "correct-password")
		if !errors.Is(err, errConnectionPackageUnsupported) {
			t.Fatalf("unsupported kdf name should return unsupported error, got: %v", err)
		}
	})
}

func TestValidateConnectionPackageKDFSpecRejectsOversizedParams(t *testing.T) {
	t.Run("memory", func(t *testing.T) {
		spec := defaultConnectionPackageKDFSpec()
		spec.MemoryKiB = connectionPackageKDFMaxMemoryKiB + 1
		if err := validateConnectionPackageKDFSpec(spec); !errors.Is(err, errConnectionPackageUnsupported) {
			t.Fatalf("oversized memory should return unsupported error, got: %v", err)
		}
	})

	t.Run("timeCost", func(t *testing.T) {
		spec := defaultConnectionPackageKDFSpec()
		spec.TimeCost = connectionPackageKDFMaxTimeCost + 1
		if err := validateConnectionPackageKDFSpec(spec); !errors.Is(err, errConnectionPackageUnsupported) {
			t.Fatalf("oversized timeCost should return unsupported error, got: %v", err)
		}
	})

	t.Run("parallelism", func(t *testing.T) {
		spec := defaultConnectionPackageKDFSpec()
		spec.Parallelism = connectionPackageKDFMaxParallelism + 1
		if err := validateConnectionPackageKDFSpec(spec); !errors.Is(err, errConnectionPackageUnsupported) {
			t.Fatalf("oversized parallelism should return unsupported error, got: %v", err)
		}
	})
}

func TestDecryptConnectionPackagePlaintextRejectsOversizedPayload(t *testing.T) {
	nonce := base64.StdEncoding.EncodeToString(make([]byte, connectionPackageNonceBytes))
	salt := base64.StdEncoding.EncodeToString(make([]byte, connectionPackageSaltBytes))
	payload := base64.StdEncoding.EncodeToString(make([]byte, connectionPackageMaxCiphertextBytes+1))

	file := connectionPackageFile{
		SchemaVersion: connectionPackageSchemaVersion,
		Kind:          connectionPackageKind,
		Cipher:        connectionPackageCipher,
		KDF: connectionPackageKDFSpec{
			Name:        connectionPackageKDFName,
			MemoryKiB:   connectionPackageKDFDefaultMemoryKiB,
			TimeCost:    connectionPackageKDFDefaultTimeCost,
			Parallelism: connectionPackageKDFDefaultParallelism,
			Salt:        salt,
		},
		Nonce:   nonce,
		Payload: payload,
	}

	_, err := decryptConnectionPackagePlaintext(file, "correct-password")
	if !errors.Is(err, errConnectionPackagePayloadTooLarge) {
		t.Fatalf("oversized payload should return errConnectionPackagePayloadTooLarge, got: %v", err)
	}
}

func TestDecryptConnectionPackagePlaintextRejectsOversizedBase64PayloadBeforeDecode(t *testing.T) {
	nonce := base64.StdEncoding.EncodeToString(make([]byte, connectionPackageNonceBytes))

	file := connectionPackageFile{
		SchemaVersion: connectionPackageSchemaVersion,
		Kind:          connectionPackageKind,
		Cipher:        connectionPackageCipher,
		KDF: connectionPackageKDFSpec{
			Name:        connectionPackageKDFName,
			MemoryKiB:   connectionPackageKDFDefaultMemoryKiB,
			TimeCost:    connectionPackageKDFDefaultTimeCost,
			Parallelism: connectionPackageKDFDefaultParallelism,
			Salt:        base64.StdEncoding.EncodeToString(make([]byte, connectionPackageSaltBytes)),
		},
		Nonce:   nonce,
		Payload: strings.Repeat("A", connectionPackageMaxPayloadBase64Bytes+4),
	}

	_, err := decryptConnectionPackagePlaintext(file, "correct-password")
	if !errors.Is(err, errConnectionPackagePayloadTooLarge) {
		t.Fatalf("oversized base64 payload should return errConnectionPackagePayloadTooLarge, got: %v", err)
	}
}

func TestEncryptConnectionPackageRejectsOversizedPayload(t *testing.T) {
	_, err := encryptConnectionPackage(connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-large",
				Name: strings.Repeat("x", connectionPackageMaxCiphertextBytes),
				Config: connection.ConnectionConfig{
					ID:   "conn-large",
					Type: "postgres",
					Host: "db.large.local",
					Port: 5432,
					User: "postgres",
				},
			},
		},
	}, "correct-password")
	if !errors.Is(err, errConnectionPackagePayloadTooLarge) {
		t.Fatalf("oversized export payload should return errConnectionPackagePayloadTooLarge, got: %v", err)
	}
}
