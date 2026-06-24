import type { SqlSnippet } from "../types";
import { t } from "../i18n";

type SqlSnippetTranslator = (key: string) => string;

type BuiltinSnippetDefinition = {
  id: string;
  prefix: string;
  nameKey: string;
  descriptionKey: string;
  body: string;
};

const builtinSnippetDefinitions: BuiltinSnippetDefinition[] = [
  {
    id: "builtin-sel",
    prefix: "sel",
    nameKey: "sql_snippets.builtin.sel.name",
    descriptionKey: "sql_snippets.builtin.sel.description",
    body: "SELECT ${1:column_list} FROM ${2:table_name}$0;",
  },
  {
    id: "builtin-selw",
    prefix: "selw",
    nameKey: "sql_snippets.builtin.selw.name",
    descriptionKey: "sql_snippets.builtin.selw.description",
    body: "SELECT ${1:columns} FROM ${2:table_name} WHERE ${3:condition}$0;",
  },
  {
    id: "builtin-selj",
    prefix: "selj",
    nameKey: "sql_snippets.builtin.selj.name",
    descriptionKey: "sql_snippets.builtin.selj.description",
    body: "SELECT ${1:columns}\nFROM ${2:t1}\nINNER JOIN ${3:t2} ON ${4:t1.id} = ${5:t2.id}\nWHERE ${6:condition}$0;",
  },
  {
    id: "builtin-ins",
    prefix: "ins",
    nameKey: "sql_snippets.builtin.ins.name",
    descriptionKey: "sql_snippets.builtin.ins.description",
    body: "INSERT INTO ${1:table_name} (${2:columns})\nVALUES (${3:values})$0;",
  },
  {
    id: "builtin-upd",
    prefix: "upd",
    nameKey: "sql_snippets.builtin.upd.name",
    descriptionKey: "sql_snippets.builtin.upd.description",
    body: "UPDATE ${1:table_name}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition}$0;",
  },
  {
    id: "builtin-del",
    prefix: "del",
    nameKey: "sql_snippets.builtin.del.name",
    descriptionKey: "sql_snippets.builtin.del.description",
    body: "DELETE FROM ${1:table_name}\nWHERE ${2:condition}$0;",
  },
  {
    id: "builtin-ct",
    prefix: "ct",
    nameKey: "sql_snippets.builtin.ct.name",
    descriptionKey: "sql_snippets.builtin.ct.description",
    body: "CREATE TABLE ${1:table_name} (\n  ${2:id} INT PRIMARY KEY AUTO_INCREMENT,\n  ${3:col} ${4:VARCHAR(255)} NOT NULL\n)$0;",
  },
  {
    id: "builtin-alt",
    prefix: "alt",
    nameKey: "sql_snippets.builtin.alt.name",
    descriptionKey: "sql_snippets.builtin.alt.description",
    body: "ALTER TABLE ${1:table_name}\nADD COLUMN ${2:col} ${3:VARCHAR(255)}$0;",
  },
  {
    id: "builtin-dro",
    prefix: "dro",
    nameKey: "sql_snippets.builtin.dro.name",
    descriptionKey: "sql_snippets.builtin.dro.description",
    body: "DROP TABLE IF EXISTS ${1:table_name}$0;",
  },
  {
    id: "builtin-grp",
    prefix: "grp",
    nameKey: "sql_snippets.builtin.grp.name",
    descriptionKey: "sql_snippets.builtin.grp.description",
    body: "SELECT ${1:col}, COUNT(*)\nFROM ${2:table_name}\nGROUP BY ${1:col}$0;",
  },
  {
    id: "builtin-ljo",
    prefix: "ljo",
    nameKey: "sql_snippets.builtin.ljo.name",
    descriptionKey: "sql_snippets.builtin.ljo.description",
    body: "LEFT JOIN ${1:t} ON ${2:left.col} = ${3:right.col}$0",
  },
  {
    id: "builtin-sub",
    prefix: "sub",
    nameKey: "sql_snippets.builtin.sub.name",
    descriptionKey: "sql_snippets.builtin.sub.description",
    body: "SELECT ${1:cols}\nFROM ${2:t1}\nWHERE ${3:col} IN (\n  SELECT ${4:col} FROM ${5:t2} WHERE ${6:cond}\n)$0;",
  },
  {
    id: "builtin-lim",
    prefix: "lim",
    nameKey: "sql_snippets.builtin.lim.name",
    descriptionKey: "sql_snippets.builtin.lim.description",
    body: "SELECT ${1:cols} FROM ${2:table_name} LIMIT ${3:10}$0;",
  },
  {
    id: "builtin-ord",
    prefix: "ord",
    nameKey: "sql_snippets.builtin.ord.name",
    descriptionKey: "sql_snippets.builtin.ord.description",
    body: "SELECT ${1:cols} FROM ${2:table_name} ORDER BY ${3:col} ${4|ASC,DESC|}$0;",
  },
  {
    id: "builtin-seld",
    prefix: "seld",
    nameKey: "sql_snippets.builtin.seld.name",
    descriptionKey: "sql_snippets.builtin.seld.description",
    body: "SELECT ${1:cols} FROM ${2:table_name}\nWHERE ${3:date_col} >= '${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}'$0;",
  },
  {
    id: "builtin-ctt",
    prefix: "ctt",
    nameKey: "sql_snippets.builtin.ctt.name",
    descriptionKey: "sql_snippets.builtin.ctt.description",
    body: "CREATE TABLE ${1:table_name} (\n  ${2:id} INT PRIMARY KEY AUTO_INCREMENT,\n  ${3:col} ${4:VARCHAR(255)},\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n)$0;",
  },
  {
    id: "builtin-inst",
    prefix: "inst",
    nameKey: "sql_snippets.builtin.inst.name",
    descriptionKey: "sql_snippets.builtin.inst.description",
    body: "INSERT INTO ${1:table_name} (${2:columns}, created_at)\nVALUES (${3:values}, '${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE} ${CURRENT_HOUR}:${CURRENT_MINUTE}:${CURRENT_SECOND}')$0;",
  },
];

export const createDefaultSqlSnippets = (
  translate: SqlSnippetTranslator = t,
): SqlSnippet[] => {
  const now = Date.now();
  return builtinSnippetDefinitions.map((snippet, index) => ({
    id: snippet.id,
    prefix: snippet.prefix,
    name: translate(snippet.nameKey),
    description: translate(snippet.descriptionKey),
    body: snippet.body,
    isBuiltin: true,
    createdAt: now + index,
  }));
};

export const DEFAULT_SQL_SNIPPETS: SqlSnippet[] = createDefaultSqlSnippets();

export const BUILTIN_SNIPPET_MAP: Record<string, SqlSnippet> = {};
for (const s of DEFAULT_SQL_SNIPPETS) {
  BUILTIN_SNIPPET_MAP[s.id] = { ...s };
}
