import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./QueryEditorResultsPanel.tsx', import.meta.url), 'utf8');

const legacyLiterals = [
  '隐藏结果区',
  '关闭其他页',
  '关闭左侧',
  '关闭右侧',
  '关闭所有',
  '隐藏',
  '消息 ',
  '结果 ',
  '关闭结果',
  '执行消息',
  '执行成功',
  '影响行数：',
  '结果区',
  '执行失败',
  '一键 AI 诊断',
  '等待执行 SQL',
  '运行查询后，结果会在下方以新版数据网格展示。',
];

const requiredKeys = [
  'query_editor.results_panel.tooltip.hide',
  'query_editor.results_panel.tooltip.hide_with_shortcut',
  'query_editor.results_panel.menu.close_other',
  'query_editor.results_panel.menu.close_left',
  'query_editor.results_panel.menu.close_right',
  'query_editor.results_panel.menu.close_all',
  'query_editor.results_panel.action.hide',
  'query_editor.results_panel.aria.hide',
  'query_editor.results_panel.tab.message',
  'query_editor.results_panel.tab.result',
  'query_editor.results_panel.message.title',
  'query_editor.results_panel.panel.title',
  'query_editor.empty_state.title',
  'query_editor.empty_state.description',
  'query_editor.result.close',
  'query_editor.result.execution_success',
  'query_editor.result.affected_rows',
  'query_editor.result.execution_failed',
  'query_editor.result.ai_diagnose',
];

describe('QueryEditorResultsPanel i18n', () => {
  it('uses localized keys for result panel chrome', () => {
    expect(source).toContain("import { useOptionalI18n } from '../i18n/provider';");
    expect(source).toContain('const i18n = useOptionalI18n();');
    expect(source).toContain('const t = i18n?.t ?? defaultTranslate;');

    for (const key of requiredKeys) {
      expect(source).toContain(key);
    }

    for (const literal of legacyLiterals) {
      expect(source).not.toContain(literal);
    }
  });
});
