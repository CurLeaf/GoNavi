import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, DragEvent, Key, MutableRefObject, SetStateAction } from 'react';

import { useStore } from '../../store';
import type { ConnectionTag } from '../../types';
import type { SidebarTreeNode } from '../sidebarV2Utils';
import * as sidebarTreeDrag from './sidebarTreeDragSort';
import {
  allowSidebarTreeDrop,
  buildSidebarTreeShellClassName,
  createSidebarTreeDropPreviewController,
  handleSidebarTreeAntDrop,
  handleSidebarTreeDragOverCapture,
  handleSidebarTreeDragStart,
  handleSidebarTreeDropCapture,
  type SidebarTreeDragSortSession,
  type SidebarTreeDropPreview,
} from './sidebarTreeDragSortHandlers';

type UseSidebarTreeDragSortOptions = {
  treeDataRef: MutableRefObject<SidebarTreeNode[]>;
  visibleOrderTreeRef: MutableRefObject<SidebarTreeNode[]>;
  connectionTags: ConnectionTag[];
  expandedKeysRef: MutableRefObject<Key[]>;
  setExpandedKeys: Dispatch<SetStateAction<Key[]>>;
  setAutoExpandParent: (value: boolean) => void;
  setTreeData: Dispatch<SetStateAction<SidebarTreeNode[]>>;
  snapshotTreeSelectionBeforeDrag: () => void;
  restoreTreeSelectionAfterDrag: () => void;
  treeDragSelectSuppressUntilRef: MutableRefObject<number>;
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
};

const bindSidebarTreeDragSortSession = (session: SidebarTreeDragSortSession) => ({
  handleDrop: (info: Parameters<typeof handleSidebarTreeAntDrop>[1]) => (
    handleSidebarTreeAntDrop(session, info)
  ),
  handleDragStart: (payload: Parameters<typeof handleSidebarTreeDragStart>[1]) => (
    handleSidebarTreeDragStart(session, payload)
  ),
  handleSidebarTreeDragOverCapture: (event: DragEvent<HTMLDivElement>) => (
    handleSidebarTreeDragOverCapture(session, event)
  ),
  handleSidebarTreeDropCapture: (event: DragEvent<HTMLDivElement>) => (
    handleSidebarTreeDropCapture(session, event)
  ),
  handleDragEnter: () => {
    session.treeDragSelectSuppressUntilRef.current = Date.now() + 600;
    session.setIsTreeDragging(true);
  },
  handleDragEnd: () => {
    session.restoreTreeSelectionAfterDrag();
    session.clearVisuals();
  },
});

export const useSidebarTreeDragSort = (options: UseSidebarTreeDragSortOptions) => {
  const sidebarTreeOrders = useStore((state) => state.sidebarTreeOrders);
  const updateSidebarTreeOrders = useStore((state) => state.updateSidebarTreeOrders);
  const tableSortPreference = useStore((state) => state.tableSortPreference);
  const setTableSortPreference = useStore((state) => state.setTableSortPreference);
  const [isTreeDragging, setIsTreeDragging] = useState(false);
  const [sidebarTreeDragNodeType, setSidebarTreeDragNodeType] = useState<string | null>(null);
  const [sidebarTreeDropPreview, setSidebarTreeDropPreview] = useState<SidebarTreeDropPreview | null>(null);
  const dragNodeRef = useRef<SidebarTreeNode | null>(null);
  const dropPreviewRef = useRef<SidebarTreeDropPreview | null>(null);
  const dragPreviewElementRef = useRef<HTMLElement | null>(null);
  const hoverExpandTimerRef = useRef<number | null>(null);
  const treeOrdersRef = useRef(sidebarTreeOrders);
  const tableSortPreferenceRef = useRef(tableSortPreference);
  treeOrdersRef.current = sidebarTreeOrders;
  tableSortPreferenceRef.current = tableSortPreference;

  const dropPreview = useMemo(() => createSidebarTreeDropPreviewController({
    previewRef: dropPreviewRef,
    timerRef: hoverExpandTimerRef,
    expandedKeysRef: options.expandedKeysRef,
    setPreview: setSidebarTreeDropPreview,
    setExpandedKeys: options.setExpandedKeys,
    setAutoExpandParent: options.setAutoExpandParent,
  }), [options.expandedKeysRef, options.setAutoExpandParent, options.setExpandedKeys]);

  const clearVisuals = useCallback(() => {
    dropPreview.clearTimer();
    dropPreviewRef.current = null;
    setSidebarTreeDropPreview(null);
    dragNodeRef.current = null;
    setSidebarTreeDragNodeType(null);
    dragPreviewElementRef.current?.remove();
    dragPreviewElementRef.current = null;
    setIsTreeDragging(false);
  }, [dropPreview]);

  useEffect(() => () => {
    dropPreview.clearTimer();
    dragPreviewElementRef.current?.remove();
  }, [dropPreview]);

  const session: SidebarTreeDragSortSession = {
    treeDataRef: options.treeDataRef,
    visibleOrderTreeRef: options.visibleOrderTreeRef,
    dragNodeRef,
    dragPreviewElementRef,
    treeOrdersRef,
    tableSortPreferenceRef,
    treeDragSelectSuppressUntilRef: options.treeDragSelectSuppressUntilRef,
    connectionTags: options.connectionTags,
    dropPreview,
    setDragNodeType: setSidebarTreeDragNodeType,
    setIsTreeDragging,
    snapshotTreeSelectionBeforeDrag: options.snapshotTreeSelectionBeforeDrag,
    restoreTreeSelectionAfterDrag: options.restoreTreeSelectionAfterDrag,
    clearVisuals,
    moveConnectionTag: options.moveConnectionTag,
    moveConnectionToTag: options.moveConnectionToTag,
    onTreeData: (next) => {
      options.treeDataRef.current = next;
      options.setTreeData(next);
    },
    onTreeOrders: (parentKey, orderedKeys, next) => {
      treeOrdersRef.current = next;
      updateSidebarTreeOrders({ [parentKey]: orderedKeys });
    },
    onTableSort: (connectionId, dbName, next) => {
      tableSortPreferenceRef.current = next;
      setTableSortPreference(connectionId, dbName, 'manual');
    },
  };

  return {
    isTreeDragging,
    sidebarTreeDragNodeRef: dragNodeRef,
    sidebarTreeDropPreview,
    sidebarTreeOrders,
    tableSortPreference,
    treeShellClassName: buildSidebarTreeShellClassName(
      sidebarTreeDragNodeType,
      Boolean(sidebarTreeDropPreview),
    ),
    allowSidebarTreeDrop: (
      args: { dragNode?: SidebarTreeNode; dropNode?: SidebarTreeNode; dropPosition?: number },
    ) => allowSidebarTreeDrop({
      treeData: options.visibleOrderTreeRef.current,
      connectionTags: options.connectionTags,
      ...args,
    }),
    ...bindSidebarTreeDragSortSession(session),
    markSidebarTreeMouseDownHandled: sidebarTreeDrag.markSidebarTreeMouseDownHandled,
    nodeDraggable: sidebarTreeDrag.isSidebarTreeNodeDraggable,
    clearDropPreview: () => dropPreview.update(null),
    applySidebarTreeOrders: sidebarTreeDrag.applySidebarTreeOrders,
    applySidebarTreeOrdersToNode: sidebarTreeDrag.applySidebarTreeOrdersToNode,
    isSidebarHostTreeNode: sidebarTreeDrag.isSidebarHostTreeNode,
  };
};
