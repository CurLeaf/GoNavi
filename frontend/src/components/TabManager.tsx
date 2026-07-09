import Modal from './common/ResizableDraggableModal';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, message, Tabs, Tooltip } from 'antd';
import { AppstoreOutlined, CloseOutlined, ConsoleSqlOutlined, DatabaseOutlined, PlusOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';
import type { MenuProps, TabsProps } from 'antd';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '../store';
import type { TabData } from '../types';
import { t } from '../i18n';
import {
  buildTabDisplayModel,
  resolveConnectionHostSummary,
  type TabDisplayPart,
  type TabDisplayModel,
} from '../utils/tabDisplay';
import { ReadSQLFile, WriteSQLFile } from '../../wailsjs/go/app/App';
import {
  getSQLFileTabPath,
  hasSQLFileTabUnsavedChanges,
  isSQLFileMissingErrorMessage,
  isSQLFileMissingReadResult,
  isSQLFileQueryTab,
  normalizeSQLFileReadContent,
} from '../utils/sqlFileTabDirty';
import { clearSQLFileTabDraft, getSQLFileTabDraft } from '../utils/sqlFileTabDrafts';
import WorkbenchTabContent from './WorkbenchTabContent';
import DetachDragPreview, {
  buildDetachDragPreviewState,
  type DetachDragPreviewState,
} from './DetachDragPreview';
import {
  resolveResultDetachPreferredBounds,
  shouldDetachTabByDrag,
} from '../utils/detachedWindow';

const getTabKindLabel = (tab: TabData): string => {
  if (tab.type === 'query') return t('tab_manager.kind_badge.query');
  if (tab.type === 'table') return t('tab_manager.kind_badge.table');
  if (tab.type === 'design') return t('tab_manager.kind_badge.design');
  if (tab.type === 'table-overview') return t('tab_manager.kind_badge.table_overview');
  if (tab.type === 'table-export') return t('tab_manager.kind_badge.table_export');
  if (tab.type === 'sql-file-execution') return t('sidebar.sql_file_exec.title');
  if (tab.type === 'sql-analysis') return t('tab_manager.kind_badge.sql_analysis');
  if (tab.type.startsWith('redis')) return t('tab_manager.kind_badge.redis');
  if (tab.type.startsWith('jvm')) return t('tab_manager.kind_badge.jvm');
  if (tab.type === 'trigger') return t('tab_manager.kind_badge.trigger');
  if (tab.type === 'view-def') {
    return tab.viewKind === 'materialized'
      ? t('tab_manager.kind_badge.materialized_view')
      : t('tab_manager.kind_badge.view');
  }
  if (tab.type === 'event-def') return t('tab_manager.kind_badge.event');
  if (tab.type === 'routine-def') return t('tab_manager.kind_badge.routine');
  if (tab.type === 'sequence-def') return t('tab_manager.kind_badge.sequence');
  if (tab.type === 'package-def') return t('tab_manager.kind_badge.package');
  return t('tab_manager.kind_badge.fallback');
};

export const TAB_WORKBENCH_CLASS_NAME = 'tab-workbench';

const getTabKindTooltipLabel = (tab: TabData): string => {
  if (tab.type === 'query') return t('tab_manager.hover.kind.query');
  if (tab.type === 'table') return t('tab_manager.hover.kind.table');
  if (tab.type === 'design') return t('tab_manager.hover.kind.design');
  if (tab.type === 'table-overview') return t('tab_manager.hover.kind.table_overview');
  if (tab.type === 'table-export') return t('tab_manager.hover.kind.table_export');
  if (tab.type === 'sql-file-execution') return t('sidebar.sql_file_exec.title');
  if (tab.type === 'sql-analysis') return t('tab_manager.hover.kind.sql_analysis');
  if (tab.type === 'redis-keys') return t('tab_manager.hover.kind.redis_keys');
  if (tab.type === 'redis-command') return t('tab_manager.hover.kind.redis_command');
  if (tab.type === 'redis-monitor') return t('tab_manager.hover.kind.redis_monitor');
  if (tab.type === 'jvm-overview') return t('tab_manager.hover.kind.jvm_overview');
  if (tab.type === 'jvm-resource') return t('tab_manager.hover.kind.jvm_resource');
  if (tab.type === 'jvm-audit') return t('tab_manager.hover.kind.jvm_audit');
  if (tab.type === 'jvm-diagnostic') return t('tab_manager.hover.kind.jvm_diagnostic');
  if (tab.type === 'jvm-monitoring') return t('tab_manager.hover.kind.jvm_monitoring');
  if (tab.type === 'trigger') return t('tab_manager.hover.kind.trigger');
  if (tab.type === 'view-def') {
    return tab.viewKind === 'materialized'
      ? t('tab_manager.hover.kind.materialized_view')
      : t('tab_manager.hover.kind.view');
  }
  if (tab.type === 'event-def') return t('tab_manager.hover.kind.event');
  if (tab.type === 'routine-def') return t('tab_manager.hover.kind.routine');
  if (tab.type === 'sequence-def') return t('tab_manager.hover.kind.sequence');
  if (tab.type === 'package-def') return t('tab_manager.hover.kind.package');
  return t('tab_manager.hover.kind.fallback');
};

const getTabObjectLabel = (tab: TabData): string => {
  if (tab.tableName) return tab.tableName;
  if (tab.viewName) return tab.viewName;
  if (tab.eventName) return tab.eventName;
  if (tab.routineName) return tab.routineName;
  if (tab.sequenceName) return tab.sequenceName;
  if (tab.packageName) return tab.packageName;
  if (tab.triggerName) return tab.triggerName;
  if (tab.resourcePath) return tab.resourcePath;
  if (tab.filePath) return tab.filePath;
  if (tab.type === 'sql-analysis') return tab.title;
  if (tab.type.startsWith('redis')) return `db${tab.redisDB ?? 0}`;
  return '';
};

const getCloseOtherTabIds = (tabs: TabData[], id: string): string[] =>
  tabs.filter((tab) => tab.id !== id).map((tab) => tab.id);

const getCloseTabsToLeftIds = (tabs: TabData[], id: string): string[] => {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index <= 0) return [];
  return tabs.slice(0, index).map((tab) => tab.id);
};

const getCloseTabsToRightIds = (tabs: TabData[], id: string): string[] => {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0 || index >= tabs.length - 1) return [];
  return tabs.slice(index + 1).map((tab) => tab.id);
};

export const stopTabHoverDragPropagation = (event: React.SyntheticEvent<HTMLElement>) => {
  event.stopPropagation();
};

export const resolveTabHoverOpen = (isHoverInfoOpen: boolean, isTabMenuOpen: boolean) =>
  isHoverInfoOpen && !isTabMenuOpen;

export const openTabDisplaySettings = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent('gonavi:open-tab-display-settings'));
};

export const shouldShowV2ConnectionLabel = (displayTitle: string, connectionLabel?: string): boolean => {
  const normalizedConnectionLabel = String(connectionLabel || '').trim();
  if (!normalizedConnectionLabel) {
    return false;
  }

  const normalizedDisplayTitle = String(displayTitle || '').trim();
  if (!normalizedDisplayTitle) {
    return true;
  }

  const escapedConnectionLabel = normalizedConnectionLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixedConnectionPattern = new RegExp(`^\\[${escapedConnectionLabel}(?:\\s*[|\\]])`, 'i');
  return !prefixedConnectionPattern.test(normalizedDisplayTitle);
};

export const resolveTabHoverTitle = (displayModel: TabDisplayModel | undefined, fallbackTitle: string): string => {
  if (!displayModel) {
    return fallbackTitle;
  }

  const objectPart = [...displayModel.primaryParts, ...displayModel.secondaryParts]
    .find((part) => part.key === 'object');
  if (objectPart?.text) {
    return objectPart.text;
  }

  const primaryText = displayModel.primaryParts
    .filter((part) => part.key !== 'kind')
    .map((part) => part.text)
    .join(' ')
    .trim();
  return primaryText || displayModel.primaryText || fallbackTitle;
};

type TabHoverInfoProps = {
  tab: TabData;
  displayModel?: TabDisplayModel;
  displayTitle: string;
  connectionLabel?: string;
  hostSummary?: string;
};

export const TabHoverInfo: React.FC<TabHoverInfoProps> = ({
  tab,
  displayModel,
  displayTitle,
  connectionLabel,
  hostSummary,
}) => {
  const objectLabel = getTabObjectLabel(tab);
  const hoverTitle = resolveTabHoverTitle(displayModel, displayTitle);
  const schemaPart = displayModel
    ? [...displayModel.primaryParts, ...displayModel.secondaryParts].find((part) => part.key === 'schema')
    : undefined;
  const rows = [
    [t('tab_manager.hover.label.type'), getTabKindTooltipLabel(tab)],
    [t('tab_manager.hover.label.connection'), connectionLabel || t('tab_manager.hover.fallback.unbound_connection')],
    ['Host', hostSummary || t('tab_manager.hover.fallback.host_not_configured')],
    [t('tab_manager.hover.label.database'), tab.dbName || t('tab_manager.hover.fallback.database_not_specified')],
    ['Schema', schemaPart?.value],
    [t('tab_manager.hover.label.object'), objectLabel],
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
        <strong>{hoverTitle}</strong>
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
  displayModel: TabDisplayModel;
  displayTitle: string;
  menuItems: MenuProps['items'];
  connectionLabel?: string;
  hostSummary?: string;
  isV2Ui?: boolean;
  onClose?: () => void;
};

const renderV2TabDisplayPart = (part: TabDisplayPart) => {
  if (part.key === 'kind') {
    return (
      <span className="gn-v2-tab-kind" key={part.key}>
        {part.text}
      </span>
    );
  }
  return (
    <span className={`gn-v2-tab-label-part gn-v2-tab-label-part-${part.key}`} key={part.key}>
      {part.text}
    </span>
  );
};

const SortableTabLabel: React.FC<SortableTabLabelProps> = ({
  tab,
  displayModel,
  displayTitle,
  menuItems,
  connectionLabel,
  hostSummary,
  isV2Ui,
  onClose,
}) => {
  const [isHoverInfoOpen, setIsHoverInfoOpen] = useState(false);
  const [isTabMenuOpen, setIsTabMenuOpen] = useState(false);

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

  const tabDisplayPartCount = displayModel.primaryParts.length + displayModel.secondaryParts.length;
  const showSecondaryLine = isV2Ui && displayModel.layout === 'double' && Boolean(displayModel.secondaryText);
  const labelNode = (
    <span
      className={`tab-dnd-label${isV2Ui ? ' gn-v2-tab-label' : ''}${showSecondaryLine ? ' gn-v2-tab-label-double' : ''}${tabDisplayPartCount >= 4 ? ' gn-v2-tab-label-rich' : ''}`}
      onContextMenu={handleTabLabelContextMenu}
      title={isV2Ui ? undefined : displayTitle}
    >
      {isV2Ui ? (
        <span className="gn-v2-tab-label-content">
          <span className="gn-v2-tab-label-main tab-title-text">
            {displayModel.primaryParts.length > 0
              ? displayModel.primaryParts.map(renderV2TabDisplayPart)
              : displayModel.primaryText}
          </span>
          {showSecondaryLine ? (
            <span className="gn-v2-tab-label-secondary" title={displayModel.secondaryText}>
              {displayModel.secondaryText}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="tab-title-text">{displayTitle}</span>
      )}
      {isV2Ui && onClose ? (
        <button
          type="button"
          className="gn-v2-tab-close"
          aria-label={t('tab_manager.close_aria', { title: displayTitle })}
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
          displayModel={displayModel}
          displayTitle={displayTitle}
          connectionLabel={connectionLabel}
          hostSummary={hostSummary}
        />
      )}
      placement="bottomLeft"
      mouseEnterDelay={1.2}
      open={resolveTabHoverOpen(isHoverInfoOpen, isTabMenuOpen)}
      onOpenChange={handleHoverInfoOpenChange}
      destroyOnHidden
      rootClassName="gn-v2-tab-hover-tooltip"
    >
      {labelNode}
    </Tooltip>
  ) : labelNode;

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['contextMenu']}
      onOpenChange={handleTabMenuOpenChange}
      rootClassName={isV2Ui ? 'gn-v2-tab-context-menu-popup' : undefined}
    >
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
  const detachedWorkbenchWindows = useStore(state => state.detachedWorkbenchWindows);
  const connections = useStore(state => state.connections);
  const theme = useStore(state => state.theme);
  const appearance = useStore(state => state.appearance);
  const languagePreference = useStore(state => state.languagePreference);
  const activeTabId = useStore(state => state.activeTabId);
  const setActiveTab = useStore(state => state.setActiveTab);
  const addTab = useStore(state => state.addTab);
  const closeTab = useStore(state => state.closeTab);
  const closeOtherTabs = useStore(state => state.closeOtherTabs);
  const closeTabsToLeft = useStore(state => state.closeTabsToLeft);
  const closeTabsToRight = useStore(state => state.closeTabsToRight);
  const closeAllTabs = useStore(state => state.closeAllTabs);
  const moveTab = useStore(state => state.moveTab);
  const detachWorkbenchTab = useStore(state => state.detachWorkbenchTab);
  const setAIPanelVisible = useStore(state => state.setAIPanelVisible);
  const detachedTabIdSet = useMemo(
    () => new Set(detachedWorkbenchWindows.map((windowState) => windowState.tabId)),
    [detachedWorkbenchWindows],
  );
  const dockedTabs = useMemo(
    () => tabs.filter((tab) => !detachedTabIdSet.has(tab.id)),
    [detachedTabIdSet, tabs],
  );
  const tabsNavBorderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)';
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [detachDragPreview, setDetachDragPreview] = useState<DetachDragPreviewState | null>(null);
  const detachDragSessionRef = useRef<{
    tabId: string;
    title: string;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );
  const isV2Ui = appearance.uiVersion === 'v2';
  const hasTabs = tabs.length > 0;
  const hasDockedTabs = dockedTabs.length > 0;
  const dockedActiveTabId = useMemo(() => {
    if (activeTabId && dockedTabs.some((tab) => tab.id === activeTabId)) {
      return activeTabId;
    }
    return dockedTabs[0]?.id || null;
  }, [activeTabId, dockedTabs]);
  const pendingCloseTabIdsRef = useRef<Set<string>>(new Set());

  const onChange = (newActiveKey: string) => {
    setActiveTab(newActiveKey);
  };

  const requestCloseSQLFileTabs = useCallback(async (
    targetTabs: TabData[],
    closeConfirmedTabs: () => void,
  ) => {
    const candidateTabs = targetTabs.filter(isSQLFileQueryTab);
    if (candidateTabs.length === 0) {
      closeConfirmedTabs();
      return;
    }

    const closeConfirmedTabsAndClearDrafts = () => {
      closeConfirmedTabs();
      candidateTabs.forEach((tab) => clearSQLFileTabDraft(tab.id));
    };

    const dirtyTabs: Array<{ tab: TabData; draft: string }> = [];
    const missingFileTabs: Array<{ tab: TabData; filePath: string }> = [];
    for (const tab of candidateTabs) {
      const filePath = getSQLFileTabPath(tab);
      if (!filePath) continue;
      try {
        const res = await ReadSQLFile(filePath);
        if (!res.success) {
          if (isSQLFileMissingReadResult(res)) {
            missingFileTabs.push({ tab, filePath });
            continue;
          }
          message.error(t('tab_manager.sql_file_close.read_failed_cancel_close', { detail: res.message || filePath }));
          return;
        }
        const draft = getSQLFileTabDraft(tab.id, String(tab.query ?? ''));
        if (hasSQLFileTabUnsavedChanges({ ...tab, query: draft }, normalizeSQLFileReadContent(res.data))) {
          dirtyTabs.push({ tab, draft });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (isSQLFileMissingErrorMessage(errorMessage)) {
          missingFileTabs.push({ tab, filePath });
          continue;
        }
        message.error(t('tab_manager.sql_file_close.read_failed_cancel_close', { detail: errorMessage }));
        return;
      }
    }

    const confirmDirtyTabsOrClose = () => {
      if (dirtyTabs.length === 0) {
        closeConfirmedTabsAndClearDrafts();
        return;
      }

      const firstDirtyTab = dirtyTabs[0].tab;
      const dirtyFilePath = getSQLFileTabPath(firstDirtyTab);
      const dirtyLabel = dirtyTabs.length === 1
        ? t('tab_manager.sql_file_close.dirty_single_label', { title: firstDirtyTab.title || dirtyFilePath })
        : t('tab_manager.sql_file_close.dirty_multiple_label', { count: dirtyTabs.length });

      let destroyConfirm: (() => void) | null = null;
      const confirmRef = Modal.confirm({
        title: t('tab_manager.sql_file_close.save_confirm_title'),
        content: t('tab_manager.sql_file_close.save_confirm_content', { label: dirtyLabel }),
        okText: t('tab_manager.sql_file_close.save_and_close'),
        cancelText: t('common.cancel'),
        closable: true,
        maskClosable: true,
        okButtonProps: { type: 'primary' },
        footer: (_, { OkBtn, CancelBtn }) => (
          <>
            <Button
              onClick={() => {
                destroyConfirm?.();
                closeConfirmedTabsAndClearDrafts();
              }}
            >
              {t('tab_manager.sql_file_close.discard')}
            </Button>
            <CancelBtn />
            <OkBtn />
          </>
        ),
        onOk: async () => {
          try {
            for (const { tab, draft } of dirtyTabs) {
              const filePath = getSQLFileTabPath(tab);
              if (!filePath) continue;
              const res = await WriteSQLFile(filePath, draft);
              if (!res.success) {
                throw new Error(t('tab_manager.sql_file_close.save_failed', {
                  title: tab.title || filePath,
                  detail: res.message || t('tab_manager.sql_file_close.unknown_error'),
                }));
              }
            }
            message.success(t('tab_manager.sql_file_close.saved'));
            closeConfirmedTabsAndClearDrafts();
          } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
            throw error;
          }
        },
      });
      destroyConfirm = confirmRef.destroy;
    };

    if (missingFileTabs.length > 0) {
      const firstMissing = missingFileTabs[0];
      const missingLabel = missingFileTabs.length === 1
        ? t('tab_manager.sql_file_close.missing_single_label', { title: firstMissing.tab.title || firstMissing.filePath })
        : t('tab_manager.sql_file_close.missing_multiple_label', { count: missingFileTabs.length });
      Modal.confirm({
        title: t('tab_manager.sql_file_close.missing_confirm_title'),
        content: t('tab_manager.sql_file_close.missing_confirm_content', { label: missingLabel }),
        okText: dirtyTabs.length > 0 ? t('tab_manager.sql_file_close.continue_close') : t('tab_manager.sql_file_close.close_tabs'),
        cancelText: t('common.cancel'),
        closable: true,
        maskClosable: true,
        okButtonProps: { danger: true },
        onOk: () => {
          confirmDirtyTabsOrClose();
        },
      });
      return;
    }

    confirmDirtyTabsOrClose();
  }, []);

  const closeTabsWithSQLFilePrompt = useCallback((targetIds: string[], closeConfirmedTabs: () => void) => {
    const uniqueIds = Array.from(new Set(targetIds.map((id) => String(id || '').trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const dedupeKey = uniqueIds.slice().sort().join('\n');
    if (pendingCloseTabIdsRef.current.has(dedupeKey)) return;
    pendingCloseTabIdsRef.current.add(dedupeKey);
    const targetTabs = tabs.filter((tab) => uniqueIds.includes(tab.id));
    void requestCloseSQLFileTabs(targetTabs, closeConfirmedTabs).finally(() => {
      pendingCloseTabIdsRef.current.delete(dedupeKey);
    });
  }, [requestCloseSQLFileTabs, tabs]);

  const onEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove') {
      const id = String(targetKey || '');
      closeTabsWithSQLFilePrompt([id], () => closeTab(id));
    }
  };

  const clearDetachDragSession = useCallback(() => {
    detachDragSessionRef.current = null;
    setDetachDragPreview(null);
    document.documentElement.classList.remove('gn-workbench-tab-detaching');
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const sourceId = String(event.active.id || '').trim();
    setDraggingTabId(sourceId || null);
    const tab = dockedTabs.find((item) => item.id === sourceId);
    const connection = connections.find((conn) => conn.id === tab?.connectionId);
    const displayModel = tab
      ? buildTabDisplayModel(tab, connection, appearance.tabDisplay, t)
      : null;
    const title = displayModel?.fullTitle || tab?.title || t('tab_manager.detached.title_fallback');
    const pointerEvent = event.activatorEvent as PointerEvent | MouseEvent | undefined;
    const startX = typeof pointerEvent?.clientX === 'number' ? pointerEvent.clientX : 0;
    const startY = typeof pointerEvent?.clientY === 'number' ? pointerEvent.clientY : 0;
    detachDragSessionRef.current = sourceId
      ? { tabId: sourceId, title, startX, startY }
      : null;
    document.documentElement.classList.add('gn-workbench-tab-detaching');
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const session = detachDragSessionRef.current;
    if (!session) return;
    const deltaX = Number(event.delta?.x || 0);
    const deltaY = Number(event.delta?.y || 0);
    setDetachDragPreview(buildDetachDragPreviewState({
      title: session.title,
      clientX: session.startX + deltaX,
      clientY: session.startY + deltaY,
      deltaY,
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const sourceId = String(event.active.id || '').trim();
    const targetId = String(event.over?.id || '').trim();
    const deltaX = Number(event.delta?.x || 0);
    const deltaY = Number(event.delta?.y || 0);
    const session = detachDragSessionRef.current;
    setDraggingTabId(null);
    clearDetachDragSession();
    if (!sourceId) {
      return;
    }
    if (shouldDetachTabByDrag(deltaY, targetId || null)) {
      suppressClickUntilRef.current = Date.now() + 120;
      const releaseX = (session?.startX ?? 0) + deltaX;
      const releaseY = (session?.startY ?? 0) + deltaY;
      const preferred = resolveResultDetachPreferredBounds(releaseX, releaseY);
      detachWorkbenchTab(sourceId, preferred);
      return;
    }
    if (!targetId || sourceId === targetId) {
      return;
    }
    suppressClickUntilRef.current = Date.now() + 120;
    moveTab(sourceId, targetId);
  };

  const handleDragCancel = () => {
    setDraggingTabId(null);
    clearDetachDragSession();
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
            title: t('query.new'),
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
            title: t('query.new'),
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

  const tabIds = useMemo(() => dockedTabs.map((tab) => tab.id), [dockedTabs]);
  const hasDoubleLineTabLabel = useMemo(() => (
    dockedTabs.some((tab) => {
      const connection = connections.find((conn) => conn.id === tab.connectionId);
      const displayModel = buildTabDisplayModel(tab, connection, appearance.tabDisplay, t);
      return displayModel.layout === 'double' && Boolean(displayModel.secondaryText);
    })
  ), [appearance.tabDisplay, connections, dockedTabs]);

  const renderTabBar: TabsProps['renderTabBar'] = (tabBarProps, DefaultTabBar) => (
    <DefaultTabBar {...tabBarProps}>
      {(node) => <DraggableTabNode key={node.key} node={node} />}
    </DefaultTabBar>
  );

  const items = useMemo(() => dockedTabs.map((tab, index) => {
    const connection = connections.find((conn) => conn.id === tab.connectionId);
    const displayModel = buildTabDisplayModel(tab, connection, appearance.tabDisplay, t);
    const displayTitle = displayModel.fullTitle;
    const hostSummary = resolveConnectionHostSummary(connection?.config);
    const tabIsActive = tab.id === dockedActiveTabId;

    const menuItems: MenuProps['items'] = [
      {
        key: 'tab-display-settings',
        icon: <SettingOutlined />,
        label: t('tab_manager.menu.tab_display_settings'),
        onClick: openTabDisplaySettings,
      },
      {
        key: 'open-in-window',
        label: t('tab_manager.menu.open_in_window'),
        onClick: () => detachWorkbenchTab(tab.id),
      },
      { type: 'divider' },
      {
        key: 'close-other',
        label: t('tab_manager.menu.close_other'),
        disabled: tabs.length <= 1,
        onClick: () => closeTabsWithSQLFilePrompt(getCloseOtherTabIds(tabs, tab.id), () => closeOtherTabs(tab.id)),
      },
      {
        key: 'close-left',
        label: t('tab_manager.menu.close_left'),
        disabled: index === 0,
        onClick: () => closeTabsWithSQLFilePrompt(getCloseTabsToLeftIds(dockedTabs, tab.id), () => closeTabsToLeft(tab.id)),
      },
      {
        key: 'close-right',
        label: t('tab_manager.menu.close_right'),
        disabled: index === dockedTabs.length - 1,
        onClick: () => closeTabsWithSQLFilePrompt(getCloseTabsToRightIds(dockedTabs, tab.id), () => closeTabsToRight(tab.id)),
      },
      { type: 'divider' },
      {
        key: 'close-all',
        label: t('tab_manager.menu.close_all'),
        disabled: tabs.length === 0,
        onClick: () => closeTabsWithSQLFilePrompt(tabs.map((item) => item.id), () => closeAllTabs()),
      },
    ];
    
    return {
      label: (
        <SortableTabLabel
          tab={tab}
          displayModel={displayModel}
          displayTitle={displayTitle}
          menuItems={menuItems}
          connectionLabel={connection?.name}
          hostSummary={hostSummary}
          isV2Ui={isV2Ui}
          onClose={() => closeTabsWithSQLFilePrompt([tab.id], () => closeTab(tab.id))}
        />
      ),
      key: tab.id,
      closable: !isV2Ui,
      children: <WorkbenchTabContent tab={tab} isActive={tabIsActive} />,
    };
  }), [dockedTabs, dockedActiveTabId, tabs, connections, appearance.tabDisplay, closeOtherTabs, closeTabsToLeft, closeTabsToRight, closeAllTabs, closeTab, closeTabsWithSQLFilePrompt, detachWorkbenchTab, isV2Ui, languagePreference]);

  const handleOpenConnectionModal = () => {
    const target = document.querySelector<HTMLButtonElement>('[data-gonavi-create-connection-action="true"]');
    target?.click();
  };

  const handleOpenAI = () => {
    setAIPanelVisible(true);
  };

  const EmptyWorkbench = (
    <div className="gn-v2-empty-workbench">
      <section className="gn-v2-empty-hero" aria-label={t('tab_manager.empty.aria.start_workbench')}>
        <div className="gn-v2-empty-eyebrow">
          <span>{t('tab_manager.empty.eyebrow.workbench')}</span>
          <span>{t('tab_manager.empty.eyebrow.connections', { count: connections.length })}</span>
        </div>
        <h1>{t('tab_manager.empty.hero.title')}</h1>
        <p>{t('tab_manager.empty.hero.description')}</p>
        <div className="gn-v2-empty-actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenConnectionModal}>
            {t('connection.new')}
          </Button>
          <Button icon={<ConsoleSqlOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('gonavi:create-query-tab'))}>
            {t('query.new')}
          </Button>
          <Button icon={<RobotOutlined />} onClick={handleOpenAI}>
            {t('tab_manager.empty.action.open_ai')}
          </Button>
        </div>
      </section>
      <section className="gn-v2-empty-panel" aria-label={t('tab_manager.empty.quick.aria')}>
        <div className="gn-v2-panel-heading">
          <span>{t('tab_manager.empty.quick.heading')}</span>
          <AppstoreOutlined />
        </div>
        <button type="button" onClick={handleOpenConnectionModal}>
          <DatabaseOutlined />
          <span>
            <strong>{t('tab_manager.empty.quick.configure_source.title')}</strong>
            <small>{t('tab_manager.empty.quick.configure_source.description')}</small>
          </span>
        </button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('gonavi:create-query-tab'))}>
          <ConsoleSqlOutlined />
          <span>
            <strong>{t('tab_manager.empty.quick.sql_workspace.title')}</strong>
            <small>{t('tab_manager.empty.quick.sql_workspace.description')}</small>
          </span>
        </button>
        <button type="button" onClick={handleOpenAI}>
          <RobotOutlined />
          <span>
            <strong>{t('tab_manager.empty.quick.ai_assist.title')}</strong>
            <small>{t('tab_manager.empty.quick.ai_assist.description')}</small>
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
              --gn-v2-tab-hover-grid-columns: 56px minmax(0, 1fr);
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
              display: grid;
              grid-template-columns: var(--gn-v2-tab-hover-grid-columns);
              align-items: start;
              gap: 8px;
              min-width: 0;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-head > span {
              justify-self: start;
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
              overflow-wrap: anywhere;
              color: var(--gn-fg-1);
              font-size: var(--gn-font-size-sm, 12px);
              font-weight: 700;
              line-height: 18px;
              white-space: normal;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-rows {
              display: grid;
              gap: 5px;
            }
            body[data-ui-version='v2'] .gn-v2-tab-hover-row {
              display: grid;
              grid-template-columns: var(--gn-v2-tab-hover-grid-columns);
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
            html.gn-workbench-tab-detaching,
            html.gn-workbench-tab-detaching body,
            html.gn-workbench-tab-detaching * {
              user-select: none !important;
              -webkit-user-select: none !important;
            }
        `}</style>
        {isV2Ui && !hasTabs ? (
          EmptyWorkbench
        ) : !hasDockedTabs ? (
          // All tabs are floating: keep empty docked area; floating host still shows content.
          <div className="gn-detached-only-workbench" style={{ flex: 1, minHeight: 0 }} />
        ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <Tabs
                className={`main-tabs${isV2Ui ? ' gn-v2-main-tabs' : ''}${hasDoubleLineTabLabel ? ' gn-v2-main-tabs-double' : ''}`}
                type="editable-card"
                destroyOnHidden={false}
                onChange={(newActiveKey) => {
                  if (Date.now() < suppressClickUntilRef.current) return;
                  onChange(newActiveKey);
                }}
                activeKey={dockedActiveTabId || undefined}
                onEdit={onEdit}
                items={items}
                hideAdd
                renderTabBar={renderTabBar}
            />
          </SortableContext>
        </DndContext>
        )}
        <DetachDragPreview
          preview={detachDragPreview}
          darkMode={theme === 'dark'}
          readyHint={t('tab_manager.menu.open_in_window')}
        />
    </div>
  );
});

export default TabManager;
