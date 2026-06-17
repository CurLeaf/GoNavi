import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

describe('App tools entry i18n guards', () => {
  it('localizes compare tool entry titles and descriptions', () => {
    expect(appSource).toContain("t('app.tools.entry.schema_compare.title')");
    expect(appSource).toContain("t('app.tools.entry.schema_compare.description')");
    expect(appSource).toContain("t('app.tools.entry.data_compare.title')");
    expect(appSource).toContain("t('app.tools.entry.data_compare.description')");

    expect(appSource).not.toContain("title: '表结构比对'");
    expect(appSource).not.toContain("description: '对比源表与目标表结构差异，只预览不执行。'");
    expect(appSource).not.toContain("title: '数据比对'");
    expect(appSource).not.toContain("description: '按主键分析新增、更新、删除和相同行。'");
  });
});
