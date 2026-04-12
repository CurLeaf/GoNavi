package app

import (
	"encoding/json"
	"errors"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const (
	connectionPackageSchemaVersion   = 1
	connectionPackageSchemaVersionV2 = 2
	connectionPackageKind            = "gonavi_connection_package"
	connectionPackageCipher          = "AES-256-GCM"
	connectionPackageKDFName         = "Argon2id"
	connectionPackageKDFNameV2       = "a2id"
	connectionPackageExtension       = ".gonavi-conn"

	connectionPackageProtectionAppManaged        = 1
	connectionPackageProtectionPasswordProtected = 2

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

type connectionPackageFileV2 struct {
	V           int                     `json:"v"`
	Kind        string                  `json:"kind"`
	P           int                     `json:"p"`
	ExportedAt  string                  `json:"exportedAt,omitempty"`
	Connections []connectionPackageItem `json:"connections"`
}

type connectionPackageFileV2Protected struct {
	V    int                        `json:"v"`
	Kind string                     `json:"kind"`
	P    int                        `json:"p"`
	KDF  connectionPackageKDFSpecV2 `json:"kdf"`
	NC   string                     `json:"nc"`
	D    string                     `json:"d"`
}

type connectionPackageKDFSpecV2 struct {
	N string `json:"n"`
	M uint32 `json:"m"`
	T uint32 `json:"t"`
	L uint8  `json:"l"`
	S string `json:"s"`
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

func (i connectionPackageItem) MarshalJSON() ([]byte, error) {
	type connectionPackageItemJSON struct {
		ID                    string                      `json:"id"`
		Name                  string                      `json:"name"`
		IncludeDatabases      []string                    `json:"includeDatabases,omitempty"`
		IncludeRedisDatabases []int                       `json:"includeRedisDatabases,omitempty"`
		IconType              string                      `json:"iconType,omitempty"`
		IconColor             string                      `json:"iconColor,omitempty"`
		Config                connection.ConnectionConfig `json:"config"`
		Secrets               *connectionSecretBundle     `json:"secrets,omitempty"`
	}

	item := connectionPackageItemJSON{
		ID:                    i.ID,
		Name:                  i.Name,
		IncludeDatabases:      i.IncludeDatabases,
		IncludeRedisDatabases: i.IncludeRedisDatabases,
		IconType:              i.IconType,
		IconColor:             i.IconColor,
		Config:                i.Config,
	}
	if i.Secrets.hasAny() {
		secrets := i.Secrets
		item.Secrets = &secrets
	}
	return json.Marshal(item)
}

type ConnectionExportOptions struct {
	IncludeSecrets bool   `json:"includeSecrets"`
	FilePassword   string `json:"filePassword,omitempty"`
}

func defaultConnectionPackageKDFSpec() connectionPackageKDFSpec {
	return connectionPackageKDFSpec{
		Name:        connectionPackageKDFName,
		MemoryKiB:   connectionPackageKDFDefaultMemoryKiB,
		TimeCost:    connectionPackageKDFDefaultTimeCost,
		Parallelism: connectionPackageKDFDefaultParallelism,
	}
}

func defaultConnectionPackageKDFSpecV2() connectionPackageKDFSpecV2 {
	return connectionPackageKDFSpecV2{
		N: connectionPackageKDFNameV2,
		M: connectionPackageKDFDefaultMemoryKiB,
		T: connectionPackageKDFDefaultTimeCost,
		L: connectionPackageKDFDefaultParallelism,
	}
}

func normalizeConnectionPackagePassword(password string) string {
	return strings.TrimSpace(password)
}
