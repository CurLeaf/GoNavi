package app

import (
	"errors"
	"testing"

	"GoNavi-Wails/internal/connection"
	redislib "GoNavi-Wails/internal/redis"
)

type capturingRedisClient struct {
	connectConfig     connection.ConnectionConfig
	deletedHashKey    string
	deletedHashFields []string
}

func (c *capturingRedisClient) Connect(config connection.ConnectionConfig) error {
	c.connectConfig = config
	return nil
}

func (c *capturingRedisClient) Close() error { return nil }

func (c *capturingRedisClient) Ping() error { return nil }

func (c *capturingRedisClient) ScanKeys(pattern string, cursor uint64, count int64) (*redislib.RedisScanResult, error) {
	return &redislib.RedisScanResult{}, nil
}

func (c *capturingRedisClient) GetKeyType(key string) (string, error) { return "", nil }

func (c *capturingRedisClient) GetTTL(key string) (int64, error) { return 0, nil }

func (c *capturingRedisClient) SetTTL(key string, ttl int64) error { return nil }

func (c *capturingRedisClient) DeleteKeys(keys []string) (int64, error) { return 0, nil }

func (c *capturingRedisClient) RenameKey(oldKey, newKey string) error { return nil }

func (c *capturingRedisClient) KeyExists(key string) (bool, error) { return false, nil }

func (c *capturingRedisClient) GetValue(key string) (*redislib.RedisValue, error) {
	return &redislib.RedisValue{}, nil
}

func (c *capturingRedisClient) GetString(key string) (string, error) { return "", nil }

func (c *capturingRedisClient) SetString(key, value string, ttl int64) error { return nil }

func (c *capturingRedisClient) GetHash(key string) (map[string]string, error) {
	return map[string]string{}, nil
}

func (c *capturingRedisClient) SetHashField(key, field, value string) error { return nil }

func (c *capturingRedisClient) DeleteHashField(key string, fields ...string) error {
	c.deletedHashKey = key
	c.deletedHashFields = append([]string(nil), fields...)
	return nil
}

func (c *capturingRedisClient) GetList(key string, start, stop int64) ([]string, error) {
	return nil, nil
}

func (c *capturingRedisClient) ListPush(key string, values ...string) error { return nil }

func (c *capturingRedisClient) ListSet(key string, index int64, value string) error { return nil }

func (c *capturingRedisClient) GetSet(key string) ([]string, error) { return nil, nil }

func (c *capturingRedisClient) SetAdd(key string, members ...string) error { return nil }

func (c *capturingRedisClient) SetRemove(key string, members ...string) error { return nil }

func (c *capturingRedisClient) GetZSet(key string, start, stop int64) ([]redislib.ZSetMember, error) {
	return nil, nil
}

func (c *capturingRedisClient) ZSetAdd(key string, members ...redislib.ZSetMember) error { return nil }

func (c *capturingRedisClient) ZSetRemove(key string, members ...string) error { return nil }

func (c *capturingRedisClient) GetStream(key, start, stop string, count int64) ([]redislib.StreamEntry, error) {
	return nil, nil
}

func (c *capturingRedisClient) StreamAdd(key string, fields map[string]string, id string) (string, error) {
	return "", nil
}

func (c *capturingRedisClient) StreamDelete(key string, ids ...string) (int64, error) { return 0, nil }

func (c *capturingRedisClient) ExecuteCommand(args []string) (interface{}, error) { return nil, nil }

func (c *capturingRedisClient) GetServerInfo() (map[string]string, error) {
	return map[string]string{}, nil
}

func (c *capturingRedisClient) GetDatabases() ([]redislib.RedisDBInfo, error) { return nil, nil }

func (c *capturingRedisClient) SelectDB(index int) error { return nil }

func (c *capturingRedisClient) GetCurrentDB() int { return 0 }

func (c *capturingRedisClient) FlushDB() error { return nil }

type scriptedRedisClient struct {
	capturingRedisClient
	connectErr   error
	connectCalls *[]connection.ConnectionConfig
}

func (c *scriptedRedisClient) Connect(config connection.ConnectionConfig) error {
	c.connectConfig = config
	if c.connectCalls != nil {
		*c.connectCalls = append(*c.connectCalls, config)
	}
	return c.connectErr
}

func TestRedisConnectResolvesSavedSecretsByConnectionID(t *testing.T) {
	testCases := []struct {
		name           string
		savedConfig    connection.ConnectionConfig
		runtimeConfig  connection.ConnectionConfig
		assertResolved func(t *testing.T, got connection.ConnectionConfig)
	}{
		{
			name: "redis and ssh secrets",
			savedConfig: connection.ConnectionConfig{
				ID:       "redis-1",
				Type:     "redis",
				Host:     "redis.local",
				Port:     6379,
				Password: "redis-secret",
				UseSSH:   true,
				SSH: connection.SSHConfig{
					Host:     "ssh.local",
					Port:     22,
					User:     "ops",
					Password: "ssh-secret",
				},
			},
			runtimeConfig: connection.ConnectionConfig{
				ID:     "redis-1",
				Type:   "redis",
				Host:   "redis.local",
				Port:   6379,
				UseSSH: true,
				SSH: connection.SSHConfig{
					Host: "ssh.local",
					Port: 22,
					User: "ops",
				},
			},
			assertResolved: func(t *testing.T, got connection.ConnectionConfig) {
				t.Helper()
				if got.Password != "redis-secret" {
					t.Fatalf("expected RedisConnect to resolve saved Redis password, got %q", got.Password)
				}
				if got.SSH.Password != "ssh-secret" {
					t.Fatalf("expected RedisConnect to resolve saved SSH password, got %q", got.SSH.Password)
				}
			},
		},
		{
			name: "proxy secret",
			savedConfig: connection.ConnectionConfig{
				ID:       "redis-1",
				Type:     "redis",
				Host:     "redis.local",
				Port:     6379,
				Password: "redis-secret",
				UseProxy: true,
				Proxy: connection.ProxyConfig{
					Type:     "http",
					Host:     "proxy.local",
					Port:     8080,
					User:     "proxy-user",
					Password: "proxy-secret",
				},
			},
			runtimeConfig: connection.ConnectionConfig{
				ID:       "redis-1",
				Type:     "redis",
				Host:     "redis.local",
				Port:     6379,
				UseProxy: true,
				Proxy: connection.ProxyConfig{
					Type: "http",
					Host: "proxy.local",
					Port: 8080,
					User: "proxy-user",
				},
			},
			assertResolved: func(t *testing.T, got connection.ConnectionConfig) {
				t.Helper()
				if got.Password != "redis-secret" {
					t.Fatalf("expected RedisConnect to resolve saved Redis password, got %q", got.Password)
				}
				if got.Proxy.Password != "proxy-secret" {
					t.Fatalf("expected RedisConnect to resolve saved proxy password, got %q", got.Proxy.Password)
				}
			},
		},
		{
			name: "http tunnel secret",
			savedConfig: connection.ConnectionConfig{
				ID:            "redis-1",
				Type:          "redis",
				Host:          "redis.local",
				Port:          6379,
				Password:      "redis-secret",
				UseHTTPTunnel: true,
				HTTPTunnel: connection.HTTPTunnelConfig{
					Host:     "tunnel.local",
					Port:     8443,
					User:     "tunnel-user",
					Password: "tunnel-secret",
				},
			},
			runtimeConfig: connection.ConnectionConfig{
				ID:            "redis-1",
				Type:          "redis",
				Host:          "redis.local",
				Port:          6379,
				UseHTTPTunnel: true,
				HTTPTunnel: connection.HTTPTunnelConfig{
					Host: "tunnel.local",
					Port: 8443,
					User: "tunnel-user",
				},
			},
			assertResolved: func(t *testing.T, got connection.ConnectionConfig) {
				t.Helper()
				if got.Password != "redis-secret" {
					t.Fatalf("expected RedisConnect to resolve saved Redis password, got %q", got.Password)
				}
				if got.HTTPTunnel.Password != "tunnel-secret" {
					t.Fatalf("expected RedisConnect to resolve saved HTTP tunnel password, got %q", got.HTTPTunnel.Password)
				}
			},
		},
		{
			name: "explicit redis username from uri is preserved even when it is root",
			savedConfig: connection.ConnectionConfig{
				ID:       "redis-1",
				Type:     "redis",
				Host:     "redis.local",
				Port:     6379,
				User:     "root",
				Password: "redis-secret",
				URI:      "redis://root:redis-secret@redis.local:6379/0",
			},
			runtimeConfig: connection.ConnectionConfig{
				ID:   "redis-1",
				Type: "redis",
				Host: "redis.local",
				Port: 6379,
				User: "root",
			},
			assertResolved: func(t *testing.T, got connection.ConnectionConfig) {
				t.Helper()
				if got.User != "root" {
					t.Fatalf("expected RedisConnect to preserve explicit uri user root, got %q", got.User)
				}
				if got.URI != "redis://root:redis-secret@redis.local:6379/0" {
					t.Fatalf("expected RedisConnect to restore saved redis uri, got %q", got.URI)
				}
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			app := NewAppWithSecretStore(newFakeAppSecretStore())
			app.configDir = t.TempDir()

			_, err := app.SaveConnection(connection.SavedConnectionInput{
				ID:     "redis-1",
				Name:   "Redis Saved",
				Config: testCase.savedConfig,
			})
			if err != nil {
				t.Fatalf("SaveConnection returned error: %v", err)
			}

			CloseAllRedisClients()
			client := &capturingRedisClient{}
			originalNewRedisClientFunc := newRedisClientFunc
			originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
			defer func() {
				newRedisClientFunc = originalNewRedisClientFunc
				resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
				CloseAllRedisClients()
			}()
			newRedisClientFunc = func() redislib.RedisClient {
				return client
			}
			resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
				return raw, nil
			}

			result := app.RedisConnect(testCase.runtimeConfig)
			if !result.Success {
				t.Fatalf("RedisConnect returned failure: %+v", result)
			}

			testCase.assertResolved(t, client.connectConfig)
		})
	}
}

func TestRedisConnectPreservesExplicitRootUserWithoutURIWhenConnectSucceeds(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "redis-1",
		Name: "Redis Saved",
		Config: connection.ConnectionConfig{
			ID:       "redis-1",
			Type:     "redis",
			Host:     "redis.local",
			Port:     6379,
			User:     "root",
			Password: "redis-secret",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	CloseAllRedisClients()
	connectCalls := make([]connection.ConnectionConfig, 0, 1)
	client := &scriptedRedisClient{connectCalls: &connectCalls}
	originalNewRedisClientFunc := newRedisClientFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	defer func() {
		newRedisClientFunc = originalNewRedisClientFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
		CloseAllRedisClients()
	}()
	newRedisClientFunc = func() redislib.RedisClient {
		return client
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	result := app.RedisConnect(connection.ConnectionConfig{
		ID:   "redis-1",
		Type: "redis",
		Host: "redis.local",
		Port: 6379,
		User: "root",
	})
	if !result.Success {
		t.Fatalf("RedisConnect returned failure: %+v", result)
	}
	if len(connectCalls) != 1 {
		t.Fatalf("expected exactly one Redis connect attempt, got %d", len(connectCalls))
	}
	if connectCalls[0].User != "root" {
		t.Fatalf("expected RedisConnect to preserve explicit root user when connect succeeds, got %q", connectCalls[0].User)
	}
}

func TestRedisConnectRetriesLegacyDefaultRootUserWithoutUsernameAfterAuthFailure(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "redis-1",
		Name: "Redis Saved",
		Config: connection.ConnectionConfig{
			ID:       "redis-1",
			Type:     "redis",
			Host:     "redis.local",
			Port:     6379,
			User:     "root",
			Password: "redis-secret",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	CloseAllRedisClients()
	connectCalls := make([]connection.ConnectionConfig, 0, 2)
	clients := []redislib.RedisClient{
		&scriptedRedisClient{
			connectErr:   errors.New("WRONGPASS invalid username-password pair"),
			connectCalls: &connectCalls,
		},
		&scriptedRedisClient{
			connectCalls: &connectCalls,
		},
	}
	clientIndex := 0
	originalNewRedisClientFunc := newRedisClientFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	defer func() {
		newRedisClientFunc = originalNewRedisClientFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
		CloseAllRedisClients()
	}()
	newRedisClientFunc = func() redislib.RedisClient {
		if clientIndex >= len(clients) {
			t.Fatalf("unexpected Redis client allocation #%d", clientIndex+1)
		}
		client := clients[clientIndex]
		clientIndex++
		return client
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	result := app.RedisConnect(connection.ConnectionConfig{
		ID:   "redis-1",
		Type: "redis",
		Host: "redis.local",
		Port: 6379,
		User: "root",
	})
	if !result.Success {
		t.Fatalf("RedisConnect returned failure after fallback: %+v", result)
	}
	if len(connectCalls) != 2 {
		t.Fatalf("expected RedisConnect to retry exactly once after auth failure, got %d attempts", len(connectCalls))
	}
	if connectCalls[0].User != "root" {
		t.Fatalf("expected first Redis connect attempt to keep root user, got %q", connectCalls[0].User)
	}
	if connectCalls[1].User != "" {
		t.Fatalf("expected fallback Redis connect attempt to clear legacy root user, got %q", connectCalls[1].User)
	}
}

func TestRedisDeleteHashFieldAcceptsSingleStringField(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	CloseAllRedisClients()
	client := &capturingRedisClient{}
	originalNewRedisClientFunc := newRedisClientFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	defer func() {
		newRedisClientFunc = originalNewRedisClientFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
		CloseAllRedisClients()
	}()
	newRedisClientFunc = func() redislib.RedisClient {
		return client
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	result := app.RedisDeleteHashField(connection.ConnectionConfig{
		Type: "redis",
		Host: "redis.local",
		Port: 6379,
	}, "profile", "nickname")
	if !result.Success {
		t.Fatalf("RedisDeleteHashField returned failure: %+v", result)
	}
	if client.deletedHashKey != "profile" {
		t.Fatalf("expected hash key profile, got %q", client.deletedHashKey)
	}
	if len(client.deletedHashFields) != 1 || client.deletedHashFields[0] != "nickname" {
		t.Fatalf("expected one deleted hash field nickname, got %v", client.deletedHashFields)
	}
}

func TestRedisDeleteHashFieldAcceptsStringSlice(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	CloseAllRedisClients()
	client := &capturingRedisClient{}
	originalNewRedisClientFunc := newRedisClientFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	defer func() {
		newRedisClientFunc = originalNewRedisClientFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
		CloseAllRedisClients()
	}()
	newRedisClientFunc = func() redislib.RedisClient {
		return client
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	result := app.RedisDeleteHashField(connection.ConnectionConfig{
		Type: "redis",
		Host: "redis.local",
		Port: 6379,
	}, "profile", []string{"nickname", "avatar"})
	if !result.Success {
		t.Fatalf("RedisDeleteHashField returned failure: %+v", result)
	}
	if client.deletedHashKey != "profile" {
		t.Fatalf("expected hash key profile, got %q", client.deletedHashKey)
	}
	if len(client.deletedHashFields) != 2 || client.deletedHashFields[0] != "nickname" || client.deletedHashFields[1] != "avatar" {
		t.Fatalf("unexpected deleted hash fields: %v", client.deletedHashFields)
	}
}
