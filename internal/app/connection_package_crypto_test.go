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

func TestConnectionPackageV2AppManagedRoundTrip(t *testing.T) {
	payload := connectionPackagePayload{
		ExportedAt: "2026-04-11T12:00:00Z",
		Connections: []connectionPackageItem{
			{
				ID:   "conn-v2-1",
				Name: "app-managed",
				Config: connection.ConnectionConfig{
					ID:       "conn-v2-1",
					Type:     "postgres",
					Host:     "db.local",
					Port:     5432,
					User:     "postgres",
					Database: "app",
				},
				Secrets: connectionSecretBundle{
					Password:    "primary-secret",
					SSHPassword: "ssh-secret",
					OpaqueURI:   "postgres://postgres:primary-secret@db.local/app",
				},
			},
		},
	}

	file, err := encryptConnectionPackageV2AppManaged(payload)
	if err != nil {
		t.Fatalf("encryptConnectionPackageV2AppManaged returned error: %v", err)
	}
	if file.V != connectionPackageSchemaVersionV2 {
		t.Fatalf("expected v2 schema, got %d", file.V)
	}
	if file.P != connectionPackageProtectionAppManaged {
		t.Fatalf("expected p=1, got %d", file.P)
	}
	if len(file.Connections) != 1 {
		t.Fatalf("expected 1 connection, got %d", len(file.Connections))
	}
	if file.Connections[0].Secrets.Password == payload.Connections[0].Secrets.Password {
		t.Fatal("expected p=1 secrets to stay encrypted in file")
	}

	raw, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}
	if !isConnectionPackageV2AppManaged(string(raw)) {
		t.Fatal("expected raw v2 p=1 payload to be detected")
	}
	if isConnectionPackageEnvelope(string(raw)) {
		t.Fatal("v2 p=1 payload must not be misclassified as v1 envelope")
	}
	rawString := string(raw)
	for _, forbidden := range []string{
		"schemaVersion",
		"cipher",
		"protectionLevel",
		"ENC:",
		"primary-secret",
		"ssh-secret",
		"postgres://postgres:primary-secret@db.local/app",
	} {
		if strings.Contains(rawString, forbidden) {
			t.Fatalf("v2 p=1 payload must not contain %q: %s", forbidden, rawString)
		}
	}

	got, err := decryptConnectionPackageV2AppManaged(file)
	if err != nil {
		t.Fatalf("decryptConnectionPackageV2AppManaged returned error: %v", err)
	}
	if !reflect.DeepEqual(got, payload) {
		t.Fatalf("round-trip mismatch: got=%+v want=%+v", got, payload)
	}
}

func TestConnectionPackageV2ProtectedRoundTrip(t *testing.T) {
	payload := connectionPackagePayload{
		ExportedAt: "2026-04-11T12:00:00Z",
		Connections: []connectionPackageItem{
			{
				ID:   "conn-v2-2",
				Name: "password-protected",
				Config: connection.ConnectionConfig{
					ID:       "conn-v2-2",
					Type:     "mysql",
					Host:     "db.local",
					Port:     3306,
					User:     "root",
					Database: "app",
				},
				Secrets: connectionSecretBundle{
					Password:             "primary-secret",
					SSHPassword:          "ssh-secret",
					ProxyPassword:        "proxy-secret",
					HTTPTunnelPassword:   "http-secret",
					MySQLReplicaPassword: "mysql-secret",
					MongoReplicaPassword: "mongo-secret",
					OpaqueURI:            "mysql://root:primary-secret@tcp(db.local:3306)/app",
					OpaqueDSN:            "root:primary-secret@tcp(db.local:3306)/app",
				},
			},
		},
	}

	file, err := encryptConnectionPackageV2Protected(payload, "package-password")
	if err != nil {
		t.Fatalf("encryptConnectionPackageV2Protected returned error: %v", err)
	}
	if file.V != connectionPackageSchemaVersionV2 {
		t.Fatalf("expected v2 schema, got %d", file.V)
	}
	if file.P != connectionPackageProtectionPasswordProtected {
		t.Fatalf("expected p=2, got %d", file.P)
	}
	if file.D == "" || file.NC == "" {
		t.Fatal("expected p=2 file to carry outer encrypted payload")
	}
	if strings.HasPrefix(file.D, "ENC:") {
		t.Fatalf("outer payload must not carry ENC prefix, got %q", file.D)
	}

	raw, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}
	if !isConnectionPackageV2Protected(string(raw)) {
		t.Fatal("expected raw v2 p=2 payload to be detected")
	}
	if isConnectionPackageEnvelope(string(raw)) {
		t.Fatal("v2 p=2 payload must not be misclassified as v1 envelope")
	}
	rawString := string(raw)
	for _, forbidden := range []string{
		"schemaVersion",
		"cipher",
		"protectionLevel",
		"ENC:",
		"primary-secret",
		"ssh-secret",
	} {
		if strings.Contains(rawString, forbidden) {
			t.Fatalf("v2 p=2 payload must not contain %q: %s", forbidden, rawString)
		}
	}

	got, err := decryptConnectionPackageV2Protected(file, "package-password")
	if err != nil {
		t.Fatalf("decryptConnectionPackageV2Protected returned error: %v", err)
	}
	if !reflect.DeepEqual(got, payload) {
		t.Fatalf("round-trip mismatch: got=%+v want=%+v", got, payload)
	}
}

func TestConnectionPackageV2ProtectedWrongPasswordReturnsUnifiedError(t *testing.T) {
	file, err := encryptConnectionPackageV2Protected(connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-v2-3",
				Name: "wrong-password",
				Config: connection.ConnectionConfig{
					ID:   "conn-v2-3",
					Type: "postgres",
				},
				Secrets: connectionSecretBundle{
					Password: "primary-secret",
				},
			},
		},
	}, "correct-password")
	if err != nil {
		t.Fatalf("encryptConnectionPackageV2Protected returned error: %v", err)
	}

	_, err = decryptConnectionPackageV2Protected(file, "wrong-password")
	if !errors.Is(err, errConnectionPackageDecryptFailed) {
		t.Fatalf("wrong p=2 password should return unified error, got: %v", err)
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
