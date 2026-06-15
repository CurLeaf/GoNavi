import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TAB_WORKBENCH_CLASS_NAME,
  resolveTabHoverOpen,
  shouldShowV2ConnectionLabel,
  TabHoverInfo,
  stopTabHoverDragPropagation,
} from './TabManager';
import { setCurrentLanguage } from '../i18n';
import type { TabData } from '../types';

const stripSourceComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

afterEach(() => {
  setCurrentLanguage('zh-CN');
});

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

  it('renders en-US v2 tab hover context for table tabs while keeping raw values raw', () => {
    setCurrentLanguage('en-US');
    const tab: TabData = {
      id: 'conn-1-main-users',
      title: 'users',
      type: 'table',
      connectionId: 'conn-1',
      tableName: '客户表',
    };

    const markup = renderToStaticMarkup(
      <TabHoverInfo
        tab={tab}
        displayTitle="[开发240] 表概览"
      />,
    );

    expect(markup).toContain('data-tab-hover-info="true"');
    expect(markup).toContain('[开发240] 表概览');
    expect(markup).toContain('Type');
    expect(markup).toContain('Table data');
    expect(markup).toContain('Connection');
    expect(markup).toContain('Unbound connection');
    expect(markup).toContain('Host');
    expect(markup).toContain('Not configured');
    expect(markup).toContain('Database');
    expect(markup).toContain('Not specified');
    expect(markup).toContain('Object');
    expect(markup).toContain('客户表');
    expect(markup).not.toContain('类型');
    expect(markup).not.toContain('表数据');
    expect(markup).not.toContain('未绑定连接');
    expect(markup).not.toContain('未配置');
    expect(markup).not.toContain('数据库');
    expect(markup).not.toContain('未指定');
    expect(markup).not.toContain('对象');
  });

  it('renders db identity for redis tabs without a database name', () => {
    setCurrentLanguage('en-US');
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

    expect(markup).toContain('<span>Redis</span><strong>[缓存 | 10.0.0.8] db2</strong>');
    expect(markup).not.toContain('<span>REDIS</span>');
    expect(markup).toContain('Redis Key');
    expect(markup).toContain('Not specified');
    expect(markup).toContain('db2');
  });

  it('keeps compact v2 tab kind badges catalog-backed instead of raw source abbreviations', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');
    const getTabKindLabelSource = source.slice(
      source.indexOf('const getTabKindLabel = (tab: TabData): string => {'),
      source.indexOf('export const TAB_WORKBENCH_CLASS_NAME'),
    );

    [
      'query',
      'table',
      'design',
      'table_overview',
      'redis',
      'jvm',
      'trigger',
      'materialized_view',
      'view',
      'event',
      'routine',
      'fallback',
    ].forEach((name) => {
      expect(getTabKindLabelSource).toContain(`t('tab_manager.kind_badge.${name}')`);
    });
    expect(getTabKindLabelSource).not.toMatch(/return '(TABLE|DESIGN|DB|REDIS|JVM|TRG|MV|VIEW|EVT|FUNC|TAB)'/);
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

  it('keeps v2 TabManager shell copy in the i18n catalog instead of hardcoded Chinese', () => {
    const source = stripSourceComments(readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8'));

    [
      '类型',
      '表数据',
      '连接',
      '未绑定连接',
      '未配置',
      '数据库',
      '未指定',
      '对象',
      'SQL 查询',
      '表设计',
      '表概览',
      'Redis 命令',
      'Redis 监控',
      'JVM 概览',
      'JVM 资源',
      'JVM 审计',
      'JVM 诊断',
      'JVM 监控',
      '触发器',
      '物化视图',
      '视图',
      '事件',
      '函数 / 过程',
      '标签页',
      '关闭其他页',
      '关闭左侧',
      '关闭右侧',
      '关闭所有',
      '关闭 ',
      'GoNavi 起始工作台',
      '快捷工作流',
      '连接、查询和分析从同一个工作台开始。',
      '选择数据源、打开查询编辑器，或把上下文交给 AI 面板继续处理。',
      '打开 AI',
      '配置数据源',
      'URI、SSH、代理和驱动集中设置',
      '启动 SQL 工作区',
      '按当前上下文打开查询编辑器',
      '进入 AI 辅助',
      '解释 SQL、生成查询、梳理结果',
    ].forEach((text) => {
      expect(source).not.toContain(text);
    });
  });

  it('subscribes TabManager and memoized localized tab items to languagePreference', () => {
    const source = readFileSync(new URL('./TabManager.tsx', import.meta.url), 'utf8');

    expect(source).toMatch(/const languagePreference = useStore\(\(?state\)? => state\.languagePreference\);/);
    expect(source).toMatch(/const items = useMemo\([\s\S]*\), \[[^\]]*languagePreference[^\]]*\]\);/);
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
    expect(source).toMatch(/\.gn-v2-tab-hover-row \{[^}]*grid-template-columns: var\(--gn-v2-tab-hover-grid-columns\);/s);
    expect(source).toMatch(/\.gn-v2-tab-hover-card \* \{[^}]*user-select: text;/s);
  });
});
