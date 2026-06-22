import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.ai_table_context_missing',
  'sidebar.ai_prompt.explain.intro',
  'sidebar.ai_prompt.explain.detail',
  'sidebar.ai_prompt.query.intro',
  'sidebar.ai_prompt.query.detail',
  'sidebar.command_search.action.ask_ai.title',
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
    });

    requiredKeys.forEach((key) => {
      expect(source).toContain(`t('${key}'`);
    });

    expect(source).toContain('DBShowCreateTable');
    expect(source).toContain('conn.dbName');
    expect(source).toContain('tableName');
    expect(source).toContain('ddl ? `\\n\\`\\`\\`sql');
    expect(source).toContain('${ddl}');
    expect(source).toContain('v2CommandSearchQuery.aiPrompt');
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
