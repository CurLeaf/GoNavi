import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TAB_WORKBENCH_CLASS_NAME, resolveTabHoverOpen, TabHoverInfo, stopTabHoverDragPropagation } from './TabManager';
import type { TabData } from '../types';

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
    expect(source).toMatch(/\.gn-v2-tab-hover-card \{[^}]*cursor: text;[^}]*user-select: text;/s);
    expect(source).toMatch(/\.gn-v2-tab-hover-card \* \{[^}]*user-select: text;/s);
  });
});
