import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  TAB_WORKBENCH_CLASS_NAME,
  resolveTabHoverOpen,
  resolveTabHoverTitle,
  shouldShowV2ConnectionLabel,
  TabHoverInfo,
  stopTabHoverDragPropagation,
} from './TabManager';
import type { TabData } from '../types';
import { buildTabDisplayModel } from '../utils/tabDisplay';

describe('TabManager hover info', () => {
  it('memoizes the tab workbench so parent-only modal state does not repaint open tabs', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(source).toContain('const TabManager: React.FC = React.memo(() => {');
  });

  it('keeps the tab workbench as a full-height flex child in legacy and v2 UI', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(TAB_WORKBENCH_CLASS_NAME).toBe('tab-workbench');
    expect(source).toContain("className={`${TAB_WORKBENCH_CLASS_NAME}${isV2Ui ? ' gn-v2-tab-workbench' : ''}`}");
    expect(source).toContain('.${TAB_WORKBENCH_CLASS_NAME} {');
    expect(source).toMatch(/\.\$\{TAB_WORKBENCH_CLASS_NAME\} \{[\s\S]*height: 100%;[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/);
  });

  it('renders full v2 tab hover context for table tabs', () => {
    const tab: TabData = {
      id: 'conn-1-main-users',
      title: 'users',
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'users',
    };

    const markup = renderToStaticMarkup(
      <TabHoverInfo
        tab={tab}
        displayTitle="[开发240] 表概览"
        connectionLabel="开发240"
        hostSummary="192.168.1.240"
      />,
    );

    expect(markup).toContain('data-tab-hover-info="true"');
    expect(markup).toContain('[开发240] 表概览');
    expect(markup).toContain('类型');
    expect(markup).toContain('表数据');
    expect(markup).toContain('连接');
    expect(markup).toContain('开发240');
    expect(markup).toContain('Host');
    expect(markup).toContain('192.168.1.240');
    expect(markup).toContain('数据库');
    expect(markup).toContain('main');
    expect(markup).toContain('对象');
    expect(markup).toContain('users');
  });

  it('renders db identity for redis tabs without a database name', () => {
    const tab: TabData = {
      id: 'redis-keys-conn-1-db2',
      title: 'db2',
      type: 'redis-keys',
      connectionId: 'conn-1',
      redisDB: 2,
    };

    const markup = renderToStaticMarkup(
      <TabHoverInfo
        tab={tab}
        displayTitle="[缓存 | 10.0.0.8] db2"
        connectionLabel="缓存"
        hostSummary="10.0.0.8"
      />,
    );

    expect(markup).toContain('REDIS');
    expect(markup).toContain('Redis Key');
    expect(markup).toContain('未指定');
    expect(markup).toContain('db2');
  });

  it('keeps v2 hover title focused on the tab object instead of appending secondary display fields', () => {
    const tab: TabData = {
      id: 'overview-1',
      title: '表概览 - front_end_sys',
      type: 'table-overview',
      connectionId: 'conn-1',
      dbName: 'front_end_sys',
    };
    const displayModel = buildTabDisplayModel(tab, {
      id: 'conn-1',
      name: '开发240',
      config: {
        type: 'mysql',
        host: '192.168.1.240',
        port: 3306,
        user: 'root',
        database: 'front_end_sys',
      },
    }, {
      layout: 'double',
      primaryElements: ['object', 'kind'],
      secondaryElements: ['connection', 'database'],
    });

    expect(displayModel.fullTitle).toContain('[开发240]');
    expect(resolveTabHoverTitle(displayModel, displayModel.fullTitle)).toBe('表概览 - front_end_sys');
  });

  it('stops hover card pointer events from reaching tab drag listeners without blocking text selection', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.SyntheticEvent<HTMLElement>;

    stopTabHoverDragPropagation(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('keeps tab hover hidden while the tab context menu is open', () => {
    expect(resolveTabHoverOpen(true, false)).toBe(true);
    expect(resolveTabHoverOpen(true, true)).toBe(false);
    expect(resolveTabHoverOpen(false, true)).toBe(false);
  });

  it('opens tab display settings from the v2 tab context menu', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(source).toContain("new CustomEvent('gonavi:open-tab-display-settings')");
    expect(source).toContain("if (typeof window === 'undefined')");
  });

  it('hides the v2 gray connection suffix when the title already carries the same prefix', () => {
    expect(shouldShowV2ConnectionLabel('[本地] videos', '本地')).toBe(false);
    expect(shouldShowV2ConnectionLabel('[缓存 | 10.0.0.8] db2', '缓存')).toBe(false);
    expect(shouldShowV2ConnectionLabel('新建查询', '本地')).toBe(true);
  });

  it('does not render the v2 leading icon or connection accent dot in tab labels', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('gn-v2-tab-kind-icon');
    expect(source).not.toContain('tab-connection-accent');
    expect(source).not.toContain('has-connection-accent');
    expect(source).not.toContain('resolveConnectionAccentColor');
  });

  it('renders tab labels from appearance tab display settings', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(source).toContain('buildTabDisplayModel(tab, connection, appearance.tabDisplay)');
    expect(source).toContain('displayModel={displayModel}');
    expect(source).toContain('displayModel.primaryParts.map(renderV2TabDisplayPart)');
    expect(source).toContain("if (part.key === 'kind')");
    expect(source).toContain('className="gn-v2-tab-kind"');
    expect(source).toContain('hasDoubleLineTabLabel');
    expect(source).toContain('gn-v2-main-tabs-double');
    expect(source).toContain('showSecondaryLine');
    expect(source).toContain('gn-v2-tab-label-secondary');
    expect(source).toContain('gn-v2-tab-label-rich');
    expect(source).toContain('gn-v2-tab-label-double');
    expect(source).toContain('gn-v2-tab-label-main tab-title-text');
    expect(source).toContain("key: 'tab-display-settings'");
    expect(source).toContain('label: \'标签设置\'');
    expect(source).toContain('icon: <SettingOutlined />');
    expect(source).toContain('onClick: openTabDisplaySettings');
    expect(source).toContain("rootClassName={isV2Ui ? 'gn-v2-tab-context-menu-popup' : undefined}");
    expect(source).not.toContain('gn-v2-main-tabs-rich');
  });

  it('wires hover card tab-switch and drag-blocking handlers with selectable text styles', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(source).toContain('onPointerDown={stopTabHoverDragPropagation}');
    expect(source).toContain('onPointerUp={stopTabHoverDragPropagation}');
    expect(source).toContain('onPointerDownCapture={stopTabHoverDragPropagation}');
    expect(source).toContain('onMouseDown={stopTabHoverDragPropagation}');
    expect(source).toContain('onMouseUp={stopTabHoverDragPropagation}');
    expect(source).toContain('onClick={stopTabHoverDragPropagation}');
    expect(source).toContain('onClickCapture={stopTabHoverDragPropagation}');
    expect(source).toContain('onTouchStart={stopTabHoverDragPropagation}');
    expect(source).toContain('onTouchEnd={stopTabHoverDragPropagation}');
    expect(source).toContain('setIsHoverInfoOpen(false);');
    expect(source).toContain('setIsTabMenuOpen(true);');
    expect(source).toContain('open={resolveTabHoverOpen(isHoverInfoOpen, isTabMenuOpen)}');
    expect(source).toContain('onOpenChange={handleHoverInfoOpenChange}');
    expect(source).toContain('onOpenChange={handleTabMenuOpenChange}');
    expect(source).toContain('mouseEnterDelay={1.2}');
    expect(source).toMatch(/\.gn-v2-tab-hover-card \{[^}]*cursor: text;[^}]*user-select: text;/s);
    expect(source).toContain("--gn-v2-tab-hover-grid-columns: 56px minmax(0, 1fr);");
    expect(source).toMatch(/\.gn-v2-tab-hover-head \{[^}]*display: grid;[^}]*grid-template-columns: var\(--gn-v2-tab-hover-grid-columns\);/s);
    expect(source).toMatch(/\.gn-v2-tab-hover-head > strong \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/s);
    expect(source).toMatch(/\.gn-v2-tab-hover-row \{[^}]*grid-template-columns: var\(--gn-v2-tab-hover-grid-columns\);/s);
    expect(source).toMatch(/\.gn-v2-tab-hover-card \* \{[^}]*user-select: text;/s);
  });

  it('guards closing opened SQL file tabs with save confirmation', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(source).toContain('ReadSQLFile(filePath)');
    expect(source).toContain('isSQLFileMissingReadResult(res)');
    expect(source).toContain('isSQLFileMissingErrorMessage(errorMessage)');
    expect(source).toContain("title: '关闭已丢失的 SQL 文件标签？'");
    expect(source).toContain('关闭后将丢弃标签内的本地草稿');
    expect(source).toContain('confirmDirtyTabsOrClose();');
    expect(source).toContain("getSQLFileTabDraft(tab.id, String(tab.query ?? ''))");
    expect(source).toContain('hasSQLFileTabUnsavedChanges({ ...tab, query: draft }, normalizeSQLFileReadContent(res.data))');
    expect(source).toContain("title: '保存 SQL 文件修改？'");
    expect(source).toContain("okText: '保存并关闭'");
    expect(source).toContain('不保存');
    expect(source).toContain('WriteSQLFile(filePath, draft)');
    expect(source).toContain('clearSQLFileTabDraft(tab.id)');
    expect(source).toContain('closeTabsWithSQLFilePrompt([id], () => closeTab(id))');
    expect(source).toContain('closeTabsWithSQLFilePrompt(getCloseOtherTabIds(tabs, tab.id), () => closeOtherTabs(tab.id))');
    expect(source).toContain('closeTabsWithSQLFilePrompt(getCloseTabsToLeftIds(tabs, tab.id), () => closeTabsToLeft(tab.id))');
    expect(source).toContain('closeTabsWithSQLFilePrompt(getCloseTabsToRightIds(tabs, tab.id), () => closeTabsToRight(tab.id))');
    expect(source).toContain('closeTabsWithSQLFilePrompt(tabs.map((item) => item.id), () => closeAllTabs())');
  });
});
