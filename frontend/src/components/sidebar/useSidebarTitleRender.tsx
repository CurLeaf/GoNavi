import React, { useCallback } from 'react';

import type { SavedConnection } from '../../types';
import { t } from '../../i18n';
import JVMModeBadge from '../jvm/JVMModeBadge';
import type { SidebarConnectionState } from '../sidebarV2Utils';
import {
  shouldHideSchemaPrefix,
  splitQualifiedName,
} from './sidebarMetadataLoaders';
import {
  resolveSidebarQueriesFolderTitle,
  resolveV2ObjectGroupTitle,
} from './sidebarHelpers';
import { normalizeOracleObjectCompileStatus } from './oracleObjectCompilation';
import type { SidebarTreeConnectionStatus } from './SidebarTreeTitle';

type UseSidebarTitleRenderArgs = {
  connectionStates: Record<string, SidebarConnectionState>;
  renderV2TreeTitle: (node: any, hoverTitle: string, connectionStatus: SidebarTreeConnectionStatus) => React.ReactNode;
};

export const useSidebarTitleRender = ({
  connectionStates,
  renderV2TreeTitle,
}: UseSidebarTitleRenderArgs) => {
  return useCallback((node: any) => {
  let status: SidebarTreeConnectionStatus = 'default';
  if (node.type === 'connection' || node.type === 'database') {
    if (connectionStates[node.key] === 'loading') status = 'loading';
    else if (connectionStates[node.key] === 'success') status = 'success';
    else if (connectionStates[node.key] === 'error') status = 'error';
  }

  const displayTitle = resolveSidebarQueriesFolderTitle(node) ?? String(node.title ?? '');
  let hoverTitle = displayTitle;
  if (node.type === 'message-object' || node.type === 'table' || node.type === 'view' || node.type === 'materialized-view' || node.type === 'sequence' || node.type === 'package' || node.type === 'database-link' || node.type === 'db-event') {
    const rawTableName = String(
      node?.dataRef?.messageObjectName
      || node?.dataRef?.topicName
      || node?.dataRef?.queueName
      || node?.dataRef?.exchangeName
      || node?.dataRef?.tableName
      || node?.dataRef?.viewName
      || node?.dataRef?.sequenceName
      || node?.dataRef?.packageName
      || node?.dataRef?.databaseLinkName
      || node?.dataRef?.eventName
      || '',
    ).trim();
    const conn = node?.dataRef as SavedConnection | undefined;
    if (rawTableName && shouldHideSchemaPrefix(conn)) {
      if (splitQualifiedName(rawTableName).schemaName) {
        hoverTitle = rawTableName;
      }
    }
    const tableComment = node.type === 'table' ? String(node?.dataRef?.tableComment || '').trim() : '';
    if (tableComment) {
      hoverTitle = `${hoverTitle}\n${t('sidebar.v2_table_group_menu.table_comment_tooltip', { comment: tableComment })}`;
    }
  } else if (node.type === 'object-group') {
    const objectGroupTitle = resolveV2ObjectGroupTitle(node);
    if (objectGroupTitle) {
      hoverTitle = objectGroupTitle;
    }
  }
  const objectCompileStatus = (node.type === 'routine' || node.type === 'db-trigger')
    ? normalizeOracleObjectCompileStatus(node?.dataRef?.objectStatus)
    : '';
  const objectCompileStatusLabel = objectCompileStatus
    ? t(`sidebar.object_status.${objectCompileStatus.toLowerCase()}`)
    : '';
  if (objectCompileStatusLabel) {
    hoverTitle = `${hoverTitle}\n${t('sidebar.object_status.tooltip', { status: objectCompileStatusLabel })}`;
  }
  if (node.type === 'jvm-mode') {
    return (
      <span
        title={hoverTitle}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}
      >
        <JVMModeBadge
          mode={String(node?.dataRef?.providerMode || displayTitle)}
          label={displayTitle}
          reason={String(node?.dataRef?.reason || '').trim() || undefined}
        />
      </span>
    );
  }

  return renderV2TreeTitle(node, hoverTitle, status);
}, [
  connectionStates,
  renderV2TreeTitle,
]);
};
