package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	connectionPackageAES256KeyBytes = 32
	connectionPackageSaltBytes      = 16
	connectionPackageNonceBytes     = 12
)

type connectionPackageAAD struct {
	SchemaVersion int                      `json:"schemaVersion"`
	Kind          string                   `json:"kind"`
	Cipher        string                   `json:"cipher"`
	KDF           connectionPackageKDFSpec `json:"kdf"`
	Nonce         string                   `json:"nonce"`
}

func encryptConnectionPackage(payload connectionPackagePayload, password string) (connectionPackageFile, error) {
	normalizedPassword := normalizeConnectionPackagePassword(password)
	if normalizedPassword == "" {
		return connectionPackageFile{}, errConnectionPackagePasswordRequired
	}

	plain, err := json.Marshal(payload)
	if err != nil {
		return connectionPackageFile{}, err
	}

	salt := make([]byte, connectionPackageSaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return connectionPackageFile{}, err
	}
	nonce := make([]byte, connectionPackageNonceBytes)
	if _, err := rand.Read(nonce); err != nil {
		return connectionPackageFile{}, err
	}

	file := connectionPackageFile{
		SchemaVersion: connectionPackageSchemaVersion,
		Kind:          connectionPackageKind,
		Cipher:        connectionPackageCipher,
		KDF:           defaultConnectionPackageKDFSpec(),
		Nonce:         base64.StdEncoding.EncodeToString(nonce),
	}
	file.KDF.Salt = base64.StdEncoding.EncodeToString(salt)

	key, err := deriveConnectionPackageKey(normalizedPassword, file.KDF)
	if err != nil {
		return connectionPackageFile{}, err
	}
	aad, err := marshalConnectionPackageAAD(file)
	if err != nil {
		return connectionPackageFile{}, err
	}
	aead, err := newConnectionPackageAEAD(key)
	if err != nil {
		return connectionPackageFile{}, err
	}

	ciphertext := aead.Seal(nil, nonce, plain, aad)
	file.Payload = base64.StdEncoding.EncodeToString(ciphertext)
	return file, nil
}

func decryptConnectionPackage(file connectionPackageFile, password string) (connectionPackagePayload, error) {
	normalizedPassword := normalizeConnectionPackagePassword(password)
	if normalizedPassword == "" {
		return connectionPackagePayload{}, errConnectionPackagePasswordRequired
	}
	if err := validateConnectionPackageFileHeader(file); err != nil {
		return connectionPackagePayload{}, err
	}

	plain, err := decryptConnectionPackagePlaintext(file, normalizedPassword)
	if err != nil {
		return connectionPackagePayload{}, errConnectionPackageDecryptFailed
	}

	var payload connectionPackagePayload
	if err := json.Unmarshal(plain, &payload); err != nil {
		return connectionPackagePayload{}, errConnectionPackageDecryptFailed
	}
	return payload, nil
}

func isConnectionPackageEnvelope(raw string) bool {
	file, err := decodeConnectionPackageEnvelope(raw)
	if err != nil {
		return false
	}
	return file.Kind == connectionPackageKind
}

func encodeConnectionPackageEnvelope(file connectionPackageFile) (string, error) {
	raw, err := json.Marshal(file)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func decodeConnectionPackageEnvelope(raw string) (connectionPackageFile, error) {
	var file connectionPackageFile
	if err := json.Unmarshal([]byte(raw), &file); err != nil {
		return connectionPackageFile{}, err
	}
	return file, nil
}

func decryptConnectionPackagePlaintext(file connectionPackageFile, password string) ([]byte, error) {
	if err := validateConnectionPackageFileHeader(file); err != nil {
		return nil, err
	}

	nonce, err := base64.StdEncoding.DecodeString(file.Nonce)
	if err != nil || len(nonce) != connectionPackageNonceBytes {
		return nil, errors.New("invalid nonce")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(file.Payload)
	if err != nil || len(ciphertext) == 0 {
		return nil, errors.New("invalid payload")
	}

	key, err := deriveConnectionPackageKey(password, file.KDF)
	if err != nil {
		return nil, err
	}
	aad, err := marshalConnectionPackageAAD(file)
	if err != nil {
		return nil, err
	}
	aead, err := newConnectionPackageAEAD(key)
	if err != nil {
		return nil, err
	}

	plain, err := aead.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, err
	}
	return plain, nil
}

func deriveConnectionPackageKey(password string, spec connectionPackageKDFSpec) ([]byte, error) {
	if password == "" {
		return nil, errConnectionPackagePasswordRequired
	}
	if err := validateConnectionPackageKDFSpec(spec); err != nil {
		return nil, err
	}

	salt, err := base64.StdEncoding.DecodeString(spec.Salt)
	if err != nil || len(salt) == 0 {
		return nil, errors.New("invalid salt")
	}

	key := argon2.IDKey(
		[]byte(password),
		salt,
		spec.TimeCost,
		spec.MemoryKiB,
		spec.Parallelism,
		connectionPackageAES256KeyBytes,
	)
	return key, nil
}

func marshalConnectionPackageAAD(file connectionPackageFile) ([]byte, error) {
	aad := connectionPackageAAD{
		SchemaVersion: file.SchemaVersion,
		Kind:          file.Kind,
		Cipher:        file.Cipher,
		KDF:           file.KDF,
		Nonce:         file.Nonce,
	}
	return json.Marshal(aad)
}

func newConnectionPackageAEAD(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func validateConnectionPackageFileHeader(file connectionPackageFile) error {
	switch {
	case file.SchemaVersion != connectionPackageSchemaVersion:
		return errConnectionPackageUnsupported
	case strings.TrimSpace(file.Kind) != connectionPackageKind:
		return errConnectionPackageUnsupported
	case strings.TrimSpace(file.Cipher) != connectionPackageCipher:
		return errConnectionPackageUnsupported
	case validateConnectionPackageKDFSpec(file.KDF) != nil:
		return errConnectionPackageUnsupported
	default:
		return nil
	}
}

func validateConnectionPackageKDFSpec(spec connectionPackageKDFSpec) error {
	switch {
	case strings.TrimSpace(spec.Name) != connectionPackageKDFName:
		return errConnectionPackageUnsupported
	case spec.MemoryKiB == 0 || spec.TimeCost == 0 || spec.Parallelism == 0:
		return errConnectionPackageUnsupported
	case spec.MemoryKiB > connectionPackageKDFMaxMemoryKiB:
		return errConnectionPackageUnsupported
	case spec.TimeCost > connectionPackageKDFMaxTimeCost:
		return errConnectionPackageUnsupported
	case spec.Parallelism > connectionPackageKDFMaxParallelism:
		return errConnectionPackageUnsupported
	default:
		return nil
	}
}
