package app

import (
	"errors"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const (
	connectionPackageSchemaVersion = 1
	connectionPackageKind          = "gonavi_connection_package"
	connectionPackageCipher        = "AES-256-GCM"
	connectionPackageKDFName       = "Argon2id"
	connectionPackageExtension     = ".gonavi-conn"

	connectionPackageKDFDefaultMemoryKiB   = 65536
	connectionPackageKDFDefaultTimeCost    = 3
	connectionPackageKDFDefaultParallelism = 4

	connectionPackageKDFMaxMemoryKiB   = 262144
	connectionPackageKDFMaxTimeCost    = 10
	connectionPackageKDFMaxParallelism = 16

	connectionPackageMaxCiphertextBytes    = 16 * 1024 * 1024
	connectionPackageMaxPayloadBase64Bytes = ((connectionPackageMaxCiphertextBytes + 2) / 3) * 4
	connectionImportMaxFileBytes           = connectionPackageMaxPayloadBase64Bytes + (1 * 1024 * 1024)
)

var (
	errConnectionPackagePasswordRequired = errors.New("恢复包密码不能为空")
	errConnectionPackageDecryptFailed    = errors.New("文件密码错误或文件已损坏")
	errConnectionPackageUnsupported      = errors.New("不支持的连接恢复包格式")
	errConnectionImportFileTooLarge      = errors.New("连接导入文件过大")
	errConnectionPackagePayloadTooLarge  = errors.New("连接恢复包过大")
	errConnectionPackageNotImplemented   = errors.New("connection package not implemented")
)

type connectionPackageFile struct {
	SchemaVersion int                      `json:"schemaVersion"`
	Kind          string                   `json:"kind"`
	Cipher        string                   `json:"cipher"`
	KDF           connectionPackageKDFSpec `json:"kdf"`
	Nonce         string                   `json:"nonce"`
	Payload       string                   `json:"payload"`
}

type connectionPackageKDFSpec struct {
	Name        string `json:"name"`
	MemoryKiB   uint32 `json:"memoryKiB"`
	TimeCost    uint32 `json:"timeCost"`
	Parallelism uint8  `json:"parallelism"`
	Salt        string `json:"salt"`
}

type connectionPackagePayload struct {
	ExportedAt  string                  `json:"exportedAt,omitempty"`
	Connections []connectionPackageItem `json:"connections"`
}

type connectionPackageItem struct {
	ID                    string                      `json:"id"`
	Name                  string                      `json:"name"`
	IncludeDatabases      []string                    `json:"includeDatabases,omitempty"`
	IncludeRedisDatabases []int                       `json:"includeRedisDatabases,omitempty"`
	IconType              string                      `json:"iconType,omitempty"`
	IconColor             string                      `json:"iconColor,omitempty"`
	Config                connection.ConnectionConfig `json:"config"`
	Secrets               connectionSecretBundle      `json:"secrets,omitempty"`
}

func defaultConnectionPackageKDFSpec() connectionPackageKDFSpec {
	return connectionPackageKDFSpec{
		Name:        connectionPackageKDFName,
		MemoryKiB:   connectionPackageKDFDefaultMemoryKiB,
		TimeCost:    connectionPackageKDFDefaultTimeCost,
		Parallelism: connectionPackageKDFDefaultParallelism,
	}
}

func normalizeConnectionPackagePassword(password string) string {
	return strings.TrimSpace(password)
}
