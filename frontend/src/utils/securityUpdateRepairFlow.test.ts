import { describe, expect, it } from 'vitest';

import type { SavedConnection, SecurityUpdateIssue } from '../types';
import {
  resolveSecurityUpdateRepairEntry,
  shouldReopenSecurityUpdateDetails,
  shouldRetrySecurityUpdateAfterRepairSave,
} from './securityUpdateRepairFlow';

const createConnection = (id: string): SavedConnection => ({
  id,
  name: `连接-${id}`,
  config: {
    id,
    type: 'postgres',
    host: 'db.local',
    port: 5432,
    user: 'postgres',
  },
});

describe('securityUpdateRepairFlow', () => {
  it('opens the matching connection and preserves the return source for security update repairs', () => {
    const target = createConnection('conn-1');
    const issue: SecurityUpdateIssue = {
      id: 'issue-1',
      action: 'open_connection',
      refId: 'conn-1',
    };

    expect(resolveSecurityUpdateRepairEntry(issue, [target])).toEqual({
      type: 'connection',
      connection: target,
      repairSource: 'connection',
    });
  });

  it('returns a user-facing warning when the target connection no longer exists', () => {
    const issue: SecurityUpdateIssue = {
      id: 'issue-1',
      action: 'open_connection',
      refId: 'missing-conn',
    };

    expect(resolveSecurityUpdateRepairEntry(issue, [createConnection('conn-1')])).toEqual({
      type: 'warning',
      message: '未找到对应连接，请先重新检查最新状态',
    });
  });

  it('maps proxy, ai and retry actions to the expected repair entry', () => {
    expect(resolveSecurityUpdateRepairEntry({ id: 'proxy', action: 'open_proxy_settings' }, [])).toEqual({
      type: 'proxy',
      repairSource: 'proxy',
    });
    expect(resolveSecurityUpdateRepairEntry({ id: 'ai', action: 'open_ai_settings', refId: 'provider-1' }, [])).toEqual({
      type: 'ai',
      providerId: 'provider-1',
      repairSource: 'ai',
    });
    expect(resolveSecurityUpdateRepairEntry({ id: 'retry', action: 'retry_update' }, [])).toEqual({
      type: 'retry',
    });
  });

  it('reopens security update details after closing a repair entry opened from that page', () => {
    expect(shouldReopenSecurityUpdateDetails('connection')).toBe(true);
    expect(shouldReopenSecurityUpdateDetails('proxy')).toBe(true);
    expect(shouldReopenSecurityUpdateDetails('ai')).toBe(true);
    expect(shouldReopenSecurityUpdateDetails(null)).toBe(false);
  });

  it('retries the current round automatically after saving a connection from the repair flow', () => {
    expect(shouldRetrySecurityUpdateAfterRepairSave('connection')).toBe(true);
    expect(shouldRetrySecurityUpdateAfterRepairSave('proxy')).toBe(false);
    expect(shouldRetrySecurityUpdateAfterRepairSave('ai')).toBe(false);
    expect(shouldRetrySecurityUpdateAfterRepairSave(null)).toBe(false);
  });
});
