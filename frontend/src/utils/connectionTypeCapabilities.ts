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
};

const normalizeConnectionType = (type: string) =>
  String(type || "")
    .trim()
    .toLowerCase();

const sslSupportedTypes = new Set([
  "mysql",
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
]);

export const supportsSSLForType = (type: string) =>
  sslSupportedTypes.has(normalizeConnectionType(type));

const sslCAPathSupportedTypes = new Set([
  "mysql",
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
]);

const sslClientCertificateSupportedTypes = new Set([
  "mysql",
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
  type === "mysql" ||
  type === "mariadb" ||
  type === "oceanbase" ||
  type === "doris" ||
  type === "diros" ||
  type === "starrocks" ||
  type === "sphinx";

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
  type === "qdrant";
