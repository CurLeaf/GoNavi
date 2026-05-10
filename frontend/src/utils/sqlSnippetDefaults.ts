import type { SqlSnippet } from "../types";

const builtinSnippets: Omit<SqlSnippet, "createdAt">[] = [
  {
    id: "builtin-sel",
    prefix: "sel",
    name: "SELECT 基本查询",
    description: "基本 SELECT 查询模板",
    body: "SELECT ${1:column_list} FROM ${2:table_name}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-selw",
    prefix: "selw",
    name: "SELECT WHERE",
    description: "带 WHERE 条件的 SELECT 查询",
    body: "SELECT ${1:columns} FROM ${2:table_name} WHERE ${3:condition}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-selj",
    prefix: "selj",
    name: "SELECT JOIN",
    description: "带 INNER JOIN 的 SELECT 查询",
    body: "SELECT ${1:columns}\nFROM ${2:t1}\nINNER JOIN ${3:t2} ON ${4:t1.id} = ${5:t2.id}\nWHERE ${6:condition}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-ins",
    prefix: "ins",
    name: "INSERT",
    description: "INSERT 插入数据模板",
    body: "INSERT INTO ${1:table_name} (${2:columns})\nVALUES (${3:values})$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-upd",
    prefix: "upd",
    name: "UPDATE",
    description: "UPDATE 更新数据模板",
    body: "UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-del",
    prefix: "del",
    name: "DELETE",
    description: "DELETE 删除数据模板",
    body: "DELETE FROM ${1:table_name}\nWHERE ${2:condition}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-ct",
    prefix: "ct",
    name: "CREATE TABLE",
    description: "CREATE TABLE 建表模板",
    body: "CREATE TABLE ${1:table_name} (\n  ${2:id} INT PRIMARY KEY AUTO_INCREMENT,\n  ${3:col} ${4:VARCHAR(255)} NOT NULL\n)$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-alt",
    prefix: "alt",
    name: "ALTER TABLE",
    description: "ALTER TABLE 添加列模板",
    body: "ALTER TABLE ${1:table_name}\nADD COLUMN ${2:col} ${3:VARCHAR(255)}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-dro",
    prefix: "dro",
    name: "DROP TABLE",
    description: "DROP TABLE 删表模板",
    body: "DROP TABLE IF EXISTS ${1:table_name}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-grp",
    prefix: "grp",
    name: "GROUP BY",
    description: "带 GROUP BY 的聚合查询模板",
    body: "SELECT ${1:col}, COUNT(*)\nFROM ${2:table_name}\nGROUP BY ${1:col}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-ljo",
    prefix: "ljo",
    name: "LEFT JOIN",
    description: "LEFT JOIN 左连接模板",
    body: "LEFT JOIN ${1:t} ON ${2:left.col} = ${3:right.col}$0",
    isBuiltin: true,
  },
  {
    id: "builtin-sub",
    prefix: "sub",
    name: "子查询",
    description: "IN 子查询模板",
    body: "SELECT ${1:cols}\nFROM ${2:t1}\nWHERE ${3:col} IN (\n  SELECT ${4:col} FROM ${5:t2} WHERE ${6:cond}\n)$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-lim",
    prefix: "lim",
    name: "LIMIT 查询",
    description: "带 LIMIT 的分页查询模板",
    body: "SELECT ${1:cols} FROM ${2:table_name} LIMIT ${3:10}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-ord",
    prefix: "ord",
    name: "ORDER BY",
    description: "带排序的查询模板",
    body: "SELECT ${1:cols} FROM ${2:table_name} ORDER BY ${3:col} ${4|ASC,DESC|}$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-seld",
    prefix: "seld",
    name: "SELECT 按日期查询",
    description: "按日期条件过滤的 SELECT 查询，自动填入当天日期",
    body: "SELECT ${1:cols} FROM ${2:table_name}\nWHERE ${3:date_col} >= '${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}'$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-ctt",
    prefix: "ctt",
    name: "CREATE TABLE（含时间列）",
    description: "建表模板，含 created_at / updated_at 时间列",
    body: "CREATE TABLE ${1:table_name} (\n  ${2:id} INT PRIMARY KEY AUTO_INCREMENT,\n  ${3:col} ${4:VARCHAR(255)},\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n)$0;",
    isBuiltin: true,
  },
  {
    id: "builtin-inst",
    prefix: "inst",
    name: "INSERT（含时间戳）",
    description: "INSERT 模板，自动填入当前时间戳",
    body: "INSERT INTO ${1:table_name} (${2:columns}, created_at)\nVALUES (${3:values}, '${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE} ${CURRENT_HOUR}:${CURRENT_MINUTE}:${CURRENT_SECOND}')$0;",
    isBuiltin: true,
  },
];

const now = Date.now();

export const DEFAULT_SQL_SNIPPETS: SqlSnippet[] = builtinSnippets.map(
  (s, i) => ({
    ...s,
    createdAt: now + i,
  })
);

export const BUILTIN_SNIPPET_MAP: Record<string, SqlSnippet> = {};
for (const s of DEFAULT_SQL_SNIPPETS) {
  BUILTIN_SNIPPET_MAP[s.id] = { ...s };
}
