import { describe, expect, it } from 'vitest';

import { t as translate } from '../i18n';
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

const zh = (key: string) => translate(key, undefined, 'zh-CN');
const en = (key: string) => translate(key, undefined, 'en-US');

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
    expect(getSecurityUpdateStatusMeta(createStatus('needs_attention'), zh).label).toBe('待处理');
    expect(getSecurityUpdateStatusMeta(createStatus('rolled_back'), zh).label).toBe('已回退');
    expect(getSecurityUpdateStatusMeta(createStatus('completed'), zh).label).toBe('已完成');
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
    expect(getSecurityUpdateIssueActionMeta({ id: 'conn', scope: 'connection', action: 'open_connection' }, zh).label).toBe('打开连接');
    expect(getSecurityUpdateIssueActionMeta({ id: 'proxy', scope: 'global_proxy', action: 'open_proxy_settings' }, zh).label).toBe('代理设置');
    expect(getSecurityUpdateIssueActionMeta({ id: 'ai', scope: 'ai_provider', action: 'open_ai_settings' }, zh).label).toBe('AI 设置');
    expect(getSecurityUpdateIssueActionMeta({ id: 'system', scope: 'system', action: 'view_details' }, zh).label).toBe('查看详情');
  });

  it('maps item status to explicit Chinese labels instead of reusing severity wording', () => {
    expect(getSecurityUpdateItemStatusMeta('needs_attention', zh)).toEqual({
      label: '待处理',
      color: 'warning',
    });
    expect(getSecurityUpdateItemStatusMeta('updated', zh)).toEqual({
      label: '已更新',
      color: 'success',
    });
  });

  it('maps issue severity to dedicated risk labels', () => {
    expect(getSecurityUpdateIssueSeverityMeta('medium', zh)).toEqual({
      label: '中风险',
      color: 'warning',
    });
    expect(getSecurityUpdateIssueSeverityMeta('high', zh)).toEqual({
      label: '高风险',
      color: 'error',
    });
  });

  it('uses catalog labels and descriptions when a translator is provided', () => {
    expect(getSecurityUpdateStatusMeta(createStatus('postponed'), en)).toMatchObject({
      label: 'Pending',
      description: 'This security update has been postponed. The currently usable configuration is still kept.',
    });
    expect(getSecurityUpdateIssueActionMeta({ id: 'conn', action: 'open_connection' }, en).label).toBe('Open Connection');
    expect(getSecurityUpdateItemStatusMeta('needs_attention', en).label).toBe('Needs Attention');
    expect(getSecurityUpdateIssueSeverityMeta('high', en).label).toBe('High Risk');
  });
});
