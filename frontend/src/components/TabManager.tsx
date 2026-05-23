import React, { useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Tabs, Tooltip } from 'antd';
import { AppstoreOutlined, CloseOutlined, ConsoleSqlOutlined, DatabaseOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import type { MenuProps, TabsProps } from 'antd';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { useStore } from '../store';
import DataViewer from './DataViewer';
import QueryEditor from './QueryEditor';
import TableDesigner from './TableDesigner';
import RedisViewer from './RedisViewer';
import RedisCommandEditor from './RedisCommandEditor';
import RedisMonitor from './RedisMonitor';
import TriggerViewer from './TriggerViewer';
import DefinitionViewer from './DefinitionViewer';
import TableOverview from './TableOverview';
import JVMOverview from './JVMOverview';
import JVMResourceBrowser from './JVMResourceBrowser';
import JVMAuditViewer from './JVMAuditViewer';
import JVMDiagnosticConsole from './JVMDiagnosticConsole';
import JVMMonitoringDashboard from './JVMMonitoringDashboard';
import type { TabData } from '../types';
import { buildTabDisplayTitle } from '../utils/tabDisplay';
import { resolveConnectionHostSummary } from '../utils/tabDisplay';
import { resolveConnectionAccentColor } from '../utils/connectionVisual';

const getTabKindLabel = (tab: TabData): string => {
  if (tab.type === 'query') return 'SQL';
  if (tab.type === 'table') return 'TABLE';
  if (tab.type === 'design') return 'DESIGN';
  if (tab.type === 'table-overview') return 'DB';
  if (tab.type.startsWith('redis')) return 'REDIS';
  if (tab.type.startsWith('jvm')) return 'JVM';
  if (tab.type === 'trigger') return 'TRG';
  if (tab.type === 'view-def') return tab.viewKind === 'materialized' ? 'MV' : 'VIEW';
  if (tab.type === 'routine-def') return 'FUNC';
  return 'TAB';
};

export const TAB_WORKBENCH_CLASS_NAME = 'tab-workbench';

const getTabKindIcon = (tab: TabData): React.ReactNode => {
  if (tab.type === 'query') return <ConsoleSqlOutlined />;
  if (tab.type === 'table-overview') return <DatabaseOutlined />;
  if (tab.type.startsWith('redis')) return <DatabaseOutlined />;
  if (tab.type.startsWith('jvm')) return <AppstoreOutlined />;
  return <DatabaseOutlined />;
};

const getTabKindTooltipLabel = (tab: TabData): string => {
  if (tab.type === 'query') return 'SQL 查询';
  if (tab.type === 'table') return '表数据';
  if (tab.type === 'design') return '表设计';
  if (tab.type === 'table-overview') return '表概览';
  if (tab.type === 'redis-keys') return 'Redis Key';
  if (tab.type === 'redis-command') return 'Redis 命令';
  if (tab.type === 'redis-monitor') return 'Redis 监控';
  if (tab.type === 'jvm-overview') return 'JVM 概览';
  if (tab.type === 'jvm-resource') return 'JVM 资源';
  if (tab.type === 'jvm-audit') return 'JVM 审计';
  if (tab.type === 'jvm-diagnostic') return 'JVM 诊断';
  if (tab.type === 'jvm-monitoring') return 'JVM 监控';
  if (tab.type === 'trigger') return '触发器';
  if (tab.type === 'view-def') return tab.viewKind === 'materialized' ? '物化视图' : '视图';
  if (tab.type === 'routine-def') return '函数 / 过程';
  return '标签页';
};

const getTabObjectLabel = (tab: TabData): string => {
  if (tab.tableName) return tab.tableName;
  if (tab.viewName) return tab.viewName;
  if (tab.routineName) return tab.routineName;
  if (tab.triggerName) return tab.triggerName;
  if (tab.resourcePath) return tab.resourcePath;
  if (tab.filePath) return tab.filePath;
  if (tab.type.startsWith('redis')) return `db${tab.redisDB ?? 0}`;
  return '';
};

export const stopTabHoverDragPropagation = (event: React.SyntheticEvent<HTMLElement>) => {
  event.stopPropagation();
};

export const resolveTabHoverOpen = (isHoverInfoOpen: boolean, isTabMenuOpen: boolean) =>
  isHoverInfoOpen && !isTabMenuOpen;

type TabHoverInfoProps = {
  tab: TabData;
  displayTitle: string;
  connectionLabel?: string;
  hostSummary?: string;
};

export const TabHoverInfo: React.FC<TabHoverInfoProps> = ({
  tab,
  displayTitle,
  connectionLabel,
  hostSummary,
}) => {
  const objectLabel = getTabObjectLabel(tab);
  const rows = [
    ['类型', getTabKindTooltipLabel(tab)],
    ['连接', connectionLabel || '未绑定连接'],
    ['Host', hostSummary || '未配置'],
    ['数据库', tab.dbName || '未指定'],
    ['对象', objectLabel],
  ].filter(([, value]) => Boolean(value));

  return (
    <div
      className="gn-v2-tab-hover-card"
      data-tab-hover-info="true"
      onPointerDown={stopTabHoverDragPropagation}
      onPointerMove={stopTabHoverDragPropagation}
      onPointerUp={stopTabHoverDragPropagation}
      onPointerDownCapture={stopTabHoverDragPropagation}
      onPointerUpCapture={stopTabHoverDragPropagation}
      onMouseDown={stopTabHoverDragPropagation}
      onMouseMove={stopTabHoverDragPropagation}
      onMouseUp={stopTabHoverDragPropagation}
      onClick={stopTabHoverDragPropagation}
      onClickCapture={stopTabHoverDragPropagation}
      onTouchStart={stopTabHoverDragPropagation}
      onTouchMove={stopTabHoverDragPropagation}
      onTouchEnd={stopTabHoverDragPropagation}
    >
      <div className="gn-v2-tab-hover-head">
        <span>{getTabKindLabel(tab)}</span>
        <strong>{displayTitle}</strong>
      </div>
      <div className="gn-v2-tab-hover-rows">
        {rows.map(([label, value]) => (
          <div className="gn-v2-tab-hover-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};

type SortableTabLabelProps = {
  tab: TabData;
  displayTitle: string;
  menuItems: MenuProps['items'];
  accentColor?: string;
  connectionLabel?: string;
  hostSummary?: string;
  isV2Ui?: boolean;
  onClose?: () => void;
};

const SortableTabLabel: React.FC<SortableTabLabelProps> = ({
  tab,
  displayTitle,
  menuItems,
  accentColor,
  connectionLabel,
  hostSummary,
  isV2Ui,
  onClose,
}) => {
  const [isHoverInfoOpen, setIsHoverInfoOpen] = useState(false);
  const [isTabMenuOpen, setIsTabMenuOpen] = useState(false);
  const labelStyle = accentColor
    ? ({ '--connection-accent': accentColor } as React.CSSProperties)
    : undefined;

  const handleTabLabelContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setIsHoverInfoOpen(false);
    setIsTabMenuOpen(true);
  };

  const handleTabMenuOpenChange = (open: boolean) => {
    setIsTabMenuOpen(open);
    setIsHoverInfoOpen(false);
  };

  const handleHoverInfoOpenChange = (open: boolean) => {
    setIsHoverInfoOpen(open && !isTabMenuOpen);
  };

  const labelNode = (
    <span
      className={`tab-dnd-label${accentColor ? ' has-connection-accent' : ''}${isV2Ui ? ' gn-v2-tab-label' : ''}`}
      onContextMenu={handleTabLabelContextMenu}
      title={isV2Ui ? undefined : displayTitle}
      style={labelStyle}
    >
      {isV2Ui ? (
        <span className="gn-v2-tab-kind-icon" aria-hidden="true">
          {getTabKindIcon(tab)}
        </span>
      ) : null}
      {isV2Ui ? <span className="gn-v2-tab-kind">{getTabKindLabel(tab)}</span> : null}
      {accentColor ? <span className="tab-connection-accent" aria-hidden="true" /> : null}
      <span className="tab-title-text">{displayTitle}</span>
      {isV2Ui && connectionLabel ? <span className="gn-v2-tab-conn">{connectionLabel}</span> : null}
      {isV2Ui && onClose ? (
        <button
          type="button"
          className="gn-v2-tab-close"
          aria-label={`关闭 ${displayTitle}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
        >
          <CloseOutlined />
        </button>
      ) : null}
    </span>
  );

  const wrappedLabel = isV2Ui ? (
    <Tooltip
      title={(
        <TabHoverInfo
          tab={tab}
          displayTitle={displayTitle}
          connectionLabel={connectionLabel}
          hostSummary={hostSummary}
        />
      )}
      placement="bottomLeft"
      mouseEnterDelay={0.25}
      open={resolveTabHoverOpen(isHoverInfoOpen, isTabMenuOpen)}
      onOpenChange={handleHoverInfoOpenChange}
      destroyOnHidden
      rootClassName="gn-v2-tab-hover-tooltip"
    >
      {labelNode}
    </Tooltip>
  ) : labelNode;

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']} onOpenChange={handleTabMenuOpenChange}>
      {wrappedLabel}
    </Dropdown>
  );
};

type DraggableTabNodeProps = {
  node: React.ReactElement;
};

const DraggableTabNode: React.FC<DraggableTabNodeProps> = ({ node }) => {
  const tabId = String(node.key || '').trim();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tabId });
  const style: React.CSSProperties = {
    ...(node.props.style || {}),
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
    opacity: isDragging ? 0.88 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
    zIndex: isDragging ? 2 : node.props.style?.zIndex,
  };

  return React.cloneElement(node, {
    ref: setNodeRef,
    style,
    ...attributes,
    ...listeners,
    className: `${node.props.className || ''} tab-dnd-node${isDragging ? ' is-dragging' : ''}`,
  });
};

const TabManager: React.FC = React.memo(() => {
  const tabs = useStore(state => state.tabs);
  const connections = useStore(state => state.connections);
  const theme = useStore(state => state.theme);
  const appearance = useStore(state => state.appearance);
  const activeTabId = useStore(state => state.activeTabId);
  const setActiveTab = useStore(state => state.setActiveTab);
  const addTab = useStore(state => state.addTab);
  const closeTab = useStore(state => state.closeTab);
  const closeOtherTabs = useStore(state => state.closeOtherTabs);
  const closeTabsToLeft = useStore(state => state.closeTabsToLeft);
  const closeTabsToRight = useStore(state => state.closeTabsToRight);
  const closeAllTabs = useStore(state => state.closeAllTabs);
  const moveTab = useStore(state => state.moveTab);
  const setAIPanelVisible = useStore(state => state.setAIPanelVisible);
  const tabsNavBorderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)';
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  const isV2Ui = appearance.uiVersion === 'v2';
  const hasTabs = tabs.length > 0;

  const onChange = (newActiveKey: string) => {
    setActiveTab(newActiveKey);
  };

  const onEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove') {
      closeTab(targetKey as string);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const sourceId = String(event.active.id || '').trim();
    setDraggingTabId(sourceId || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const sourceId = String(event.active.id || '').trim();
    const targetId = String(event.over?.id || '').trim();
    setDraggingTabId(null);
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }
    suppressClickUntilRef.current = Date.now() + 120;
    moveTab(sourceId, targetId);
  };

  const handleDragCancel = () => {
    setDraggingTabId(null);
  };

  React.useEffect(() => {
    const handleGlobalInsertSql = (e: any) => {
      const { sql, runImmediately, connectionId: eventConnId, dbName: eventDbName } = e.detail;
      if (!sql) return;

      const activeTab = tabs.find(t => t.id === activeTabId);
      
      // 🔧 runImmediately（点击"执行"）始终新建独立 tab，避免追加到已有 tab 导致 SQL 重复
      if (runImmediately) {
        const newTabId = 'tab-' + Date.now();
        const resolvedConnId = eventConnId || activeTab?.connectionId || (connections.length > 0 ? connections[0].id : '');
        const resolvedDbName = eventConnId ? (eventDbName || '') : (activeTab?.dbName || '');
        addTab({
            id: newTabId,
            type: 'query',
            title: '新建查询',
            query: sql,
            connectionId: resolvedConnId,
            dbName: resolvedDbName
        });
        setActiveTab(newTabId);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('gonavi:insert-sql-to-tab', {
                detail: { tabId: newTabId, sql, runImmediately: true, connectionId: resolvedConnId, dbName: resolvedDbName }
            }));
        }, 300);
        return;
      }
      
      // 插入模式：追加到已有 tab 或新建 tab
      if (activeTab && activeTab.type === 'query') {
        window.dispatchEvent(new CustomEvent('gonavi:insert-sql-to-tab', {
          detail: { tabId: activeTab.id, sql, runImmediately: false, connectionId: eventConnId, dbName: eventDbName }
        }));
      } else {
        const newTabId = 'tab-' + Date.now();
        const resolvedConnId = eventConnId || activeTab?.connectionId || (connections.length > 0 ? connections[0].id : '');
        const resolvedDbName = eventConnId ? (eventDbName || '') : (activeTab?.dbName || '');
        addTab({
            id: newTabId,
            type: 'query',
            title: '新建查询',
            query: sql,
            connectionId: resolvedConnId,
            dbName: resolvedDbName
        });
        setActiveTab(newTabId);
      }
    };
    window.addEventListener('gonavi:insert-sql', handleGlobalInsertSql);
    return () => window.removeEventListener('gonavi:insert-sql', handleGlobalInsertSql);
  }, [tabs, activeTabId, addTab, setActiveTab, connections]);

  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  const renderTabBar: TabsProps['renderTabBar'] = (tabBarProps, DefaultTabBar) => (
    <DefaultTabBar {...tabBarProps}>
      {(node) => <DraggableTabNode key={node.key} node={node} />}
    </DefaultTabBar>
  );

  const items = useMemo(() => tabs.map((tab, index) => {
    const connection = connections.find((conn) => conn.id === tab.connectionId);
    const displayTitle = buildTabDisplayTitle(tab, connection);
    const accentColor = connection ? resolveConnectionAccentColor(connection) : undefined;
    const hostSummary = resolveConnectionHostSummary(connection?.config);
    const tabIsActive = tab.id === activeTabId;
    let content;
    if (tab.type === 'query') {
      content = <QueryEditor tab={tab} isActive={tabIsActive} />;
    } else if (tab.type === 'table') {
      content = <DataViewer tab={tab} isActive={tabIsActive} />;
    } else if (tab.type === 'design') {
      content = <TableDesigner tab={tab} />;
    } else if (tab.type === 'redis-keys') {
      content = <RedisViewer connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'redis-command') {
      content = <RedisCommandEditor connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'redis-monitor') {
      content = <RedisMonitor connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'trigger') {
      content = <TriggerViewer tab={tab} />;
    } else if (tab.type === 'view-def' || tab.type === 'routine-def') {
      content = <DefinitionViewer tab={tab} />;
    } else if (tab.type === 'table-overview') {
      content = <TableOverview tab={tab} />;
    } else if (tab.type === 'jvm-overview') {
      content = <JVMOverview tab={tab} />;
    } else if (tab.type === 'jvm-resource') {
      content = <JVMResourceBrowser tab={tab} />;
    } else if (tab.type === 'jvm-audit') {
      content = <JVMAuditViewer tab={tab} />;
    } else if (tab.type === 'jvm-diagnostic') {
      content = <JVMDiagnosticConsole tab={tab} />;
    } else if (tab.type === 'jvm-monitoring') {
      content = <JVMMonitoringDashboard tab={tab} />;
    }

    const menuItems: MenuProps['items'] = [
      {
        key: 'close-other',
        label: '关闭其他页',
        disabled: tabs.length <= 1,
        onClick: () => closeOtherTabs(tab.id),
      },
      {
        key: 'close-left',
        label: '关闭左侧',
        disabled: index === 0,
        onClick: () => closeTabsToLeft(tab.id),
      },
      {
        key: 'close-right',
        label: '关闭右侧',
        disabled: index === tabs.length - 1,
        onClick: () => closeTabsToRight(tab.id),
      },
      { type: 'divider' },
      {
        key: 'close-all',
        label: '关闭所有',
        disabled: tabs.length === 0,
        onClick: () => closeAllTabs(),
      },
    ];
    
    return {
      label: (
        <SortableTabLabel
          tab={tab}
          displayTitle={displayTitle}
          menuItems={menuItems}
          accentColor={accentColor}
          connectionLabel={connection?.name}
          hostSummary={hostSummary}
          isV2Ui={isV2Ui}
          onClose={() => closeTab(tab.id)}
        />
      ),
      key: tab.id,
      closable: !isV2Ui,
      children: content,
    };
  }), [tabs, connections, activeTabId, closeOtherTabs, closeTabsToLeft, closeTabsToRight, closeAllTabs, closeTab, isV2Ui]);

  const handleOpenConnectionModal = () => {
    const target = document.querySelector<HTMLButtonElement>('[data-gonavi-create-connection-action="true"]');
    target?.click();
  };

  const handleOpenAI = () => {
    setAIPanelVisible(true);
  };

  const EmptyWorkbench = (
    <div className="gn-v2-empty-workbench">
      <section className="gn-v2-empty-hero" aria-label="GoNavi 起始工作台">
        <div className="gn-v2-empty-eyebrow">
          <span>WORKBENCH</span>
          <span>{connections.length} connections</span>
        </div>
        <h1>连接、查询和分析从同一个工作台开始。</h1>
        <p>选择数据源、打开查询编辑器，或把上下文交给 AI 面板继续处理。</p>
        <div className="gn-v2-empty-actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenConnectionModal}>
            新建连接
          </Button>
          <Button icon={<ConsoleSqlOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('gonavi:create-query-tab'))}>
            新建查询
          </Button>
          <Button icon={<RobotOutlined />} onClick={handleOpenAI}>
            打开 AI
          </Button>
        </div>
      </section>
      <section className="gn-v2-empty-panel" aria-label="快捷工作流">
        <div className="gn-v2-panel-heading">
          <span>快捷工作流</span>
          <AppstoreOutlined />
        </div>
        <button type="button" onClick={handleOpenConnectionModal}>
          <DatabaseOutlined />
          <span>
            <strong>配置数据源</strong>
            <small>URI、SSH、代理和驱动集中设置</small>
          </span>
        </button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('gonavi:create-query-tab'))}>
          <ConsoleSqlOutlined />
          <span>
            <strong>启动 SQL 工作区</strong>
            <small>按当前上下文打开查询编辑器</small>
          </span>
        </button>
        <button type="button" onClick={handleOpenAI}>
          <RobotOutlined />
          <span>
            <strong>进入 AI 辅助</strong>
            <small>解释 SQL、生成查询、梳理结果</small>
          </span>
        </button>
      </section>
    </div>
  );

  return (
    <div className={`${TAB_WORKBENCH_CLASS_NAME}${isV2Ui ? ' gn-v2-tab-workbench' : ''}`}>
        <style>{`
            .${TAB_WORKBENCH_CLASS_NAME} {
              height: 100%;
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .main-tabs {
              height: 100%;
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .main-tabs .ant-tabs-nav {
              flex: 0 0 auto;
              margin: 0;
            }
            .main-tabs .ant-tabs-content-holder {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .main-tabs .ant-tabs-content {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              display: flex;
              flex-direction: column;
            }
            .main-tabs .ant-tabs-tabpane {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .main-tabs .ant-tabs-tabpane > div {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
            }
            .main-tabs .ant-tabs-tabpane-hidden {
              display: none !important;
            }
            .main-tabs .ant-tabs-nav::before {
                border-bottom: 1px solid ${tabsNavBorderColor} !important;
            }
            .main-tabs .ant-tabs-tab {
              transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 120ms ease;
            }
            .main-tabs .tab-dnd-label {
              user-select: none;
              -webkit-user-select: none;
              display: inline-flex;
              align-items: center;
              gap: 7px;
              max-width: 100%;
            }
            .main-tabs .tab-dnd-label.has-connection-accent {
              position: relative;
            }
            .main-tabs .tab-connection-accent {
              width: 9px;
              height: 9px;
              border-radius: 999px;
              background: var(--connection-accent);
              box-shadow: 0 0 0 2px color-mix(in srgb, var(--connection-accent) 22%, transparent);
              flex: 0 0 auto;
            }
            .main-tabs .tab-title-text {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .main-tabs .tab-dnd-node.is-dragging,
            .main-tabs .tab-dnd-node.is-dragging .tab-dnd-label {
              cursor: grabbing !important;
            }
            body[data-theme='dark'] .main-tabs .ant-tabs-tab-btn:focus-visible {
              outline: none !important;
              border-radius: 6px;
              box-shadow: 0 0 0 2px rgba(255, 214, 102, 0.72);
              background: rgba(255, 214, 102, 0.16);
            }
            body[data-theme='light'] .main-tabs .ant-tabs-tab-btn:focus-visible {
              outline: none !important;
              border-radius: 6px;
              box-shadow: 0 0 0 2px rgba(9, 109, 217, 0.32);
              background: rgba(9, 109, 217, 0.08);
            }
            body[data-theme='light'] .main-tabs .ant-tabs-tab.ant-tabs-tab-active {
              background: rgba(24, 144, 255, 0.10) !important;
              border-color: rgba(24, 144, 255, 0.28) !important;
            }
body[data-theme='dark'] .main-tabs .ant-tabs-tab.ant-tabs-tab-active {
              background: rgba(255, 214, 102, 0.12) !important;
              border-color: rgba(255, 214, 102, 0.4) !important;
            }
            body[data-ui-version='v2'] .main-tabs .ant-tabs-tab.ant-tabs-tab-active {
              background: var(--gn-bg-panel) !important;
              border-color: var(--gn-br-2) !important;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-tooltip .ant-tooltip-inner {
              min-width: 260px;
              padding: 0;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-tooltip {
              pointer-events: auto;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-card {
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding: 10px;
              color: var(--gn-fg-2);
              cursor: text;
              user-select: text;
              -webkit-user-select: text;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-card * {
              user-select: text;
              -webkit-user-select: text;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-head {
              display: flex;
              align-items: center;
              gap: 8px;
              min-width: 0;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-head > span {
              flex: 0 0 auto;
              padding: 2px 6px;
              border-radius: 5px;
              background: var(--gn-bg-active);
              color: var(--gn-accent-2);
              font-family: var(--gn-font-mono);
              font-size: 10px;
              font-weight: 700;
              line-height: 14px;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-head > strong {
              min-width: 0;
              overflow: hidden;
              color: var(--gn-fg-1);
              font-size: var(--gn-font-size-sm, 12px);
              font-weight: 700;
              line-height: 18px;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-rows {
              display: grid;
              gap: 5px;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-row {
              display: grid;
              grid-template-columns: 52px minmax(0, 1fr);
              align-items: start;
              gap: 8px;
              font-size: var(--gn-font-size-sm, 12px);
              line-height: 18px;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-row > span {
              color: var(--gn-fg-5);
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-row > strong {
              min-width: 0;
              overflow-wrap: anywhere;
              color: var(--gn-fg-2);
              font-weight: 600;
            }
        `}</style>
        {isV2Ui && !hasTabs ? (
          EmptyWorkbench
        ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <Tabs
                className={`main-tabs${isV2Ui ? ' gn-v2-main-tabs' : ''}`}
                type="editable-card"
                destroyOnHidden={false}
                onChange={(newActiveKey) => {
                  if (Date.now() < suppressClickUntilRef.current) return;
                  onChange(newActiveKey);
                }}
                activeKey={activeTabId || undefined}
                onEdit={onEdit}
                items={items}
                hideAdd
                renderTabBar={renderTabBar}
            />
          </SortableContext>
        </DndContext>
        )}
    </div>
  );
});

export default TabManager;
