import { describe, expect, it } from "vitest";

import { buildConnectionConfig } from "./connectionModalConfig";

const translate = (key: string) => key;

const buildBaseValues = () => ({
  type: "mysql",
  host: "db.local",
  port: 3306,
  user: "root",
  password: "",
  database: "",
  useSSL: false,
  useSSH: false,
  useProxy: false,
  useHttpTunnel: false,
  timeout: 30,
  keepAliveEnabled: false,
  keepAliveIntervalMinutes: 240,
  savePassword: true,
  uri: "",
  connectionParams: "",
  sslMode: "preferred",
  sslCAPath: "",
  sslCertPath: "",
  sslKeyPath: "",
  sshHost: "",
  sshPort: 22,
  sshUser: "",
  sshPassword: "",
  sshKeyPath: "",
  proxyType: "socks5",
  proxyHost: "",
  proxyPort: 1080,
  proxyUser: "",
  proxyPassword: "",
  httpTunnelHost: "",
  httpTunnelPort: 8080,
  httpTunnelUser: "",
  httpTunnelPassword: "",
  mysqlTopology: "single",
  rocketmqTopology: "single",
  mqttTopology: "single",
  kafkaTopology: "single",
  redisTopology: "single",
  mongoTopology: "single",
  mongoSrv: false,
  mongoReadPreference: "primary",
  mongoAuthMechanism: "",
  mysqlReplicaHosts: [],
  rocketmqHosts: [],
  mqttHosts: [],
  kafkaHosts: [],
  redisHosts: [],
  redisSentinelMaster: "",
  redisSentinelUser: "",
  redisSentinelPassword: "",
  mongoHosts: [],
  mysqlReplicaUser: "",
  mysqlReplicaPassword: "",
  mongoReplicaUser: "",
  mongoReplicaPassword: "",
  redisDB: 0,
});

describe("connectionModalConfig keepalive", () => {
  it("keeps keepalive settings for network connections", async () => {
    const config = await buildConnectionConfig({
      values: {
        ...buildBaseValues(),
        keepAliveEnabled: true,
        keepAliveIntervalMinutes: 15,
      },
      forPersist: true,
      translate,
    });

    expect(config.keepAliveEnabled).toBe(true);
    expect(config.keepAliveIntervalMinutes).toBe(15);
  });

  it("forces file database keepalive off", async () => {
    const config = await buildConnectionConfig({
      values: {
        ...buildBaseValues(),
        type: "sqlite",
        host: "D:/tmp/demo.db",
        port: 0,
        keepAliveEnabled: true,
        keepAliveIntervalMinutes: 15,
      },
      forPersist: true,
      translate,
    });

    expect(config.keepAliveEnabled).toBe(false);
    expect(config.keepAliveIntervalMinutes).toBe(15);
  });
});
