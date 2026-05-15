//go:build gonavi_full_drivers || gonavi_starrocks_driver

package db

import (
	"database/sql"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/ssh"
	"GoNavi-Wails/internal/utils"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

const (
	starRocksDriverName  = "starrocks"
	defaultStarRocksPort = 9030
)

// StarRocksDB 使用独立 driver 名称接入，底层协议兼容 MySQL。
type StarRocksDB struct {
	MySQLDB
}

func init() {
	for _, name := range sql.Drivers() {
		if name == starRocksDriverName {
			return
		}
	}
	sql.Register(starRocksDriverName, &mysqlDriver.MySQLDriver{})
}

func applyStarRocksURI(config connection.ConnectionConfig) connection.ConnectionConfig {
	uriText := strings.TrimSpace(config.URI)
	if uriText == "" {
		return config
	}

	parsed, ok := parseMySQLCompatibleURI(uriText, "starrocks", "mysql")
	if !ok {
		return config
	}

	if parsed.User != nil {
		if config.User == "" {
			config.User = parsed.User.Username()
		}
		if pass, ok := parsed.User.Password(); ok && config.Password == "" {
			config.Password = pass
		}
	}

	if dbName := strings.TrimPrefix(parsed.Path, "/"); dbName != "" && config.Database == "" {
		config.Database = dbName
	}

	defaultPort := config.Port
	if defaultPort <= 0 {
		defaultPort = defaultStarRocksPort
	}

	hostsFromURI := make([]string, 0, 4)
	hostText := strings.TrimSpace(parsed.Host)
	if hostText != "" {
		for _, entry := range strings.Split(hostText, ",") {
			host, port, ok := parseHostPortWithDefault(entry, defaultPort)
			if !ok {
				continue
			}
			hostsFromURI = append(hostsFromURI, normalizeMySQLAddress(host, port))
		}
	}

	if len(config.Hosts) == 0 && len(hostsFromURI) > 0 {
		config.Hosts = hostsFromURI
	}
	if strings.TrimSpace(config.Host) == "" && len(hostsFromURI) > 0 {
		host, port, ok := parseHostPortWithDefault(hostsFromURI[0], defaultPort)
		if ok {
			config.Host = host
			config.Port = port
		}
	}

	if config.Topology == "" {
		topology := strings.TrimSpace(parsed.Query().Get("topology"))
		if topology != "" {
			config.Topology = strings.ToLower(topology)
		}
	}

	return config
}

func collectStarRocksAddresses(config connection.ConnectionConfig) []string {
	defaultPort := config.Port
	if defaultPort <= 0 {
		defaultPort = defaultStarRocksPort
	}

	candidates := make([]string, 0, len(config.Hosts)+1)
	if len(config.Hosts) > 0 {
		candidates = append(candidates, config.Hosts...)
	} else {
		candidates = append(candidates, normalizeMySQLAddress(config.Host, defaultPort))
	}

	result := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, entry := range candidates {
		host, port, ok := parseHostPortWithDefault(entry, defaultPort)
		if !ok {
			continue
		}
		normalized := normalizeMySQLAddress(host, port)
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}

	return result
}

func (s *StarRocksDB) getDSN(config connection.ConnectionConfig) (string, error) {
	database := config.Database
	protocol := "tcp"
	address := normalizeMySQLAddress(config.Host, config.Port)

	if config.UseSSH {
		netName, err := ssh.RegisterSSHNetwork(config.SSH)
		if err != nil {
			return "", fmt.Errorf("创建 SSH 隧道失败：%w", err)
		}
		protocol = netName
	}

	return buildMySQLCompatibleDSN(config, protocol, address, database), nil
}

func resolveStarRocksCredential(config connection.ConnectionConfig, addressIndex int) (string, string) {
	primaryUser := strings.TrimSpace(config.User)
	primaryPassword := config.Password
	replicaUser := strings.TrimSpace(config.MySQLReplicaUser)
	replicaPassword := config.MySQLReplicaPassword

	if addressIndex > 0 && replicaUser != "" {
		return replicaUser, replicaPassword
	}

	if primaryUser == "" && replicaUser != "" {
		return replicaUser, replicaPassword
	}

	return config.User, primaryPassword
}

func (s *StarRocksDB) Connect(config connection.ConnectionConfig) error {
	runConfig := applyStarRocksURI(config)
	addresses := collectStarRocksAddresses(runConfig)
	if len(addresses) == 0 {
		return fmt.Errorf("连接建立后验证失败：未找到可用的 StarRocks 地址")
	}

	var errorDetails []string
	for index, address := range addresses {
		candidateConfig := runConfig
		host, port, ok := parseHostPortWithDefault(address, defaultStarRocksPort)
		if !ok {
			continue
		}
		candidateConfig.Host = host
		candidateConfig.Port = port
		candidateConfig.User, candidateConfig.Password = resolveStarRocksCredential(runConfig, index)

		dsn, err := s.getDSN(candidateConfig)
		if err != nil {
			errorDetails = append(errorDetails, fmt.Sprintf("%s 生成连接串失败: %v", address, err))
			continue
		}
		db, err := sql.Open(starRocksDriverName, dsn)
		if err != nil {
			errorDetails = append(errorDetails, fmt.Sprintf("%s 打开失败: %v", address, err))
			continue
		}

		timeout := getConnectTimeout(candidateConfig)
		ctx, cancel := utils.ContextWithTimeout(timeout)
		pingErr := db.PingContext(ctx)
		cancel()
		if pingErr != nil {
			_ = db.Close()
			errorDetails = append(errorDetails, fmt.Sprintf("%s 验证失败: %v", address, pingErr))
			continue
		}

		s.conn = db
		s.pingTimeout = timeout
		return nil
	}

	if len(errorDetails) == 0 {
		return fmt.Errorf("连接建立后验证失败：未找到可用的 StarRocks 地址")
	}
	return fmt.Errorf("连接建立后验证失败：%s", strings.Join(errorDetails, "；"))
}
