import type { Dispatch, DragEvent, Key, MutableRefObject, SetStateAction } from 'react';

import type { ConnectionTag } from '../../types';
import type { SidebarTableSortPreference, SidebarTreeOrders } from '../../utils/sidebarTreeOrder';
import {
  isConnectionTagDescendant,
  normalizeSidebarTreeRelativeDropPosition,
  resolveSidebarDropDomHit,
  resolveSidebarDropInsertBefore,
  resolveSidebarTreeDropPlacement,
  type SidebarTreeDropPlacement,
  type SidebarTreeNode,
} from '../sidebarV2Utils';
import * as sidebarTreeDrag from './sidebarTreeDragSort';

export type SidebarTreeDropPreview = {
  nodeKey: string;
  placement: SidebarTreeDropPlacement;
};

type DropPreviewController = {
  update: (nextPreview: SidebarTreeDropPreview | null) => void;
  clearTimer: () => void;
};

const SIDEBAR_GROUP_HOVER_EXPAND_DELAY_MS = 500;

export const createSidebarTreeDropPreviewController = (options: {
  previewRef: MutableRefObject<SidebarTreeDropPreview | null>;
  timerRef: MutableRefObject<number | null>;
  expandedKeysRef: MutableRefObject<Key[]>;
  setPreview: (preview: SidebarTreeDropPreview | null) => void;
  setExpandedKeys: Dispatch<SetStateAction<Key[]>>;
  setAutoExpandParent: (value: boolean) => void;
}): DropPreviewController => {
  const clearTimer = () => {
    if (options.timerRef.current === null) return;
    window.clearTimeout(options.timerRef.current);
    options.timerRef.current = null;
  };
  return {
    clearTimer,
    update: (nextPreview) => {
      const previousPreview = options.previewRef.current;
      if (
        previousPreview?.nodeKey === nextPreview?.nodeKey
        && previousPreview?.placement === nextPreview?.placement
      ) {
        return;
      }
      clearTimer();
      options.previewRef.current = nextPreview;
      options.setPreview(nextPreview);
      if (!nextPreview || nextPreview.placement !== 'inside') return;
      if (options.expandedKeysRef.current.some((key) => String(key) === nextPreview.nodeKey)) return;
      options.timerRef.current = window.setTimeout(() => {
        options.timerRef.current = null;
        const activePreview = options.previewRef.current;
        if (
          !activePreview
          || activePreview.nodeKey !== nextPreview.nodeKey
          || activePreview.placement !== 'inside'
        ) {
          return;
        }
        options.setExpandedKeys((previous) => previous.some((key) => String(key) === nextPreview.nodeKey)
          ? previous
          : [...previous, nextPreview.nodeKey]);
        options.setAutoExpandParent(false);
      }, SIDEBAR_GROUP_HOVER_EXPAND_DELAY_MS);
    },
  };
};

export const applySidebarHostTreeDrop = (options: {
  treeData: SidebarTreeNode[];
  dragNode: SidebarTreeNode;
  dropNode: SidebarTreeNode;
  placement: SidebarTreeDropPlacement;
  connectionTags: ConnectionTag[];
  moveConnectionTag: (
    tagId: string,
    targetParentTagId: string | null,
    targetToken?: string | null,
    insertBefore?: boolean,
  ) => void;
  moveConnectionToTag: (
    connectionId: string,
    targetTagId: string | null,
    targetToken?: string | null,
    insertBefore?: boolean,
  ) => void;
}): boolean => {
  if (
    options.placement !== 'inside'
    && sidebarTreeDrag.isSidebarTreeGapNoOp(
      options.treeData,
      options.dragNode,
      options.dropNode,
      options.placement,
    )
  ) return false;
  const move = sidebarTreeDrag.resolveSidebarHostTreeMove(options);
  if (!move) return false;
  if (move.type === 'tag') {
    options.moveConnectionTag(move.id, move.targetParentTagId, move.targetToken, move.insertBefore);
  } else {
    options.moveConnectionToTag(move.id, move.targetParentTagId, move.targetToken, move.insertBefore);
  }
  return true;
};

export const allowSidebarTreeDrop = (options: {
  treeData: SidebarTreeNode[];
  connectionTags: ConnectionTag[];
  dragNode?: SidebarTreeNode;
  dropNode?: SidebarTreeNode;
  dropPosition?: number;
}): boolean => {
  const { treeData, connectionTags, dragNode, dropNode } = options;
  if (!dragNode || !dropNode) return false;
  if (sidebarTreeDrag.isSidebarTreeOrderNode(dragNode) || sidebarTreeDrag.isSidebarTreeOrderNode(dropNode)) {
    return sidebarTreeDrag.canDropSidebarTreeOrderNode(
      treeData,
      dragNode,
      dropNode,
      Number(options.dropPosition),
    );
  }
  if (!sidebarTreeDrag.isSidebarHostTreeNode(dragNode) || !sidebarTreeDrag.isSidebarHostTreeNode(dropNode)) {
    return false;
  }
  const dropPlacement = Number(options.dropPosition) < 0
    ? 'before'
    : Number(options.dropPosition) > 0
      ? 'after'
      : 'inside';
  if (
    dropPlacement !== 'inside'
    && sidebarTreeDrag.isSidebarTreeGapNoOp(treeData, dragNode, dropNode, dropPlacement)
  ) return false;
  const droppingIntoTag = dropNode.type === 'tag' && Number(options.dropPosition) === 0;
  if (dropNode.type === 'connection' && Number(options.dropPosition) === 0) return false;
  if (dragNode.type !== 'tag') return String(dragNode.key) !== String(dropNode.key);
  const dragTagId = String(dragNode?.dataRef?.id || '').trim();
  const targetParentTagId = droppingIntoTag
    ? String(dropNode?.dataRef?.id || '').trim() || null
    : sidebarTreeDrag.getSidebarTreeNodeParentTagId(dropNode, connectionTags);
  return !!dragTagId && !isConnectionTagDescendant(dragTagId, targetParentTagId, connectionTags);
};

const findSidebarTreeNode = (
  nodes: SidebarTreeNode[],
  targetKey: string,
): SidebarTreeNode | null => {
  for (const node of nodes) {
    if (String(node.key) === targetKey) return node;
    if (node.children?.length) {
      const match = findSidebarTreeNode(node.children, targetKey);
      if (match) return match;
    }
  }
  return null;
};

const resolveDropNode = (
  infoNode: (SidebarTreeNode & { pos?: unknown }) | undefined,
  domDropHit: ReturnType<typeof resolveSidebarDropDomHit>,
  treeData: SidebarTreeNode[],
): SidebarTreeNode | undefined => {
  if (!domDropHit || domDropHit.key === String(infoNode?.key || '')) return infoNode;
  return findSidebarTreeNode(treeData, domDropHit.key) || infoNode;
};

export const resolveSidebarTreeAntDrop = (info: {
  dropPosition?: number;
  dropToGap?: boolean;
  event?: { clientY?: number };
  node?: SidebarTreeNode & { pos?: unknown };
  dragNode?: SidebarTreeNode;
}, treeData: SidebarTreeNode[]): {
  dragNode: SidebarTreeNode;
  dropNode: SidebarTreeNode;
  placement: SidebarTreeDropPlacement;
} | null => {
  const dropPosition = normalizeSidebarTreeRelativeDropPosition(
    Number(info.dropPosition || 0),
    info?.node?.pos,
  );
  const domDropHit = resolveSidebarDropDomHit(info?.event);
  const dragNode = info.dragNode;
  const dropNode = resolveDropNode(info.node, domDropHit, treeData);
  if (!dragNode || !dropNode) return null;
  const metrics = domDropHit?.metrics ? {
    clientY: info?.event?.clientY,
    top: domDropHit.metrics.top,
    height: domDropHit.metrics.height,
  } : null;
  return {
    dragNode,
    dropNode,
    placement: resolveSidebarTreeDropPlacement({
      dragNodeType: dragNode.type,
      dropNodeType: dropNode.type,
      relativeDropPosition: dropPosition,
      dropToGap: info?.dropToGap,
      fallbackInsertBefore: resolveSidebarDropInsertBefore(dropPosition, metrics),
      metrics,
    }),
  };
};

export const applyResolvedSidebarTreeDrop = (options: {
  treeData: SidebarTreeNode[];
  visibleTreeData: SidebarTreeNode[];
  dragNode: SidebarTreeNode;
  dropNode: SidebarTreeNode;
  placement: SidebarTreeDropPlacement;
  connectionTags: ConnectionTag[];
  treeOrders: SidebarTreeOrders;
  tableSortPreference: Record<string, SidebarTableSortPreference>;
  moveConnectionTag: (
    tagId: string,
    targetParentTagId: string | null,
    targetToken?: string | null,
    insertBefore?: boolean,
  ) => void;
  moveConnectionToTag: (
    connectionId: string,
    targetTagId: string | null,
    targetToken?: string | null,
    insertBefore?: boolean,
  ) => void;
  onTreeData: (treeData: SidebarTreeNode[]) => void;
  onTreeOrders: (parentKey: string, orderedKeys: string[], nextOrders: SidebarTreeOrders) => void;
  onTableSort: (
    connectionId: string,
    dbName: string,
    nextPreferences: Record<string, SidebarTableSortPreference>,
  ) => void;
}): boolean => {
  if (
    sidebarTreeDrag.isSidebarTreeOrderNode(options.dragNode)
    || sidebarTreeDrag.isSidebarTreeOrderNode(options.dropNode)
  ) {
    return sidebarTreeDrag.commitSidebarTreeOrderDrop({
      treeData: options.treeData,
      visibleTreeData: options.visibleTreeData,
      dragNode: options.dragNode,
      dropNode: options.dropNode,
      insertBefore: options.placement === 'before',
      treeOrders: options.treeOrders,
      tableSortPreference: options.tableSortPreference,
      callbacks: {
        onTreeData: options.onTreeData,
        onTreeOrders: options.onTreeOrders,
        onTableSort: options.onTableSort,
      },
    });
  }
  return applySidebarHostTreeDrop({
    treeData: options.visibleTreeData,
    dragNode: options.dragNode,
    dropNode: options.dropNode,
    placement: options.placement,
    connectionTags: options.connectionTags,
    moveConnectionTag: options.moveConnectionTag,
    moveConnectionToTag: options.moveConnectionToTag,
  });
};

export const buildSidebarTreeShellClassName = (
  dragNodeType: string | null,
  hasDropPreview: boolean,
): string => [
  'sidebar-tree-scroll-shell gn-v2-explorer-tree-shell',
  sidebarTreeDrag.isSidebarHostTreeNode({ type: dragNodeType } as SidebarTreeNode)
    ? 'is-host-tree-dragging' : '',
  sidebarTreeDrag.isSidebarTreeOrderNode({ type: dragNodeType } as SidebarTreeNode)
    ? 'is-object-tree-dragging' : '',
  hasDropPreview ? 'has-host-group-drop-preview' : '',
].filter(Boolean).join(' ');

export const resolveSidebarTreePointerDrop = (
  treeData: SidebarTreeNode[],
  dragNode: SidebarTreeNode | null | undefined,
  event: { clientX?: number; clientY?: number; target?: EventTarget | null },
  connectionTags: ConnectionTag[],
) => {
  const objectDrop = sidebarTreeDrag.resolveSidebarTreeOrderDropAtEvent(treeData, dragNode, event);
  if (objectDrop) return { kind: 'object' as const, ...objectDrop };
  const hostDrop = sidebarTreeDrag.resolveSidebarHostTreeDropAtEvent(treeData, dragNode, event);
  if (!hostDrop) return null;
  return sidebarTreeDrag.resolveSidebarHostTreeMove({ ...hostDrop, connectionTags })
    ? { kind: 'host' as const, ...hostDrop }
    : null;
};

type ApplyResolvedSidebarTreeDrop = Parameters<typeof applyResolvedSidebarTreeDrop>[0];

export type SidebarTreeDragSortSession = {
  treeDataRef: { current: SidebarTreeNode[] };
  visibleOrderTreeRef: { current: SidebarTreeNode[] };
  dragNodeRef: { current: SidebarTreeNode | null };
  dragPreviewElementRef: { current: HTMLElement | null };
  treeOrdersRef: { current: SidebarTreeOrders };
  tableSortPreferenceRef: { current: Record<string, SidebarTableSortPreference> };
  treeDragSelectSuppressUntilRef: { current: number };
  connectionTags: ConnectionTag[];
  dropPreview: { update: (preview: SidebarTreeDropPreview | null) => void };
  setDragNodeType: (type: string | null) => void;
  setIsTreeDragging: (dragging: boolean) => void;
  snapshotTreeSelectionBeforeDrag: () => void;
  restoreTreeSelectionAfterDrag: () => void;
  clearVisuals: () => void;
  moveConnectionTag: ApplyResolvedSidebarTreeDrop['moveConnectionTag'];
  moveConnectionToTag: ApplyResolvedSidebarTreeDrop['moveConnectionToTag'];
  onTreeData: ApplyResolvedSidebarTreeDrop['onTreeData'];
  onTreeOrders: ApplyResolvedSidebarTreeDrop['onTreeOrders'];
  onTableSort: ApplyResolvedSidebarTreeDrop['onTableSort'];
};

const commitFromSession = (session: SidebarTreeDragSortSession) => ({
  connectionTags: session.connectionTags,
  treeOrders: session.treeOrdersRef.current,
  tableSortPreference: session.tableSortPreferenceRef.current,
  moveConnectionTag: session.moveConnectionTag,
  moveConnectionToTag: session.moveConnectionToTag,
  onTreeData: session.onTreeData,
  onTreeOrders: session.onTreeOrders,
  onTableSort: session.onTableSort,
});

export const handleSidebarTreeDragOverCapture = (
  session: SidebarTreeDragSortSession,
  event: DragEvent<HTMLDivElement>,
) => {
  const resolvedDrop = resolveSidebarTreePointerDrop(
    session.visibleOrderTreeRef.current,
    session.dragNodeRef.current,
    event,
    session.connectionTags,
  );
  if (!resolvedDrop) {
    session.dropPreview.update(null);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  session.dropPreview.update({ nodeKey: resolvedDrop.hit.key, placement: resolvedDrop.placement });
};

export const handleSidebarTreeDropCapture = (
  session: SidebarTreeDragSortSession,
  event: DragEvent<HTMLDivElement>,
) => {
  const resolvedDrop = resolveSidebarTreePointerDrop(
    session.visibleOrderTreeRef.current,
    session.dragNodeRef.current,
    event,
    session.connectionTags,
  );
  if (!resolvedDrop) return;
  event.preventDefault();
  event.stopPropagation();
  if (resolvedDrop.kind === 'object') {
    applyResolvedSidebarTreeDrop({
      treeData: session.treeDataRef.current,
      visibleTreeData: session.visibleOrderTreeRef.current,
      dragNode: resolvedDrop.dragNode,
      dropNode: resolvedDrop.dropNode,
      placement: resolvedDrop.placement,
      ...commitFromSession(session),
    });
  } else {
    applySidebarHostTreeDrop({
      treeData: session.visibleOrderTreeRef.current,
      dragNode: resolvedDrop.dragNode,
      dropNode: resolvedDrop.dropNode,
      placement: resolvedDrop.placement,
      connectionTags: session.connectionTags,
      moveConnectionTag: session.moveConnectionTag,
      moveConnectionToTag: session.moveConnectionToTag,
    });
  }
  session.restoreTreeSelectionAfterDrag();
  session.clearVisuals();
};

export const handleSidebarTreeAntDrop = (
  session: SidebarTreeDragSortSession,
  info: Parameters<typeof resolveSidebarTreeAntDrop>[0],
) => {
  session.clearVisuals();
  const resolved = resolveSidebarTreeAntDrop(info, session.treeDataRef.current);
  if (!resolved) return;
  applyResolvedSidebarTreeDrop({
    treeData: session.treeDataRef.current,
    visibleTreeData: session.visibleOrderTreeRef.current,
    dragNode: resolved.dragNode,
    dropNode: resolved.dropNode,
    placement: resolved.placement,
    ...commitFromSession(session),
  });
};

export const handleSidebarTreeDragStart = (
  session: SidebarTreeDragSortSession,
  payload: {
    event: { dataTransfer?: DataTransfer | null; target?: EventTarget | null };
    node: SidebarTreeNode;
  },
) => {
  session.snapshotTreeSelectionBeforeDrag();
  session.treeDragSelectSuppressUntilRef.current = Date.now() + 600;
  session.dragNodeRef.current = payload.node;
  session.setDragNodeType(String(payload.node?.type || '') || null);
  session.dropPreview.update(null);
  session.dragPreviewElementRef.current?.remove();
  session.dragPreviewElementRef.current = sidebarTreeDrag.createSidebarTreeDragPreview(
    payload.event,
    payload.node,
  );
  sidebarTreeDrag.setSidebarTreeSqlDragData(payload.event, payload.node);
  session.setIsTreeDragging(true);
};
