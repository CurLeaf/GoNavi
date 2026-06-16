import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./TableDesigner.tsx', import.meta.url), 'utf8');

const readLocale = (locale: string) => JSON.parse(
  readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8'),
) as Record<string, string>;

describe('TableDesigner i18n', () => {
  it('localizes designer title, toolbar, tabs, modals, and schema messages', () => {
    [
      "'未命名表'",
      "'默认库'",
      '字段`',
      '确认删除触发器',
      '触发器删除成功',
      '复制选中字段到新表',
      '修改表备注',
      '新增索引',
      '修改外键',
      '确认 SQL 变更',
      '请仔细检查 SQL',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain("t('table_designer.title.untitled_table'");
    expect(source).toContain("t('table_designer.title.default_database'");
    expect(source).toContain("t('table_designer.summary.columns'");
    expect(source).toContain("t('table_designer.message.trigger_deleted'");
    expect(source).toContain("t('table_designer.modal.copy_columns_title'");
    expect(source).toContain("t('table_designer.modal.confirm_sql_title'");
  });

  it('keeps generated trigger SQL fallbacks raw and locale-stable', () => {
    expect(source).not.toContain("'-- 无法获取完整的触发器定义'");
    expect(source).not.toContain("'-- 请输入 CREATE TRIGGER 语句'");
    expect(source).not.toContain("t('table_designer.trigger.definition_unavailable'");
    expect(source).not.toContain("t('table_designer.trigger.template.enter_create'");
    expect(source).toContain('-- Trigger logic');
    expect(source).toContain('-- Enter a CREATE TRIGGER statement');
    expect(source).toContain('-- Trigger definition unavailable');
  });

  it('localizes remaining V2 and StarRocks technical labels without translating raw values', () => {
    [
      'SCHEMA DESIGNER',
      'Duplicate Key',
      'Primary Key',
      'Unique Key',
      'Aggregate Key',
      'Buckets Auto',
      'placeholder="Buckets"',
      'utf8mb4 (Recommended)',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    [
      "t('table_designer.title.schema_designer'",
      "t('table_designer.starrocks.key_model.duplicate'",
      "t('table_designer.column.primary_key'",
      "t('table_designer.starrocks.key_model.unique'",
      "t('table_designer.starrocks.key_model.aggregate'",
      "t('table_designer.starrocks.bucket_mode.auto'",
      "t('table_designer.starrocks.placeholder.bucket_count'",
      "t('table_designer.option.recommended_suffix'",
    ].forEach((snippet) => {
      expect(source).toContain(snippet);
    });

    ['utf8mb4', 'DUPLICATE', 'PRIMARY', 'UNIQUE', 'AGGREGATE', 'AUTO'].forEach((rawValue) => {
      expect(source).toContain(rawValue);
    });
  });

  it('localizes the default collation label suffix while keeping the raw collation value', () => {
    expect(source).not.toContain('utf8mb4_unicode_ci (Default)');
    expect(source).toContain('utf8mb4_unicode_ci');
    expect(source).toContain("t('table_designer.option.default'");
  });

  it('does not use English Bucket fallback for newly localized non-English bucket labels', () => {
    ['zh-CN', 'zh-TW', 'ja-JP', 'de-DE', 'ru-RU'].forEach((locale) => {
      const messages = readLocale(locale);

      [
        messages['table_designer.starrocks.bucket_mode.auto'],
        messages['table_designer.starrocks.bucket_mode.number'],
        messages['table_designer.starrocks.placeholder.bucket_count'],
      ].forEach((message) => {
        expect(message).toBeTruthy();
        expect(message).not.toContain('Bucket');
      });
    });
  });

  it('localizes StarRocks key column placeholders in Chinese locales while keeping raw examples', () => {
    ['zh-CN', 'zh-TW'].forEach((locale) => {
      const message = readLocale(locale)['table_designer.starrocks.placeholder.key_columns'];

      expect(message).toBeTruthy();
      expect(message).not.toContain('Key');
      expect(message).toContain('id');
      expect(message).toContain('date');
    });
  });

  it('removes English words from Chinese StarRocks distribution labels', () => {
    ['zh-CN', 'zh-TW'].forEach((locale) => {
      const messages = readLocale(locale);

      [
        messages['table_designer.starrocks.distribution.hash'],
        messages['table_designer.starrocks.distribution.random'],
      ].forEach((message) => {
        expect(message).toBeTruthy();
        expect(message).not.toContain('Hash');
        expect(message).not.toContain('Random');
      });
    });
  });

  it('removes English StarRocks distribution words from Japanese and Russian labels', () => {
    [
      {
        locale: 'ja-JP',
        key: 'table_designer.starrocks.distribution.hash',
        forbidden: 'Hash',
      },
      {
        locale: 'ja-JP',
        key: 'table_designer.starrocks.distribution.random',
        forbidden: 'Random',
      },
      {
        locale: 'ru-RU',
        key: 'table_designer.starrocks.distribution.hash',
        forbidden: 'Hash',
      },
      {
        locale: 'ru-RU',
        key: 'table_designer.starrocks.distribution.random',
        forbidden: 'Random',
      },
    ].forEach(({ locale, key, forbidden }) => {
      const message = readLocale(locale)[key];

      expect(message).toBeTruthy();
      expect(message).not.toContain(forbidden);
    });
  });

  it('localizes StarRocks key model and primary key labels for key locales without English fallback words', () => {
    const expectationEntries = [
      {
        key: 'table_designer.starrocks.key_model.duplicate',
        forbidden: ['Duplicate', 'Key'],
      },
      {
        key: 'table_designer.starrocks.key_model.unique',
        forbidden: ['Unique', 'Key'],
      },
      {
        key: 'table_designer.starrocks.key_model.aggregate',
        forbidden: ['Aggregate', 'Key'],
      },
      {
        key: 'table_designer.column.primary_key',
        forbidden: ['Primary', 'Key'],
      },
    ];

    ['zh-CN', 'zh-TW', 'ja-JP', 'de-DE', 'ru-RU'].forEach((locale) => {
      const messages = readLocale(locale);

      expectationEntries.forEach(({ key, forbidden }) => {
        const message = messages[key];

        expect(message).toBeTruthy();
        forbidden.forEach((word) => {
          expect(message).not.toContain(word);
        });
      });
    });
  });
});
