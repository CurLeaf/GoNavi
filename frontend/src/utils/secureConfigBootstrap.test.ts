import { describe, expect, it, vi } from 'vitest';

import { LEGACY_PERSIST_KEY } from './legacyConnectionStorage';
import {
  bootstrapSecureConfig,
  finalizeSecurityUpdateStatus,
  mergeSecurityUpdateStatusWithLegacySource,
  startSecurityUpdateFromBootstrap,
} from './secureConfigBootstrap';
import { stripLegacyPersistedConnectionById } from './legacyConnectionStorage';

const legacyPayload = JSON.stringify({
  state: {
    connections: [
      {
        id: 'legacy-1',
        name: 'Legacy',
        config: {
          id: 'legacy-1',
          type: 'postgres',
          host: 'db.local',
          port: 5432,
          user: 'postgres',
          password: 'secret',
        },
      },
    ],
    globalProxy: {
      enabled: true,
      type: 'http',
      host: '127.0.0.1',
      port: 8080,
      user: 'ops',
      password: 'proxy-secret',
    },
  },
});

const createMemoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};

const createBaseArgs = (storage = createMemoryStorage()) => {
  const replaceConnections = vi.fn();
  const replaceGlobalProxy = vi.fn();

  storage.setItem(LEGACY_PERSIST_KEY, legacyPayload);

  return {
    storage,
    replaceConnections,
    replaceGlobalProxy,
  };
};

describe('secureConfigBootstrap', () => {
  it('builds legacy pending summary and issue list before the first round starts', async () => {
    const args = createBaseArgs();

    const result = await bootstrapSecureConfig({
      ...args,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'not_detected',
          summary: { total: 0, updated: 0, pending: 0, skipped: 0, failed: 0 },
          issues: [],
        }),
      },
    });

    expect(result.status.overallStatus).toBe('pending');
    expect(result.status.summary).toEqual({
      total: 2,
      updated: 0,
      pending: 2,
      skipped: 0,
      failed: 0,
    });
    expect(result.status.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'connection',
        refId: 'legacy-1',
        action: 'open_connection',
      }),
      expect.objectContaining({
        scope: 'global_proxy',
        action: 'open_proxy_settings',
      }),
    ]));
  });

  it('shows intro when legacy sensitive items exist and backend status is pending', async () => {
    const args = createBaseArgs();

    const result = await bootstrapSecureConfig({
      ...args,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'pending',
          summary: { total: 0, updated: 0, pending: 0, skipped: 0, failed: 0 },
          issues: [],
        }),
      },
    });

    expect(result.status.overallStatus).toBe('pending');
    expect(result.shouldShowIntro).toBe(true);
    expect(result.shouldShowBanner).toBe(false);
    expect(args.replaceConnections).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'legacy-1' })]),
    );
  });

  it('keeps banner flow without intro when backend status is postponed', async () => {
    const args = createBaseArgs();

    const result = await bootstrapSecureConfig({
      ...args,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'postponed',
          summary: { total: 0, updated: 0, pending: 0, skipped: 0, failed: 0 },
          issues: [],
        }),
      },
    });

    expect(result.shouldShowIntro).toBe(false);
    expect(result.shouldShowBanner).toBe(true);
  });

  it('keeps legacy pending summary and issues when a pre-start round is postponed', async () => {
    const args = createBaseArgs();

    const result = await bootstrapSecureConfig({
      ...args,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'postponed',
          summary: { total: 0, updated: 0, pending: 0, skipped: 0, failed: 0 },
          issues: [],
        }),
      },
    });

    expect(result.status.overallStatus).toBe('postponed');
    expect(result.status.summary.total).toBe(2);
    expect(result.status.summary.pending).toBe(2);
    expect(result.status.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'connection', refId: 'legacy-1' }),
      expect.objectContaining({ scope: 'global_proxy' }),
    ]));
  });

  it('merges backend pending issues with legacy source items before the first round starts', async () => {
    const args = createBaseArgs();

    const result = await bootstrapSecureConfig({
      ...args,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'pending',
          summary: { total: 1, updated: 0, pending: 1, skipped: 0, failed: 0 },
          issues: [
            {
              id: 'ai-provider-openai-main',
              scope: 'ai_provider',
              refId: 'openai-main',
              title: 'OpenAI',
              severity: 'medium',
              status: 'pending',
              reasonCode: 'secret_missing',
              action: 'open_ai_settings',
              message: 'AI 提供商配置仍需完成安全更新',
            },
          ],
        }),
      },
    });

    expect(result.status.overallStatus).toBe('pending');
    expect(result.status.summary).toEqual({
      total: 3,
      updated: 0,
      pending: 3,
      skipped: 0,
      failed: 0,
    });
    expect(result.status.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'ai_provider', refId: 'openai-main' }),
      expect.objectContaining({ scope: 'connection', refId: 'legacy-1' }),
      expect.objectContaining({ scope: 'global_proxy' }),
    ]));
  });

  it('keeps banner flow without intro when backend status is rolled_back', async () => {
    const args = createBaseArgs();

    const result = await bootstrapSecureConfig({
      ...args,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'rolled_back',
          summary: { total: 1, updated: 0, pending: 0, skipped: 0, failed: 1 },
          issues: [],
        }),
      },
    });

    expect(result.shouldShowIntro).toBe(false);
    expect(result.shouldShowBanner).toBe(true);
  });

  it('loads backend secure config directly when no legacy source exists', async () => {
    const storage = createMemoryStorage();
    const replaceConnections = vi.fn();
    const replaceGlobalProxy = vi.fn();

    const result = await bootstrapSecureConfig({
      storage,
      replaceConnections,
      replaceGlobalProxy,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'not_detected',
          summary: { total: 0, updated: 0, pending: 0, skipped: 0, failed: 0 },
          issues: [],
        }),
        GetSavedConnections: vi.fn().mockResolvedValue([
          {
            id: 'secure-1',
            name: 'Secure',
            config: {
              id: 'secure-1',
              type: 'postgres',
              host: 'db.local',
              port: 5432,
              user: 'postgres',
            },
          },
        ]),
      },
    });

    expect(result.status.overallStatus).toBe('not_detected');
    expect(replaceConnections).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'secure-1' })]),
    );
  });

  it('shows intro when backend status is pending even without legacy local source', async () => {
    const storage = createMemoryStorage();
    const replaceConnections = vi.fn();
    const replaceGlobalProxy = vi.fn();

    const result = await bootstrapSecureConfig({
      storage,
      replaceConnections,
      replaceGlobalProxy,
      backend: {
        GetSecurityUpdateStatus: vi.fn().mockResolvedValue({
          overallStatus: 'pending',
          summary: { total: 1, updated: 0, pending: 1, skipped: 0, failed: 0 },
          issues: [],
        }),
      },
    });

    expect(result.status.overallStatus).toBe('pending');
    expect(result.shouldShowIntro).toBe(true);
    expect(result.shouldShowBanner).toBe(false);
  });

  it('falls back to legacy visible config when StartSecurityUpdate throws', async () => {
    const args = createBaseArgs();

    const result = await startSecurityUpdateFromBootstrap({
      ...args,
      backend: {
        StartSecurityUpdate: vi.fn().mockRejectedValue(new Error('boom')),
      },
    });

    expect(result.status).toBeNull();
    expect(result.error?.message).toContain('boom');
    expect(args.replaceConnections).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'legacy-1' })]),
    );
    expect(args.storage.getItem(LEGACY_PERSIST_KEY)).toContain('"password":"secret"');
  });

  it('starts security update even when rawPayload is empty but backend supports AI-only update', async () => {
    const storage = createMemoryStorage();
    const replaceConnections = vi.fn();
    const replaceGlobalProxy = vi.fn();
    const StartSecurityUpdate = vi.fn().mockResolvedValue({
      overallStatus: 'completed',
      summary: { total: 1, updated: 1, pending: 0, skipped: 0, failed: 0 },
      issues: [],
    });

    const result = await startSecurityUpdateFromBootstrap({
      storage,
      replaceConnections,
      replaceGlobalProxy,
      backend: {
        StartSecurityUpdate,
      },
    });

    expect(result.error).toBeNull();
    expect(result.status?.overallStatus).toBe('completed');
    expect(StartSecurityUpdate).toHaveBeenCalledWith({
      sourceType: 'current_app_saved_config',
      rawPayload: '',
      options: {
        allowPartial: true,
        writeBackup: true,
      },
    });
  });

  it('keeps source-side secrets when update ends in needs_attention', async () => {
    const args = createBaseArgs();

    const result = await startSecurityUpdateFromBootstrap({
      ...args,
      backend: {
        StartSecurityUpdate: vi.fn().mockResolvedValue({
          overallStatus: 'needs_attention',
          summary: { total: 3, updated: 2, pending: 1, skipped: 0, failed: 0 },
          issues: [{ id: 'ai-1' }],
        }),
        GetSavedConnections: vi.fn().mockResolvedValue([]),
      },
    });

    expect(result.status?.overallStatus).toBe('needs_attention');
    expect(args.storage.getItem(LEGACY_PERSIST_KEY)).toContain('"password":"secret"');
  });

  it('cleans source-side secrets only after completed update and backend refresh', async () => {
    const args = createBaseArgs();

    const result = await startSecurityUpdateFromBootstrap({
      ...args,
      backend: {
        StartSecurityUpdate: vi.fn().mockResolvedValue({
          overallStatus: 'completed',
          summary: { total: 3, updated: 3, pending: 0, skipped: 0, failed: 0 },
          issues: [],
        }),
        GetSavedConnections: vi.fn().mockResolvedValue([
          {
            id: 'secure-1',
            name: 'Secure',
            config: {
              id: 'secure-1',
              type: 'postgres',
              host: 'db.local',
              port: 5432,
              user: 'postgres',
            },
            hasPrimaryPassword: true,
          },
        ]),
        GetGlobalProxyConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            enabled: true,
            type: 'http',
            host: '127.0.0.1',
            port: 8080,
            user: 'ops',
            hasPassword: true,
          },
        }),
      },
    });

    expect(result.status?.overallStatus).toBe('completed');
    expect(args.storage.getItem(LEGACY_PERSIST_KEY)).not.toContain('"password":"secret"');
    expect(args.replaceConnections).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'secure-1' })]),
    );
  });

  it('refreshes backend config and strips source-side secrets when a later round finishes as completed', async () => {
    const args = createBaseArgs();

    const status = await finalizeSecurityUpdateStatus({
      ...args,
      backend: {
        GetSavedConnections: vi.fn().mockResolvedValue([
          {
            id: 'secure-1',
            name: 'Secure',
            config: {
              id: 'secure-1',
              type: 'postgres',
              host: 'db.local',
              port: 5432,
              user: 'postgres',
            },
            hasPrimaryPassword: true,
          },
        ]),
        GetGlobalProxyConfig: vi.fn().mockResolvedValue({
          success: true,
          data: {
            enabled: true,
            type: 'http',
            host: '127.0.0.1',
            port: 8080,
            user: 'ops',
            hasPassword: true,
          },
        }),
      },
    }, {
      overallStatus: 'completed',
      summary: { total: 3, updated: 3, pending: 0, skipped: 0, failed: 0 },
      issues: [],
    });

    expect(status.overallStatus).toBe('completed');
    expect(args.storage.getItem(LEGACY_PERSIST_KEY)).not.toContain('"password":"secret"');
    expect(args.replaceConnections).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'secure-1' })]),
    );
  });

  it('reduces legacy pending issues after a single connection is repaired before the first round starts', () => {
    const nextPayload = stripLegacyPersistedConnectionById(legacyPayload, 'legacy-1');

    const status = mergeSecurityUpdateStatusWithLegacySource({
      overallStatus: 'not_detected',
      summary: { total: 0, updated: 0, pending: 0, skipped: 0, failed: 0 },
      issues: [],
    }, nextPayload);

    expect(status.overallStatus).toBe('pending');
    expect(status.summary).toEqual({
      total: 1,
      updated: 0,
      pending: 1,
      skipped: 0,
      failed: 0,
    });
    expect(status.issues).toEqual([
      expect.objectContaining({
        scope: 'global_proxy',
        action: 'open_proxy_settings',
      }),
    ]);
  });
});
