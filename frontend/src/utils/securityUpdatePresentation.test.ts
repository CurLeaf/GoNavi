import { describe, expect, it } from 'vitest';

import type { SecurityUpdateIssue, SecurityUpdateStatus } from '../types';
import {
  getSecurityUpdateIssueSeverityMeta,
  getSecurityUpdateItemStatusMeta,
  getSecurityUpdateIssueActionMeta,
  getSecurityUpdateStatusMeta,
  resolveSecurityUpdateEntryVisibility,
  sortSecurityUpdateIssues,
} from './securityUpdatePresentation';

const createStatus = (overallStatus: SecurityUpdateStatus['overallStatus']): SecurityUpdateStatus => ({
  overallStatus,
  summary: {
    total: 0,
    updated: 0,
    pending: 0,
    skipped: 0,
    failed: 0,
  },
  issues: [],
});

describe('securityUpdatePresentation', () => {
  it('sorts issues by severity from high to low', () => {
    const issues: SecurityUpdateIssue[] = [
      { id: 'medium-1', severity: 'medium' },
      { id: 'low-1', severity: 'low' },
      { id: 'high-1', severity: 'high' },
      { id: 'medium-2', severity: 'medium' },
    ];

    expect(sortSecurityUpdateIssues(issues).map((issue) => issue.id)).toEqual([
      'high-1',
      'medium-1',
      'medium-2',
      'low-1',
    ]);
  });

  it('maps needs_attention, rolled_back and completed to stable display labels', () => {
    expect(getSecurityUpdateStatusMeta(createStatus('needs_attention')).label).toBe('待处理');
    expect(getSecurityUpdateStatusMeta(createStatus('rolled_back')).label).toBe('已回退');
    expect(getSecurityUpdateStatusMeta(createStatus('completed')).label).toBe('已完成');
  });

  it('resolves intro, banner and detail entry visibility for key overall states', () => {
    expect(resolveSecurityUpdateEntryVisibility(createStatus('pending'))).toEqual({
      showIntro: true,
      showBanner: false,
      showDetailEntry: true,
    });

    expect(resolveSecurityUpdateEntryVisibility(createStatus('postponed'))).toEqual({
      showIntro: false,
      showBanner: true,
      showDetailEntry: true,
    });

    expect(resolveSecurityUpdateEntryVisibility(createStatus('rolled_back'))).toEqual({
      showIntro: false,
      showBanner: true,
      showDetailEntry: true,
    });
  });

  it('maps issue scope actions to existing repair entry labels', () => {
    expect(getSecurityUpdateIssueActionMeta({ id: 'conn', scope: 'connection', action: 'open_connection' }).label).toBe('打开连接');
    expect(getSecurityUpdateIssueActionMeta({ id: 'proxy', scope: 'global_proxy', action: 'open_proxy_settings' }).label).toBe('代理设置');
    expect(getSecurityUpdateIssueActionMeta({ id: 'ai', scope: 'ai_provider', action: 'open_ai_settings' }).label).toBe('AI 设置');
    expect(getSecurityUpdateIssueActionMeta({ id: 'system', scope: 'system', action: 'view_details' }).label).toBe('查看详情');
  });

  it('maps item status to explicit Chinese labels instead of reusing severity wording', () => {
    expect(getSecurityUpdateItemStatusMeta('needs_attention')).toEqual({
      label: '待处理',
      color: 'warning',
    });
    expect(getSecurityUpdateItemStatusMeta('updated')).toEqual({
      label: '已更新',
      color: 'success',
    });
  });

  it('maps issue severity to dedicated risk labels', () => {
    expect(getSecurityUpdateIssueSeverityMeta('medium')).toEqual({
      label: '中风险',
      color: 'warning',
    });
    expect(getSecurityUpdateIssueSeverityMeta('high')).toEqual({
      label: '高风险',
      color: 'error',
    });
  });
});
