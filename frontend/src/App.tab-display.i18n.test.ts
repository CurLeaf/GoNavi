import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

const tabDisplaySource = readFileSync(
  fileURLToPath(new globalThis.URL('./utils/tabDisplay.ts', import.meta.url)),
  'utf8',
);

describe('App tab display i18n guards', () => {
  it('localizes the tab display settings copy and preview labels', () => {
    [
      'app.theme.tab_display.title',
      'app.theme.tab_display.description',
      'app.theme.tab_display.layout.single',
      'app.theme.tab_display.layout.double',
      'app.theme.tab_display.badge.current',
      'app.theme.tab_display.row.primary',
      'app.theme.tab_display.row.secondary',
      'app.theme.tab_display.action.move_up',
      'app.theme.tab_display.action.move_down',
      'app.theme.tab_display.preview.prefix',
      'app.theme.tab_display.preview.default_label',
      'app.theme.tab_display.preview.secondary',
      'app.theme.tab_display.preview.focused',
    ].forEach((key) => {
      expect(appSource).toContain(`t('${key}'`);
    });

    [
      'Tab 标签展示',
      '自定义连接名、对象类型、对象名、数据库、Schema 和 Host/IP 的展示顺序',
      "'单行'",
      "'双行'",
      '当前预览：',
      '默认标签',
      '，副行',
      '；当前选中',
      '上移',
      '下移',
    ].forEach((legacyText) => {
      expect(appSource).not.toContain(legacyText);
    });
  });

  it('keeps tab display element metadata as i18n keys', () => {
    [
      'connection',
      'kind',
      'object',
      'database',
      'schema',
      'host',
    ].forEach((elementKey) => {
      expect(tabDisplaySource).toContain(`labelKey: 'app.theme.tab_display.element.${elementKey}.label'`);
      expect(tabDisplaySource).toContain(`descriptionKey: 'app.theme.tab_display.element.${elementKey}.description'`);
    });

    [
      '连接名',
      '连接简称或环境名',
      '对象类型',
      '对象名',
      '当前 DB / catalog 名称',
      '连接目标地址摘要',
    ].forEach((legacyText) => {
      expect(tabDisplaySource).not.toContain(legacyText);
    });
  });
});
