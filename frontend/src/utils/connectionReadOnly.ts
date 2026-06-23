import type { ConnectionConfig } from "../types";
import { convertMongoShellToJsonCommand } from "./mongodb";
import { resolveSqlDialect } from "./sqlDialect";
import { findSqlStatementRanges } from "./sqlStatementSelection";

type ConnectionReadOnlyLike = Pick<
  ConnectionConfig,
  "type" | "driver" | "oceanBaseProtocol" | "readOnly"
> | null | undefined;

const CONNECTION_READ_ONLY_TYPES = new Set([
  "mysql",
  "goldendb",
  "mariadb",
  "oceanbase",
  "diros",
  "starrocks",
  "sphinx",
  "postgres",
  "kingbase",
  "highgo",
  "vastbase",
  "opengauss",
  "gaussdb",
  "sqlserver",
  "iris",
  "sqlite",
  "duckdb",
  "oracle",
  "dameng",
  "tdengine",
  "clickhouse",
  "trino",
  "mongodb",
]);

const SQL_READ_ONLY_KEYWORDS = new Set([
  "select",
  "with",
  "show",
  "describe",
  "desc",
  "explain",
  "pragma",
  "values",
  "consume",
]);

const SQL_MUTATING_WITH_KEYWORDS = /\b(insert|update|delete|replace|merge|upsert)\b/i;
const SQL_SELECT_INTO_PATTERN = /^\s*select\b[\s\S]*\binto\b/i;

const MONGO_READ_ONLY_COMMANDS = new Set([
  "aggregate",
  "buildinfo",
  "collstats",
  "connectionstatus",
  "count",
  "countdocuments",
  "dbstats",
  "distinct",
  "explain",
  "find",
  "findone",
  "getparameter",
  "hello",
  "hostinfo",
  "ismaster",
  "listcollections",
  "listdatabases",
  "listindexes",
  "ping",
  "serverstatus",
]);

const MONGO_WRITE_COMMANDS = new Set([
  "bulkwrite",
  "collmod",
  "create",
  "createindexes",
  "delete",
  "drop",
  "dropdatabase",
  "dropindexes",
  "findandmodify",
  "insert",
  "mapreduce",
  "renamecollection",
  "update",
]);

const MONGO_META_KEYS = new Set([
  "$db",
  "$readpreference",
  "api",
  "apideprecationerrors",
  "apistrict",
  "comment",
  "let",
  "lsid",
  "maxtimems",
  "ordered",
  "readconcern",
  "writeconcern",
]);

const stripLeadingSqlComments = (statement: string): string => {
  let text = String(statement || "").trim();
  while (text) {
    if (text.startsWith("--")) {
      const next = text.indexOf("\n");
      text = next >= 0 ? text.slice(next + 1).trimStart() : "";
      continue;
    }
    if (text.startsWith("#")) {
      const next = text.indexOf("\n");
      text = next >= 0 ? text.slice(next + 1).trimStart() : "";
      continue;
    }
    if (text.startsWith("/*")) {
      const next = text.indexOf("*/");
      text = next >= 0 ? text.slice(next + 2).trimStart() : "";
      continue;
    }
    break;
  }
  return text;
};

const extractLeadingSqlKeyword = (statement: string): string => {
  const text = stripLeadingSqlComments(statement);
  const match = text.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return match ? match[0].toLowerCase() : "";
};

const resolveConnectionReadOnlyType = (
  config: ConnectionReadOnlyLike,
): string => {
  if (!config) return "";
  return String(
    resolveSqlDialect(String(config.type || ""), String(config.driver || ""), {
      oceanBaseProtocol: config.oceanBaseProtocol,
    }),
  )
    .trim()
    .toLowerCase();
};

const isReadOnlySqlStatement = (statement: string): boolean => {
  const text = stripLeadingSqlComments(statement);
  if (!text) return true;
  const keyword = extractLeadingSqlKeyword(text);
  if (!keyword || !SQL_READ_ONLY_KEYWORDS.has(keyword)) {
    return false;
  }
  if (keyword === "select") {
    return !SQL_SELECT_INTO_PATTERN.test(text);
  }
  if (keyword === "with") {
    return !SQL_SELECT_INTO_PATTERN.test(text) &&
      !SQL_MUTATING_WITH_KEYWORDS.test(text);
  }
  return true;
};

const normalizeMongoCommandText = (statement: string): string => {
  const trimmed = String(statement || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    return trimmed;
  }
  const converted = convertMongoShellToJsonCommand(trimmed);
  if (converted.recognized && converted.command) {
    return converted.command;
  }
  return "";
};

const resolveMongoCommandKey = (command: Record<string, unknown>): string => {
  const keys = Object.keys(command).map((key) => key.trim());
  const effectiveKeys = keys.filter((key) => {
    const normalized = key.toLowerCase();
    return normalized !== "" && !MONGO_META_KEYS.has(normalized);
  });
  for (const key of effectiveKeys) {
    if (MONGO_WRITE_COMMANDS.has(key.toLowerCase())) {
      return key;
    }
  }
  for (const key of effectiveKeys) {
    if (MONGO_READ_ONLY_COMMANDS.has(key.toLowerCase())) {
      return key;
    }
  }
  return effectiveKeys[0] || "";
};

const isReadOnlyMongoStatement = (statement: string): boolean => {
  const commandText = normalizeMongoCommandText(statement);
  if (!commandText) return false;
  try {
    const parsed = JSON.parse(commandText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const commandKey = resolveMongoCommandKey(parsed).toLowerCase();
    if (!commandKey) return false;
    if (MONGO_WRITE_COMMANDS.has(commandKey)) {
      return false;
    }
    return MONGO_READ_ONLY_COMMANDS.has(commandKey);
  } catch {
    return false;
  }
};

const isConnectionReadOnlyStatement = (
  config: ConnectionReadOnlyLike,
  statement: string,
): boolean => {
  const dialect = resolveConnectionReadOnlyType(config);
  if (dialect === "mongodb") {
    return isReadOnlyMongoStatement(statement);
  }
  return isReadOnlySqlStatement(statement);
};

export const supportsConnectionReadOnlyMode = (
  config: ConnectionReadOnlyLike,
): boolean => {
  return CONNECTION_READ_ONLY_TYPES.has(resolveConnectionReadOnlyType(config));
};

export const isConnectionForcedReadOnly = (
  config: ConnectionReadOnlyLike,
): boolean => {
  return supportsConnectionReadOnlyMode(config) && config?.readOnly === true;
};

export const findConnectionMutatingStatements = (
  config: ConnectionReadOnlyLike,
  sql: string,
): string[] => {
  if (!isConnectionForcedReadOnly(config)) {
    return [];
  }
  return findSqlStatementRanges(String(sql || ""))
    .map((range) => range.text.trim())
    .filter((statement) => statement.length > 0)
    .filter((statement) => !isConnectionReadOnlyStatement(config, statement));
};
