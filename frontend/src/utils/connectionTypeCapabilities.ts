export const singleHostUriSchemesByType: Record<string, string[]> = {
  postgres: ["postgresql", "postgres"],
  opengauss: ["opengauss", "jdbc:opengauss", "postgresql", "postgres"],
  gaussdb: ["gaussdb", "postgresql", "postgres"],
  clickhouse: ["clickhouse"],
  oracle: ["oracle"],
  sqlserver: ["sqlserver"],
  iris: ["iris", "intersystems"],
  redis: ["redis"],
  tdengine: ["tdengine"],
  iotdb: ["iotdb"],
  dameng: ["dameng", "dm"],
  kingbase: ["kingbase"],
  highgo: ["highgo"],
  vastbase: ["vastbase"],
  elasticsearch: ["http", "https"],
  chroma: ["http", "https", "chroma"],
  qdrant: ["http", "https", "qdrant"],
  rabbitmq: ["rabbitmq", "http", "https"],
};

const normalizeConnectionType = (type: string) =>
  {
    const normalized = String(type || "")
      .trim()
      .toLowerCase();
    switch (normalized) {
      case "goldendb":
      case "greatdb":
      case "gdb":
        return "goldendb";
      default:
        return normalized;
    }
  };

const sslSupportedTypes = new Set([
  "mysql",
  "goldendb",
  "mariadb",
  "oceanbase",
  "doris",
  "diros",
  "starrocks",
  "sphinx",
  "dameng",
  "clickhouse",
  "postgres",
  "sqlserver",
  "oracle",
  "kingbase",
  "highgo",
  "vastbase",
  "opengauss",
  "gaussdb",
  "mongodb",
  "redis",
  "tdengine",
  "elasticsearch",
  "chroma",
  "qdrant",
  "kafka",
  "rabbitmq",
]);

export const supportsSSLForType = (type: string) =>
  sslSupportedTypes.has(normalizeConnectionType(type));

const sslCAPathSupportedTypes = new Set([
  "mysql",
  "goldendb",
  "mariadb",
  "oceanbase",
  "diros",
  "starrocks",
  "sphinx",
  "clickhouse",
  "postgres",
  "sqlserver",
  "kingbase",
  "highgo",
  "vastbase",
  "opengauss",
  "gaussdb",
  "mongodb",
  "redis",
  "elasticsearch",
  "chroma",
  "qdrant",
  "kafka",
  "rabbitmq",
]);

const sslClientCertificateSupportedTypes = new Set([
  "mysql",
  "goldendb",
  "mariadb",
  "oceanbase",
  "diros",
  "starrocks",
  "sphinx",
  "dameng",
  "clickhouse",
  "postgres",
  "kingbase",
  "highgo",
  "vastbase",
  "opengauss",
  "gaussdb",
  "mongodb",
  "redis",
  "kafka",
  "rabbitmq",
]);

export const supportsSSLCAPathForType = (type: string) =>
  sslCAPathSupportedTypes.has(normalizeConnectionType(type));

export const supportsSSLClientCertificateForType = (type: string) =>
  sslClientCertificateSupportedTypes.has(normalizeConnectionType(type));

export const isPostgresCompatibleSSLType = (type: string) =>
  [
    "postgres",
    "kingbase",
    "highgo",
    "vastbase",
    "opengauss",
    "gaussdb",
  ].includes(normalizeConnectionType(type));

export const isFileDatabaseType = (type: string) =>
  type === "sqlite" || type === "duckdb";

export const isMySQLCompatibleType = (type: string) =>
  normalizeConnectionType(type) === "mysql" ||
  normalizeConnectionType(type) === "goldendb" ||
  normalizeConnectionType(type) === "mariadb" ||
  normalizeConnectionType(type) === "oceanbase" ||
  normalizeConnectionType(type) === "doris" ||
  normalizeConnectionType(type) === "diros" ||
  normalizeConnectionType(type) === "starrocks" ||
  normalizeConnectionType(type) === "sphinx";

export const supportsConnectionParamsForType = (type: string) =>
  isMySQLCompatibleType(type) ||
  type === "postgres" ||
  type === "kingbase" ||
  type === "highgo" ||
  type === "vastbase" ||
  type === "opengauss" ||
  type === "gaussdb" ||
  type === "oracle" ||
  type === "sqlserver" ||
  type === "iris" ||
  type === "clickhouse" ||
  type === "mongodb" ||
  type === "dameng" ||
  type === "tdengine" ||
  type === "iotdb" ||
  type === "elasticsearch" ||
  type === "chroma" ||
  type === "qdrant" ||
  type === "kafka" ||
  type === "rabbitmq";
