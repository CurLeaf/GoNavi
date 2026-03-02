import React, { useMemo, useRef, useState } from 'react';
import { Tabs, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
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
import TriggerViewer from './TriggerViewer';
import DefinitionViewer from './DefinitionViewer';
import type { TabData } from '../types';

const detectConnectionEnvLabel = (connectionName: string): string | null => {
  const tokens = connectionName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes('prod') || tokens.includes('production')) return 'PROD';
  if (tokens.includes('uat')) return 'UAT';
  if (tokens.includes('dev') || tokens.includes('development')) return 'DEV';
  if (tokens.includes('sit')) return 'SIT';
  if (tokens.includes('stg') || tokens.includes('stage') || tokens.includes('staging') || tokens.includes('pre')) return 'STG';
  if (tokens.includes('test') || tokens.includes('qa')) return 'TEST';
  return null;
};

const buildTabDisplayTitle = (tab: TabData, connectionName: string | undefined): string => {
  if (tab.type !== 'table' && tab.type !== 'design') return tab.title;
  if (!connectionName) return tab.title;
  const prefix = detectConnectionEnvLabel(connectionName) || connectionName;
  return `[${prefix}] ${tab.title}`;
};

type SortableTabLabelProps = {
  tabId: string;
  displayTitle: string;
  menuItems: MenuProps['items'];
  draggingTabId: string | null;
  onSelect: (tabId: string) => void;
};

const SortableTabLabel: React.FC<SortableTabLabelProps> = ({
  tabId,
  displayTitle,
  menuItems,
  draggingTabId,
  onSelect,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tabId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
    opacity: isDragging ? 0.88 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    touchAction: 'none',
  };
  const isDragBlocked = !!draggingTabId && draggingTabId !== tabId;

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
      <span
        ref={setNodeRef}
        style={style}
        className={`tab-dnd-label ${isDragging ? 'is-dragging' : ''}`}
        {...attributes}
        {...listeners}
        onClick={() => {
          if (!isDragBlocked) onSelect(tabId);
        }}
        onContextMenu={(e) => e.preventDefault()}
        title="拖拽调整标签顺序"
      >
        {displayTitle}
      </span>
    </Dropdown>
  );
};

const TabManager: React.FC = () => {
  const tabs = useStore(state => state.tabs);
  const connections = useStore(state => state.connections);
  const activeTabId = useStore(state => state.activeTabId);
  const setActiveTab = useStore(state => state.setActiveTab);
  const closeTab = useStore(state => state.closeTab);
  const closeOtherTabs = useStore(state => state.closeOtherTabs);
  const closeTabsToLeft = useStore(state => state.closeTabsToLeft);
  const closeTabsToRight = useStore(state => state.closeTabsToRight);
  const closeAllTabs = useStore(state => state.closeAllTabs);
  const moveTab = useStore(state => state.moveTab);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const onChange = (newActiveKey: string) => {
    setActiveTab(newActiveKey);
  };

  const onEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove') {
      closeTab(targetKey as string);
    }
  };

  const handleTabSelect = (tabId: string) => {
    if (Date.now() < suppressClickUntilRef.current) return;
    setActiveTab(tabId);
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

  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  const items = useMemo(() => tabs.map((tab, index) => {
    const connectionName = connections.find((conn) => conn.id === tab.connectionId)?.name;
    const displayTitle = buildTabDisplayTitle(tab, connectionName);
    let content;
    if (tab.type === 'query') {
      content = <QueryEditor tab={tab} />;
    } else if (tab.type === 'table') {
      content = <DataViewer tab={tab} />;
    } else if (tab.type === 'design') {
      content = <TableDesigner tab={tab} />;
    } else if (tab.type === 'redis-keys') {
      content = <RedisViewer connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'redis-command') {
      content = <RedisCommandEditor connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'trigger') {
      content = <TriggerViewer tab={tab} />;
    } else if (tab.type === 'view-def' || tab.type === 'routine-def') {
      content = <DefinitionViewer tab={tab} />;
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
          tabId={tab.id}
          displayTitle={displayTitle}
          menuItems={menuItems}
          draggingTabId={draggingTabId}
          onSelect={handleTabSelect}
        />
      ),
      key: tab.id,
      children: content,
    };
  }), [tabs, connections, closeOtherTabs, closeTabsToLeft, closeTabsToRight, closeAllTabs, draggingTabId]);

  return (
    <>
        <style>{`
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
                border-bottom: none !important;
            }
            .main-tabs .ant-tabs-tab {
              transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 120ms ease;
            }
            .main-tabs .tab-dnd-label {
              user-select: none;
              -webkit-user-select: none;
            }
            .main-tabs .tab-dnd-label.is-dragging {
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
            body[data-theme='dark'] .main-tabs .ant-tabs-tab.ant-tabs-tab-active {
              background: rgba(255, 214, 102, 0.12) !important;
              border-color: rgba(255, 214, 102, 0.4) !important;
            }
        `}</style>
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
                className="main-tabs"
                type="editable-card"
                onChange={onChange}
                activeKey={activeTabId || undefined}
                onEdit={onEdit}
                items={items}
                hideAdd
            />
          </SortableContext>
        </DndContext>
    </>
  );
};

export default TabManager;
