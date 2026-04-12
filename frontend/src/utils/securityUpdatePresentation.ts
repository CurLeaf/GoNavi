import type {
  SecurityUpdateIssue,
  SecurityUpdateIssueAction,
  SecurityUpdateIssueSeverity,
  SecurityUpdateItemStatus,
  SecurityUpdateStatus,
} from '../types';

type SecurityUpdateTone = 'default' | 'warning' | 'processing' | 'success' | 'error';

type SecurityUpdateStatusMeta = {
  label: string;
  description: string;
  tone: SecurityUpdateTone;
};

type SecurityUpdateEntryVisibility = {
  showIntro: boolean;
  showBanner: boolean;
  showDetailEntry: boolean;
};

type SecurityUpdateIssueActionMeta = {
  label: string;
  emphasis: 'primary' | 'default';
};

type SecurityUpdateBadgeMeta = {
  label: string;
  color: SecurityUpdateTone;
};

const severityWeight: Record<SecurityUpdateIssueSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const actionMetaMap: Record<SecurityUpdateIssueAction, SecurityUpdateIssueActionMeta> = {
  open_connection: {
    label: '打开连接',
    emphasis: 'primary',
  },
  open_proxy_settings: {
    label: '代理设置',
    emphasis: 'primary',
  },
  open_ai_settings: {
    label: 'AI 设置',
    emphasis: 'primary',
  },
  retry_update: {
    label: '重新检查',
    emphasis: 'primary',
  },
  view_details: {
    label: '查看详情',
    emphasis: 'default',
  },
};

const itemStatusMetaMap: Record<SecurityUpdateItemStatus, SecurityUpdateBadgeMeta> = {
  pending: {
    label: '待更新',
    color: 'processing',
  },
  updated: {
    label: '已更新',
    color: 'success',
  },
  needs_attention: {
    label: '待处理',
    color: 'warning',
  },
  skipped: {
    label: '已跳过',
    color: 'default',
  },
  failed: {
    label: '失败',
    color: 'error',
  },
};

const issueSeverityMetaMap: Record<SecurityUpdateIssueSeverity, SecurityUpdateBadgeMeta> = {
  high: {
    label: '高风险',
    color: 'error',
  },
  medium: {
    label: '中风险',
    color: 'warning',
  },
  low: {
    label: '低风险',
    color: 'default',
  },
};

export function sortSecurityUpdateIssues(issues: SecurityUpdateIssue[]): SecurityUpdateIssue[] {
  return [...issues].sort((left, right) => {
    const leftWeight = severityWeight[left.severity ?? 'low'];
    const rightWeight = severityWeight[right.severity ?? 'low'];
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }
    return left.id.localeCompare(right.id);
  });
}

export function getSecurityUpdateStatusMeta(status: SecurityUpdateStatus): SecurityUpdateStatusMeta {
  switch (status.overallStatus) {
    case 'pending':
      return {
        label: '待更新',
        description: '检测到可进行的安全更新，你可以现在开始或稍后继续。',
        tone: 'warning',
      };
    case 'postponed':
      return {
        label: '待更新',
        description: '本次安全更新已延后，当前可用配置会继续保留。',
        tone: 'warning',
      };
    case 'in_progress':
      return {
        label: '更新中',
        description: '正在检查并更新已保存配置的安全存储。',
        tone: 'processing',
      };
    case 'needs_attention':
      return {
        label: '待处理',
        description: '更新尚未完成，有少量配置需要你处理。',
        tone: 'warning',
      };
    case 'completed':
      return {
        label: '已完成',
        description: '已保存配置已完成安全更新。',
        tone: 'success',
      };
    case 'rolled_back':
      return {
        label: '已回退',
        description: '本次更新未完成，系统已保留当前可用配置。',
        tone: 'error',
      };
    case 'not_detected':
    default:
      return {
        label: '未检测到',
        description: '当前没有需要处理的安全更新。',
        tone: 'default',
      };
  }
}

export function resolveSecurityUpdateEntryVisibility(status: SecurityUpdateStatus): SecurityUpdateEntryVisibility {
  switch (status.overallStatus) {
    case 'pending':
      return {
        showIntro: true,
        showBanner: false,
        showDetailEntry: true,
      };
    case 'postponed':
    case 'needs_attention':
    case 'rolled_back':
      return {
        showIntro: false,
        showBanner: true,
        showDetailEntry: true,
      };
    case 'completed':
    case 'in_progress':
      return {
        showIntro: false,
        showBanner: false,
        showDetailEntry: true,
      };
    case 'not_detected':
    default:
      return {
        showIntro: false,
        showBanner: false,
        showDetailEntry: false,
      };
  }
}

export function getSecurityUpdateIssueActionMeta(issue: Partial<SecurityUpdateIssue>): SecurityUpdateIssueActionMeta {
  return actionMetaMap[issue.action ?? 'view_details'] ?? actionMetaMap.view_details;
}

export function getSecurityUpdateItemStatusMeta(status?: SecurityUpdateItemStatus): SecurityUpdateBadgeMeta {
  return itemStatusMetaMap[status ?? 'pending'] ?? itemStatusMetaMap.pending;
}

export function getSecurityUpdateIssueSeverityMeta(severity?: SecurityUpdateIssueSeverity): SecurityUpdateBadgeMeta {
  return issueSeverityMetaMap[severity ?? 'low'] ?? issueSeverityMetaMap.low;
}

export type {
  SecurityUpdateBadgeMeta,
  SecurityUpdateEntryVisibility,
  SecurityUpdateIssueActionMeta,
  SecurityUpdateStatusMeta,
  SecurityUpdateTone,
};
