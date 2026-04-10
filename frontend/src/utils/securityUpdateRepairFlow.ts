import type { SavedConnection, SecurityUpdateIssue } from '../types';

export type SecurityUpdateRepairSource = 'connection' | 'proxy' | 'ai';

export type SecurityUpdateRepairEntry =
  | {
      type: 'connection';
      connection: SavedConnection;
      repairSource: 'connection';
    }
  | {
      type: 'proxy';
      repairSource: 'proxy';
    }
  | {
      type: 'ai';
      providerId?: string;
      repairSource: 'ai';
    }
  | {
      type: 'retry';
    }
  | {
      type: 'details';
    }
  | {
      type: 'warning';
      message: string;
    };

export const resolveSecurityUpdateRepairEntry = (
  issue: SecurityUpdateIssue,
  connections: SavedConnection[],
): SecurityUpdateRepairEntry => {
  if (issue.action === 'open_connection') {
    const target = connections.find((connection) => connection.id === issue.refId);
    if (!target) {
      return {
        type: 'warning',
        message: '未找到对应连接，请先重新检查最新状态',
      };
    }
    return {
      type: 'connection',
      connection: target,
      repairSource: 'connection',
    };
  }

  if (issue.action === 'open_proxy_settings') {
    return {
      type: 'proxy',
      repairSource: 'proxy',
    };
  }

  if (issue.action === 'open_ai_settings') {
    return {
      type: 'ai',
      providerId: issue.refId || undefined,
      repairSource: 'ai',
    };
  }

  if (issue.action === 'retry_update') {
    return {
      type: 'retry',
    };
  }

  return {
    type: 'details',
  };
};

export const shouldReopenSecurityUpdateDetails = (
  repairSource: SecurityUpdateRepairSource | null | undefined,
): boolean => repairSource === 'connection' || repairSource === 'proxy' || repairSource === 'ai';

export const shouldRetrySecurityUpdateAfterRepairSave = (
  repairSource: SecurityUpdateRepairSource | null | undefined,
): boolean => repairSource === 'connection';
