import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const queryEditorSource = readFileSync(new URL('./QueryEditor.tsx', import.meta.url), 'utf8');

describe('QueryEditor i18n source guards', () => {
  it('does not keep legacy builtin SQL function completion details in component source', () => {
    expect(queryEditorSource).not.toContain('const SQL_FUNCTIONS');
    expect(queryEditorSource).not.toContain("detail: '聚合 - 计数'");
    expect(queryEditorSource).not.toContain("detail: '字符串 - 拼接'");
    expect(queryEditorSource).not.toContain("detail: '日期 - 当前日期时间'");
    expect(queryEditorSource).not.toContain("detail: 'JSON - 提取值'");
    expect(queryEditorSource).not.toContain("detail: '窗口 - 行号'");
  });
});
