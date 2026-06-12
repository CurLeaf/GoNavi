package app

import (
	"crypto/aes"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"
)

func TestImportConnectionsPayloadNavicatNCXImportsConfigsAndSecrets(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	mysqlPassword := mustEncryptNavicatV1(t, "mysql-secret")
	postgresPassword := mustEncryptNavicatV2(t, "pg-secret")
	sshPassword := mustEncryptNavicatV1(t, "ssh-secret")
	proxyPassword := mustEncryptNavicatV2(t, "proxy-secret")

	raw := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Connections>
  <Connection ConnType="MYSQL" ConnectionName="Primary MySQL" Host="127.0.0.1" Port="3307" Database="demo" UserName="root" Password="%s" SavePassword="true" />
  <Connection ConnType="POSTGRESQL" ConnectionName="Reporting PG" Host="pg.local" Port="5433" Database="reporting" UserName="analyst" Password="%s" SavePassword="true" SSL="true" SSL_PGSSLMode="REQUIRE" SSL_CACert="/etc/ssl/ca.pem" SSH="true" SSH_Host="jump.local" SSH_Port="2222" SSH_UserName="ops" SSH_Password="%s" SSH_SavePassword="true" HTTP_Proxy="true" HTTP_Proxy_Host="proxy.local" HTTP_Proxy_Port="8088" HTTP_Proxy_UserName="proxy-user" HTTP_Proxy_Password="%s" HTTP_Proxy_SavePassword="true" />
  <Connection ConnType="SQLITE" ConnectionName="History DB" DatabaseFileName="C:\navicat\history.db" />
</Connections>`, mysqlPassword, postgresPassword, sshPassword, proxyPassword)

	imported, err := app.ImportConnectionsPayload(raw, "")
	if err != nil {
		t.Fatalf("ImportConnectionsPayload returned error: %v", err)
	}
	if len(imported) != 3 {
		t.Fatalf("expected 3 imported connections, got %d", len(imported))
	}

	mysqlConn := imported[0]
	if mysqlConn.Name != "Primary MySQL" {
		t.Fatalf("expected mysql connection name, got %q", mysqlConn.Name)
	}
	if mysqlConn.Config.Type != "mysql" {
		t.Fatalf("expected mysql config type, got %q", mysqlConn.Config.Type)
	}
	if !mysqlConn.HasPrimaryPassword {
		t.Fatal("expected mysql connection password flag")
	}
	resolvedMySQL, err := app.resolveConnectionSecrets(mysqlConn.Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets for mysql returned error: %v", err)
	}
	if resolvedMySQL.Password != "mysql-secret" {
		t.Fatalf("expected mysql password, got %q", resolvedMySQL.Password)
	}
	if resolvedMySQL.Host != "127.0.0.1" || resolvedMySQL.Port != 3307 || resolvedMySQL.Database != "demo" {
		t.Fatalf("expected mysql host/port/database to survive import, got %#v", resolvedMySQL)
	}

	postgresConn := imported[1]
	if postgresConn.Config.Type != "postgres" {
		t.Fatalf("expected postgres config type, got %q", postgresConn.Config.Type)
	}
	if !postgresConn.HasPrimaryPassword || !postgresConn.HasSSHPassword || !postgresConn.HasProxyPassword {
		t.Fatalf("expected postgres connection to keep primary/ssh/proxy secrets, got %#v", postgresConn)
	}
	if !postgresConn.Config.UseSSL || postgresConn.Config.SSLMode != "required" || postgresConn.Config.SSLCAPath != "/etc/ssl/ca.pem" {
		t.Fatalf("expected postgres SSL settings to survive import, got %#v", postgresConn.Config)
	}
	if !postgresConn.Config.UseSSH || postgresConn.Config.SSH.Host != "jump.local" || postgresConn.Config.SSH.Port != 2222 || postgresConn.Config.SSH.User != "ops" {
		t.Fatalf("expected postgres SSH settings to survive import, got %#v", postgresConn.Config.SSH)
	}
	if !postgresConn.Config.UseProxy || postgresConn.Config.Proxy.Type != "http" || postgresConn.Config.Proxy.Host != "proxy.local" || postgresConn.Config.Proxy.Port != 8088 || postgresConn.Config.Proxy.User != "proxy-user" {
		t.Fatalf("expected postgres proxy settings to survive import, got %#v", postgresConn.Config.Proxy)
	}
	resolvedPostgres, err := app.resolveConnectionSecrets(postgresConn.Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets for postgres returned error: %v", err)
	}
	if resolvedPostgres.Password != "pg-secret" {
		t.Fatalf("expected postgres password, got %q", resolvedPostgres.Password)
	}
	if resolvedPostgres.SSH.Password != "ssh-secret" {
		t.Fatalf("expected ssh password, got %q", resolvedPostgres.SSH.Password)
	}
	if resolvedPostgres.Proxy.Password != "proxy-secret" {
		t.Fatalf("expected proxy password, got %q", resolvedPostgres.Proxy.Password)
	}

	sqliteConn := imported[2]
	if sqliteConn.Config.Type != "sqlite" {
		t.Fatalf("expected sqlite config type, got %q", sqliteConn.Config.Type)
	}
	if sqliteConn.Config.Host != `C:\navicat\history.db` || sqliteConn.Config.Database != `C:\navicat\history.db` {
		t.Fatalf("expected sqlite file path to survive import, got %#v", sqliteConn.Config)
	}
}

func TestImportConnectionsPayloadNavicatNCXRejectsUndecryptableSavedPassword(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	raw := `<?xml version="1.0" encoding="UTF-8"?>
<Connections>
  <Connection ConnType="MYSQL" ConnectionName="Broken" Host="127.0.0.1" Port="3306" UserName="root" Password="FFFF" SavePassword="true" />
</Connections>`

	_, err := app.ImportConnectionsPayload(raw, "")
	if err == nil {
		t.Fatal("expected invalid Navicat password import to fail")
	}
	if got := err.Error(); got == "" || !strings.Contains(got, "Navicat") && !strings.Contains(got, "密码") {
		t.Fatalf("expected navicat password error, got %v", err)
	}
}

func TestImportConnectionsPayloadNavicatNCXMapsOracleSIDAndRedisDB(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	oraclePassword := mustEncryptNavicatV2(t, "oracle-secret")
	redisPassword := mustEncryptNavicatV1(t, "redis-secret")

	raw := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Connections>
  <Connection ConnType="ORACLE" ConnectionName="Oracle SID" Host="oracle.local" Port="1521" Database="ORCL" OraServiceNameType="SID" UserName="system" Password="%s" SavePassword="true" />
  <Connection ConnType="REDIS" ConnectionName="Redis Cache" Host="redis.local" Port="6379" Database="5" UserName="default" Password="%s" SavePassword="true" />
</Connections>`, oraclePassword, redisPassword)

	imported, err := app.ImportConnectionsPayload(raw, "")
	if err != nil {
		t.Fatalf("ImportConnectionsPayload returned error: %v", err)
	}
	if len(imported) != 2 {
		t.Fatalf("expected 2 imported connections, got %d", len(imported))
	}

	oracleConn := imported[0]
	if oracleConn.Config.Type != "oracle" || oracleConn.Config.ConnectionParams != "SID=ORCL" {
		t.Fatalf("expected oracle SID connection params, got %#v", oracleConn.Config)
	}
	resolvedOracle, err := app.resolveConnectionSecrets(oracleConn.Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets for oracle returned error: %v", err)
	}
	if resolvedOracle.Password != "oracle-secret" {
		t.Fatalf("expected oracle password, got %q", resolvedOracle.Password)
	}

	redisConn := imported[1]
	if redisConn.Config.Type != "redis" || redisConn.Config.RedisDB != 5 {
		t.Fatalf("expected redis db index to survive import, got %#v", redisConn.Config)
	}
	resolvedRedis, err := app.resolveConnectionSecrets(redisConn.Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets for redis returned error: %v", err)
	}
	if resolvedRedis.Password != "redis-secret" {
		t.Fatalf("expected redis password, got %q", resolvedRedis.Password)
	}
}

func mustEncryptNavicatV1(t *testing.T, value string) string {
	t.Helper()
	cryptoV1, err := newNavicatCryptoV1()
	if err != nil {
		t.Fatalf("newNavicatCryptoV1 returned error: %v", err)
	}
	return cryptoV1.encrypt([]byte(value))
}

func mustEncryptNavicatV2(t *testing.T, value string) string {
	t.Helper()
	block, err := aes.NewCipher([]byte("libcckeylibcckey"))
	if err != nil {
		t.Fatalf("aes.NewCipher returned error: %v", err)
	}
	plaintext := applyPKCS7Padding([]byte(value), block.BlockSize())
	currentVector := []byte("libcciv libcciv ")
	ciphertext := make([]byte, len(plaintext))
	for offset := 0; offset < len(plaintext); offset += block.BlockSize() {
		blockInput := xorBytes(plaintext[offset:offset+block.BlockSize()], currentVector)
		block.Encrypt(ciphertext[offset:offset+block.BlockSize()], blockInput)
		currentVector = ciphertext[offset : offset+block.BlockSize()]
	}
	return strings.ToUpper(hex.EncodeToString(ciphertext))
}

func (c *navicatCryptoV1) encrypt(plaintext []byte) string {
	blockSize := c.block.BlockSize()
	currentVector := append([]byte(nil), c.initialVector...)
	roundBytes := len(plaintext) / blockSize * blockSize
	ciphertext := make([]byte, 0, len(plaintext))
	encryptedBlock := make([]byte, blockSize)

	for offset := 0; offset < roundBytes; offset += blockSize {
		blockInput := xorBytes(plaintext[offset:offset+blockSize], currentVector)
		c.block.Encrypt(encryptedBlock, blockInput)
		ciphertext = append(ciphertext, encryptedBlock...)
		currentVector = xorBytes(currentVector, encryptedBlock)
	}

	if leftover := len(plaintext) - roundBytes; leftover > 0 {
		stream := make([]byte, blockSize)
		c.block.Encrypt(stream, currentVector)
		ciphertext = append(ciphertext, xorBytes(plaintext[roundBytes:], stream[:leftover])...)
	}

	return strings.ToUpper(hex.EncodeToString(ciphertext))
}

func applyPKCS7Padding(data []byte, blockSize int) []byte {
	paddingLength := blockSize - (len(data) % blockSize)
	if paddingLength == 0 {
		paddingLength = blockSize
	}
	padded := make([]byte, 0, len(data)+paddingLength)
	padded = append(padded, data...)
	for i := 0; i < paddingLength; i++ {
		padded = append(padded, byte(paddingLength))
	}
	return padded
}
