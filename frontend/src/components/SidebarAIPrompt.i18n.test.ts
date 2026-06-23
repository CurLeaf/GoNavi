import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const objectActionsSource = readFileSync(new URL('./sidebar/useSidebarObjectActions.tsx', import.meta.url), 'utf8');
const searchModelSource = readFileSync(new URL('./sidebar/useSidebarSearchModel.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.ai_table_context_missing',
  'sidebar.ai_prompt.explain.intro',
  'sidebar.ai_prompt.explain.detail',
  'sidebar.ai_prompt.query.intro',
  'sidebar.ai_prompt.query.detail',
];

describe('Sidebar AI prompt i18n', () => {
  it('localizes AI table prompt shells without translating raw table or DDL values', () => {
    [
      '当前表缺少连接上下文，无法发送给 AI',
      '请解释数据表 ${conn.dbName}.${tableName} 的结构和业务含义。',
      '重点说明字段含义、主键/索引、潜在关联关系、典型查询场景和风险点。',
      '请基于数据表 ${conn.dbName}.${tableName} 生成 3 条常用查询 SQL。',
      '要求包含：数据预览查询、按关键字段过滤查询、一个聚合或统计查询。',
      "title: '让 AI 回答'",
    ].forEach((legacyCopy) => {
      expect(source).not.toContain(legacyCopy);
      expect(objectActionsSource).not.toContain(legacyCopy);
      expect(searchModelSource).not.toContain(legacyCopy);
    });

    requiredKeys.forEach((key) => {
      expect(objectActionsSource).toContain(`t('${key}'`);
    });

    expect(objectActionsSource).toContain('DBShowCreateTable');
    expect(objectActionsSource).toContain('conn.dbName');
    expect(objectActionsSource).toContain('tableName');
    expect(objectActionsSource).toContain('ddl ? `\\n\\`\\`\\`sql');
    expect(objectActionsSource).toContain('${ddl}');
    expect(searchModelSource).toContain("t('sidebar.command_search.action.ask_ai.title')");
    expect(searchModelSource).toContain('v2CommandSearchQuery.aiPrompt');
  });

  it('keeps AI prompt keys available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });
  });
});
