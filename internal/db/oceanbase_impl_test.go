//go:build gonavi_full_drivers || gonavi_oceanbase_driver

package db

import (
	"errors"
	"net"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

func TestResolveOceanBaseProtocol(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		config connection.ConnectionConfig
		want   string
	}{
		{
			name:   "default mysql",
			config: connection.ConnectionConfig{Type: "oceanbase"},
			want:   oceanBaseProtocolMySQL,
		},
		{
			name: "explicit oracle params",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "protocol=oracle",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "uri protocol oracle",
			config: connection.ConnectionConfig{
				Type: "oceanbase",
				URI:  "oceanbase://sys%40oracle001:pass@127.0.0.1:2881/ORCL?protocol=oracle",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "connection params tenant mode oracle",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "tenantMode=oracle&PREFETCH_ROWS=5000",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "connection params wins over uri",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				URI:              "oceanbase://root:pass@127.0.0.1:2881/app?protocol=oracle",
				ConnectionParams: "protocol=mysql",
			},
			want: oceanBaseProtocolMySQL,
		},
		{
			name: "explicit config protocol wins over params",
			config: connection.ConnectionConfig{
				Type:              "oceanbase",
				OceanBaseProtocol: "oracle",
				ConnectionParams:  "protocol=mysql",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "protocol key wins over compatibility aliases",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "protocol=mysql&tenantMode=oracle",
			},
			want: oceanBaseProtocolMySQL,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := resolveOceanBaseProtocol(tt.config)
			if err != nil {
				t.Fatalf("resolveOceanBaseProtocol() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("resolveOceanBaseProtocol() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestResolveOceanBaseProtocolRejectsUnsupportedNative(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		config connection.ConnectionConfig
	}{
		{
			name: "params native",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "protocol=native",
			},
		},
		{
			name: "explicit mysql does not mask params native",
			config: connection.ConnectionConfig{
				Type:              "oceanbase",
				OceanBaseProtocol: "mysql",
				ConnectionParams:  "protocol=native",
			},
		},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := resolveOceanBaseProtocol(tt.config)
			if err == nil || !strings.Contains(err.Error(), "不支持") {
				t.Fatalf("expected unsupported protocol error, got %v", err)
			}
		})
	}
}

func TestWithoutOceanBaseProtocolParamsStripsDriverMeta(t *testing.T) {
	t.Parallel()

	config := withoutOceanBaseProtocolParams(connection.ConnectionConfig{
		Type:             "oceanbase",
		URI:              "oceanbase://root:pass@127.0.0.1:2881/app?protocol=mysql&timeout=10",
		ConnectionParams: "tenantMode=oracle&PREFETCH_ROWS=5000",
	})

	if strings.Contains(config.URI, "protocol=") {
		t.Fatalf("expected URI protocol param stripped, got %q", config.URI)
	}
	if strings.Contains(config.ConnectionParams, "tenantMode=") {
		t.Fatalf("expected connection param tenantMode stripped, got %q", config.ConnectionParams)
	}
	if !strings.Contains(config.URI, "timeout=10") {
		t.Fatalf("expected URI business params kept, got %q", config.URI)
	}
	if !strings.Contains(config.ConnectionParams, "PREFETCH_ROWS=5000") {
		t.Fatalf("expected Oracle params kept, got %q", config.ConnectionParams)
	}
}

// OceanBase Oracle 租户实际通过 OBProxy 暴露的 Oracle 网络协议端口连接（走 go-ora），
// 锁定 prepareOceanBaseOracleConfig 把 oceanbase:// URI 的业务参数提升到 ConnectionParams，
// 并清理 protocol 关键字，避免泄漏到 OracleDB.getDSN。
func TestPrepareOceanBaseOracleConfigPromotesURIParams(t *testing.T) {
	t.Parallel()

	config := prepareOceanBaseOracleConfig(connection.ConnectionConfig{
		Type:              "oceanbase",
		OceanBaseProtocol: "oracle",
		Host:              "127.0.0.1",
		Port:              60014,
		User:              "SYS@oracle_tenant#cluster",
		Database:          "ORCL",
		URI:               "oceanbase://SYS%40oracle_tenant%23cluster:p@127.0.0.1:60014/ORCL?protocol=oracle&PREFETCH_ROWS=5000",
	})

	if config.Type != "oracle" {
		t.Fatalf("expected Type rewritten to oracle (for OracleDB.Connect), got %q", config.Type)
	}
	if config.URI != "" {
		t.Fatalf("expected URI cleared so OracleDB does not try to reparse oceanbase scheme, got %q", config.URI)
	}
	if strings.Contains(config.ConnectionParams, "protocol=") {
		t.Fatalf("expected protocol param stripped, got %q", config.ConnectionParams)
	}
	if !strings.Contains(config.ConnectionParams, "PREFETCH_ROWS=5000") {
		t.Fatalf("expected Oracle business param PREFETCH_ROWS promoted to ConnectionParams, got %q", config.ConnectionParams)
	}
}

// 验证 go-ora 错误信息按三类常见根因分别给出可操作的诊断提示，
// 避免用户在「mysql wire 路径」与「go-ora 路径」之间方向摇摆。
func TestAnnotateOceanBaseOracleConnectErrorClassifies(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		raw  error
		want string
	}{
		{
			name: "port unreachable",
			raw:  errors.New("dial tcp 172.16.1.155:60014: connect: connection refused"),
			want: "目标地址未响应",
		},
		{
			name: "non-oracle protocol on port (e.g. mysql wire)",
			raw:  errors.New("TNS: protocol error - got unexpected packet from server"),
			want: "MySQL wire 协议端口",
		},
		{
			name: "ora authentication error",
			raw:  errors.New("ORA-01017: invalid username/password; logon denied"),
			want: "服务名（Service Name）",
		},
		{
			name: "fallback generic wrapping",
			raw:  errors.New("some unexpected go-ora error"),
			want: "OceanBase Oracle 协议连接失败",
		},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := annotateOceanBaseOracleConnectError(tt.raw)
			if got == nil {
				t.Fatal("expected wrapped error, got nil")
			}
			if !strings.Contains(got.Error(), tt.want) {
				t.Fatalf("expected hint to contain %q, got %v", tt.want, got)
			}
		})
	}
}

// 任何 mysql 兼容数据源中含 @/#/: 的复合用户名/密码都依赖 go-sql-driver/mysql ParseDSN
// 的特殊切分算法（从右向左找最后一个 @，从左向右找首个 :）。锁定该 invariant 防止未来
// 重构 buildMySQLCompatibleDSN 时误加 url.QueryEscape 破坏认证。
func TestOceanBaseOracleDSNParsesTenantCredentials(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		config   connection.ConnectionConfig
		wantUser string
		wantPass string
	}{
		{
			name: "tenant user with @",
			config: connection.ConnectionConfig{
				Host: "127.0.0.1", Port: 2881,
				User: "sys@oracle001", Password: "pass", Database: "ORCL",
			},
			wantUser: "sys@oracle001",
			wantPass: "pass",
		},
		{
			name: "tenant user with @ and #cluster + password with @",
			config: connection.ConnectionConfig{
				Host: "127.0.0.1", Port: 2881,
				User: "sys@oracle001#cluster", Password: "p@ss", Database: "ORCL",
			},
			wantUser: "sys@oracle001#cluster",
			wantPass: "p@ss",
		},
	}

	ob := &OceanBaseDB{}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			dsn, err := ob.getDSN(tt.config)
			if err != nil {
				t.Fatalf("getDSN error: %v", err)
			}
			cfg, err := mysqlDriver.ParseDSN(dsn)
			if err != nil {
				t.Fatalf("mysql ParseDSN failed for %q: %v", dsn, err)
			}
			if cfg.User != tt.wantUser {
				t.Fatalf("user mismatch: got %q want %q (dsn=%q)", cfg.User, tt.wantUser, dsn)
			}
			if cfg.Passwd != tt.wantPass {
				t.Fatalf("password mismatch: got %q want %q (dsn=%q)", cfg.Passwd, tt.wantPass, dsn)
			}
			if cfg.DBName != tt.config.Database {
				t.Fatalf("database mismatch: got %q want %q", cfg.DBName, tt.config.Database)
			}
		})
	}
}

// buildMySQLHandshakePacket 构造一个最小化的 MySQL initial handshake packet（protocol v10），
// 用于 mock OceanBase / 通用 MySQL / OBProxy 各种 server_version 场景。
// 实际字段顺序按 MySQL 协议规范：
//
//	4 字节 header (3 字节 payload length + 1 字节 sequence id)
//	payload[0]       protocol_version (10)
//	payload[1..N]    server_version (null-terminated)
//	... (后续字段对协议探测无关，可省略)
func buildMySQLHandshakePacket(serverVersion string) []byte {
	payload := []byte{10}
	payload = append(payload, []byte(serverVersion)...)
	payload = append(payload, 0)
	// 追加几个占位字节，让 packet 看起来更像真实 handshake（探测代码并不解析这些字段）
	payload = append(payload, []byte{0x01, 0x00, 0x00, 0x00}...)
	payloadLen := len(payload)
	header := []byte{byte(payloadLen), byte(payloadLen >> 8), byte(payloadLen >> 16), 0}
	return append(header, payload...)
}

// startMockHandshakeServer 启动一个本地 TCP server，在 Accept 后立即写入一个 handshake packet，
// 然后等待客户端关闭连接。返回 server 地址（host, port）和 cleanup 函数。
func startMockHandshakeServer(t *testing.T, packet []byte) (string, int, func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen failed: %v", err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
			if packet != nil {
				_, _ = conn.Write(packet)
			}
			// 让客户端有机会读完后主动关闭
			buf := make([]byte, 16)
			_, _ = conn.Read(buf)
			_ = conn.Close()
		}
	}()
	host, portStr, _ := net.SplitHostPort(ln.Addr().String())
	port, _ := strconv.Atoi(portStr)
	cleanup := func() {
		_ = ln.Close()
		<-done
	}
	return host, port, cleanup
}

func TestProbeOceanBaseMySQLWireDetectsOceanBaseHandshake(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		serverVersion string
		wantIsOB      bool
	}{
		{name: "ob server version", serverVersion: "5.7.25-OceanBase-v4.2.1.0", wantIsOB: true},
		{name: "obproxy server version", serverVersion: "5.6.25-OBProxy-3.2.0", wantIsOB: true},
		{name: "community ob suffix", serverVersion: "5.7.25-OB", wantIsOB: true},
		{name: "regular mysql is not flagged", serverVersion: "8.0.36", wantIsOB: false},
		{name: "mariadb is not flagged", serverVersion: "10.6.12-MariaDB", wantIsOB: false},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			host, port, cleanup := startMockHandshakeServer(t, buildMySQLHandshakePacket(tt.serverVersion))
			defer cleanup()
			gotIsOB, probed := probeOceanBaseMySQLWireHandshake(host, port, time.Second)
			if !probed {
				t.Fatal("expected probe to succeed against mock server, got probed=false")
			}
			if gotIsOB != tt.wantIsOB {
				t.Fatalf("server_version=%q expected isOB=%v got %v", tt.serverVersion, tt.wantIsOB, gotIsOB)
			}
		})
	}
}

func TestProbeOceanBaseMySQLWireHandshakeReturnsFalseOnUnreachable(t *testing.T) {
	t.Parallel()

	// 用一个不可达端口（监听后立即关闭），探测应返回 probed=false 让上层继续走 go-ora 路径
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen failed: %v", err)
	}
	host, portStr, _ := net.SplitHostPort(ln.Addr().String())
	port, _ := strconv.Atoi(portStr)
	_ = ln.Close()

	gotIsOB, probed := probeOceanBaseMySQLWireHandshake(host, port, 200*time.Millisecond)
	if gotIsOB {
		t.Fatal("expected unreachable port not flagged as OB")
	}
	if probed {
		t.Fatal("expected probed=false on unreachable port so upper layer falls back to go-ora")
	}
}

// probe 放宽 protocol_version 检查后，普通 MySQL/MariaDB（server_version 不含 OB 关键字）
// 应仍判定为非 OB MySQL wire（由 regular_mysql_is_not_flagged / mariadb_is_not_flagged 子用例
// 覆盖）。原 IgnoresNonMySQLProtocol 测试因 probe 不再严格区分 mysql vs 非 mysql 而失效，已删除。

// probe 在 payload_length 落在新放宽的 65536 上限内仍能正确读取并提取 server_version。
// 模拟 OB 4.x 可能携带额外能力位、payload 略大于历史 MySQL handshake 的情况。
func TestProbeOceanBaseMySQLWireHandshakeAcceptsLargerPayload(t *testing.T) {
	t.Parallel()

	base := buildMySQLHandshakePacket("5.7.25-OceanBase-v4.2.1.0")
	// 在 packet 末尾追加 4096 字节伪能力位扩展，重写 header 的 payload_length 字段
	extra := make([]byte, 4096)
	for i := range extra {
		extra[i] = 0x42
	}
	originalPayload := base[4:]
	enlargedPayload := append(append([]byte{}, originalPayload...), extra...)
	payloadLen := len(enlargedPayload)
	header := []byte{byte(payloadLen), byte(payloadLen >> 8), byte(payloadLen >> 16), 0}
	packet := append(header, enlargedPayload...)

	host, port, cleanup := startMockHandshakeServer(t, packet)
	defer cleanup()

	gotIsOB, probed := probeOceanBaseMySQLWireHandshake(host, port, time.Second)
	if !probed {
		t.Fatal("expected probe to read full packet within new 64KB limit")
	}
	if !gotIsOB {
		t.Fatal("expected enlarged OceanBase handshake to be flagged as OB MySQL wire")
	}
}

// decodeConnectionAttributesFromConnectionParams 把 connectionAttributes 从 url-encoded 的
// ConnectionParams 中取出来并解析成 map，便于测试用解码后的值断言。
func decodeConnectionAttributesFromConnectionParams(t *testing.T, raw string) map[string]string {
	t.Helper()
	values, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatalf("ParseQuery(%q) failed: %v", raw, err)
	}
	return parseMySQLConnectionAttributes(values.Get("connectionAttributes"))
}

// ensureOceanBaseOBClientAttributes 必须默认注入 OBClient capability 候选 attribute，
// 并且用户在 ConnectionParams 里已设置的 attribute 优先级更高（不被默认值覆盖）。
func TestEnsureOceanBaseOBClientAttributesInjectsDefaults(t *testing.T) {
	t.Parallel()

	attrs := decodeConnectionAttributesFromConnectionParams(t, ensureOceanBaseOBClientAttributes(""))
	want := map[string]string{
		"_client_name":                          "OceanBase Connector/J",
		"_client_version":                       "2.4.5",
		"__ob_client_attribute_capability_flag": "1",
		"ob_capability_flag":                    "1",
	}
	for k, v := range want {
		if attrs[k] != v {
			t.Fatalf("expected default attribute %s=%q, got %q (all=%v)", k, v, attrs[k], attrs)
		}
	}
}

func TestEnsureOceanBaseOBClientAttributesPreservesUserOverrides(t *testing.T) {
	t.Parallel()

	attrs := decodeConnectionAttributesFromConnectionParams(t,
		ensureOceanBaseOBClientAttributes("connectionAttributes=_client_name:libobclient,_pid:9527"))

	if attrs["_client_name"] != "libobclient" {
		t.Fatalf("expected user-supplied _client_name preserved, got %q", attrs["_client_name"])
	}
	if attrs["_pid"] != "9527" {
		t.Fatalf("expected user extra attribute _pid preserved, got %q", attrs["_pid"])
	}
	// 仍应补齐默认值中用户未提供的部分
	if attrs["ob_capability_flag"] != "1" {
		t.Fatalf("expected default ob_capability_flag still injected when user did not set it, got %q (all=%v)", attrs["ob_capability_flag"], attrs)
	}
}

// 锁定 Oracle 协议路径下，OBClient capability attribute 会被注入到生成的 mysql DSN 中。
func TestOceanBaseOracleOBClientDSNCarriesCapabilityAttributes(t *testing.T) {
	t.Parallel()

	cfg := connection.ConnectionConfig{
		Type:     "oceanbase",
		Host:     "127.0.0.1",
		Port:     2881,
		User:     "SYS@oracle_tenant#cluster",
		Password: "x",
		Database: "ORCL",
	}
	cfg.ConnectionParams = ensureOceanBaseOBClientAttributes(cfg.ConnectionParams)
	cfg.ConnectionParams = ensureOceanBaseOracleANSIQuotes(cfg.ConnectionParams)
	ob := &OceanBaseDB{}
	dsn, err := ob.getDSN(cfg)
	if err != nil {
		t.Fatalf("getDSN error: %v", err)
	}
	parsed, err := mysqlDriver.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("ParseDSN error: %v", err)
	}
	if !strings.Contains(parsed.ConnectionAttributes, "_client_name:OceanBase Connector/J") {
		t.Fatalf("expected default _client_name in DSN, got %q", parsed.ConnectionAttributes)
	}
	if !strings.Contains(parsed.ConnectionAttributes, "ob_capability_flag:1") {
		t.Fatalf("expected default ob_capability_flag in DSN, got %q", parsed.ConnectionAttributes)
	}
	if !strings.Contains(dsn, "sql_mode=%27ANSI_QUOTES%27") {
		t.Fatalf("expected ANSI_QUOTES sys var in DSN, got %q", dsn)
	}
}

// OBClient 路径写操作仍然使用 mysql wire 风格 "?" 占位符 + Oracle 风格双引号引用标识符。
// 注意 bindConnectedDatabase 直接绑 OracleDB wrapper（OracleDB.conn 实际是 mysql wire conn），
// ApplyChanges 会走 applyOracleChangesMySQLWire。
func TestOceanBaseOracleOBClientApplyChangesUsesMySQLWirePlaceholders(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	oceanbaseDB := &OceanBaseDB{}
	oceanbaseDB.bindConnectedDatabase(dbConn, 0, oceanBaseProtocolOracle)

	changes := connection.ChangeSet{
		Updates: []connection.UpdateRow{{
			Keys:   map[string]interface{}{"ID": 7},
			Values: map[string]interface{}{"NAME": "new-name"},
		}},
	}

	if err := oceanbaseDB.ApplyChanges("APP.USERS", changes); err != nil {
		t.Fatalf("ApplyChanges() unexpected error: %v", err)
	}

	queries := state.snapshotExecQueries()
	if len(queries) != 1 {
		t.Fatalf("expected one exec query, got %#v", queries)
	}
	if strings.Contains(queries[0], ":1") {
		t.Fatalf("expected MySQL wire placeholder style, got %q", queries[0])
	}
	if !strings.Contains(queries[0], `"NAME" = ?`) || !strings.Contains(queries[0], `"ID" = ?`) {
		t.Fatalf("expected question mark placeholders + double-quoted identifiers, got %q", queries[0])
	}
}

// 用户通过 ConnectionParams 设置 connectionAttributes 时，OceanBase MySQL wire 路径必须把
// 这些 attribute 透传到 go-sql-driver/mysql DSN，让 driver 在握手响应里发 CLIENT_CONNECT_ATTRS。
// 这是 OBClient 协议握手探索的入口：高级用户/DBA 可以试错不同 attribute 组合而不需要改 GoNavi 代码。
func TestOceanBaseMySQLDSNPassesThroughConnectionAttributes(t *testing.T) {
	t.Parallel()

	cfg := connection.ConnectionConfig{
		Type:             "oceanbase",
		Host:             "127.0.0.1",
		Port:             2881,
		User:             "root@mysql_tenant",
		Password:         "root",
		Database:         "test",
		ConnectionParams: "connectionAttributes=_client_name:OceanBase Connector/J,_client_version:2.4.5",
	}
	ob := &OceanBaseDB{}
	dsn, err := ob.getDSN(cfg)
	if err != nil {
		t.Fatalf("getDSN error: %v", err)
	}
	parsed, err := mysqlDriver.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("mysql ParseDSN failed: %v", err)
	}
	if !strings.Contains(parsed.ConnectionAttributes, "_client_name:OceanBase Connector/J") {
		t.Fatalf("expected _client_name attribute in DSN, got %q", parsed.ConnectionAttributes)
	}
	if !strings.Contains(parsed.ConnectionAttributes, "_client_version:2.4.5") {
		t.Fatalf("expected _client_version attribute in DSN, got %q", parsed.ConnectionAttributes)
	}
}

// 当用户错选 MySQL 协议但租户实际是 Oracle 模式时，OceanBase 服务端返回 Error 1235，
// 我们必须在错误消息里明确指引用户切换协议，避免方向摇摆。
func TestFormatOceanBaseMySQLAttemptErrorHintsOracleProtocol(t *testing.T) {
	t.Parallel()

	got := formatOceanBaseMySQLAttemptError(
		"127.0.0.1:2881",
		errors.New("Error 1235 (0A000): Oracle tenant for current client driver is not supported"),
	)
	if !strings.Contains(got, "切换为 Oracle") {
		t.Fatalf("expected Oracle protocol hint, got %q", got)
	}
	if !strings.Contains(got, "OBProxy") {
		t.Fatalf("expected hint to mention OBProxy Oracle protocol port, got %q", got)
	}
}

