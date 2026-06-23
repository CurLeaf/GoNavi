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

type SecurityUpdateTranslator = (key: string) => string;

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

const localize = (t: SecurityUpdateTranslator | undefined, key: string): string => (
  t ? t(key) : key
);

const actionMetaMap: Record<SecurityUpdateIssueAction, SecurityUpdateIssueActionMeta> = {
  open_connection: {
    label: 'security_update.action.open_connection',
    emphasis: 'primary',
  },
  open_proxy_settings: {
    label: 'security_update.action.open_proxy_settings',
    emphasis: 'primary',
  },
  open_ai_settings: {
    label: 'security_update.action.open_ai_settings',
    emphasis: 'primary',
  },
  retry_update: {
    label: 'security_update.action.retry_update',
    emphasis: 'primary',
  },
  view_details: {
    label: 'security_update.action.view_details',
    emphasis: 'default',
  },
};

const itemStatusMetaMap: Record<SecurityUpdateItemStatus, SecurityUpdateBadgeMeta> = {
  pending: {
    label: 'security_update.item_status.pending',
    color: 'processing',
  },
  updated: {
    label: 'security_update.item_status.updated',
    color: 'success',
  },
  needs_attention: {
    label: 'security_update.item_status.needs_attention',
    color: 'warning',
  },
  skipped: {
    label: 'security_update.item_status.skipped',
    color: 'default',
  },
  failed: {
    label: 'security_update.item_status.failed',
    color: 'error',
  },
};

const issueSeverityMetaMap: Record<SecurityUpdateIssueSeverity, SecurityUpdateBadgeMeta> = {
  high: {
    label: 'security_update.severity.high',
    color: 'error',
  },
  medium: {
    label: 'security_update.severity.medium',
    color: 'warning',
  },
  low: {
    label: 'security_update.severity.low',
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

export function getSecurityUpdateStatusMeta(
  status: SecurityUpdateStatus,
  t?: SecurityUpdateTranslator,
): SecurityUpdateStatusMeta {
  switch (status.overallStatus) {
    case 'pending':
      return {
        label: localize(t, 'security_update.status.pending.label'),
        description: localize(t, 'security_update.status.pending.description'),
        tone: 'warning',
      };
    case 'postponed':
      return {
        label: localize(t, 'security_update.status.postponed.label'),
        description: localize(t, 'security_update.status.postponed.description'),
        tone: 'warning',
      };
    case 'in_progress':
      return {
        label: localize(t, 'security_update.status.in_progress.label'),
        description: localize(t, 'security_update.status.in_progress.description'),
        tone: 'processing',
      };
    case 'needs_attention':
      return {
        label: localize(t, 'security_update.status.needs_attention.label'),
        description: localize(t, 'security_update.status.needs_attention.description'),
        tone: 'warning',
      };
    case 'completed':
      return {
        label: localize(t, 'security_update.status.completed.label'),
        description: localize(t, 'security_update.status.completed.description'),
        tone: 'success',
      };
    case 'rolled_back':
      return {
        label: localize(t, 'security_update.status.rolled_back.label'),
        description: localize(t, 'security_update.status.rolled_back.description'),
        tone: 'error',
      };
    case 'not_detected':
    default:
      return {
        label: localize(t, 'security_update.status.not_detected.label'),
        description: localize(t, 'security_update.status.not_detected.description'),
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

export function getSecurityUpdateIssueActionMeta(
  issue: Partial<SecurityUpdateIssue>,
  t?: SecurityUpdateTranslator,
): SecurityUpdateIssueActionMeta {
  const resolvedAction = issue.action && actionMetaMap[issue.action] ? issue.action : 'view_details';
  const meta = actionMetaMap[resolvedAction];
  const key = `security_update.action.${resolvedAction}`;
  return {
    ...meta,
    label: localize(t, key),
  };
}

export function getSecurityUpdateItemStatusMeta(
  status?: SecurityUpdateItemStatus,
  t?: SecurityUpdateTranslator,
): SecurityUpdateBadgeMeta {
  const resolvedStatus = status ?? 'pending';
  const meta = itemStatusMetaMap[resolvedStatus] ?? itemStatusMetaMap.pending;
  return {
    ...meta,
    label: localize(t, `security_update.item_status.${resolvedStatus}`),
  };
}

export function getSecurityUpdateIssueSeverityMeta(
  severity?: SecurityUpdateIssueSeverity,
  t?: SecurityUpdateTranslator,
): SecurityUpdateBadgeMeta {
  const resolvedSeverity = severity ?? 'low';
  const meta = issueSeverityMetaMap[resolvedSeverity] ?? issueSeverityMetaMap.low;
  return {
    ...meta,
    label: localize(t, `security_update.severity.${resolvedSeverity}`),
  };
}

export type {
  SecurityUpdateBadgeMeta,
  SecurityUpdateEntryVisibility,
  SecurityUpdateIssueActionMeta,
  SecurityUpdateStatusMeta,
  SecurityUpdateTranslator,
  SecurityUpdateTone,
};
