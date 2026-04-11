import { describe, expect, it } from 'vitest';

import {
  detectConnectionImportKind,
  isConnectionPackageExportCanceled,
  resolveConnectionPackageExportResult,
  normalizeConnectionPackagePassword,
} from './connectionExport';

describe('connectionExport', () => {
  it('detects encrypted packages by gonavi envelope kind', () => {
    expect(detectConnectionImportKind(JSON.stringify({
      schemaVersion: 1,
      kind: 'gonavi_connection_package',
      cipher: 'AES-256-GCM',
      kdf: {
        name: 'Argon2id',
        memoryKiB: 65536,
        timeCost: 3,
        parallelism: 4,
        salt: 'c2FsdA==',
      },
      nonce: 'bm9uY2Utbm9uY2U=',
      payload: 'encrypted-data',
    }))).toBe('encrypted-package');
  });

  it('detects legacy imports from historical json arrays', () => {
    expect(detectConnectionImportKind(JSON.stringify([
      {
        id: 'conn-1',
        name: 'Primary',
        config: {
          type: 'postgres',
        },
      },
    ]))).toBe('legacy-json');
  });

  it('returns invalid for malformed or unsupported content', () => {
    expect(detectConnectionImportKind('{not-json}')).toBe('invalid');
    expect(detectConnectionImportKind(JSON.stringify({
      kind: 'gonavi_connection_package',
      payload: 'encrypted-data',
    }))).toBe('invalid');
    expect(detectConnectionImportKind(JSON.stringify([
      {
        foo: 'bar',
      },
    ]))).toBe('invalid');
    expect(detectConnectionImportKind(JSON.stringify({
      kind: 'other_package',
      payload: 'encrypted-data',
    }))).toBe('invalid');
    expect(detectConnectionImportKind('null')).toBe('invalid');
  });

  it('trims package passwords before use', () => {
    expect(normalizeConnectionPackagePassword('  secret-pass  ')).toBe('secret-pass');
    expect(normalizeConnectionPackagePassword('\n\t  \t')).toBe('');
  });

  it('treats export cancel as a non-error backend result', () => {
    expect(isConnectionPackageExportCanceled({ success: false, message: '已取消' })).toBe(true);
    expect(isConnectionPackageExportCanceled({ success: false, message: '导出失败' })).toBe(false);
    expect(isConnectionPackageExportCanceled({ success: true, message: '已取消' })).toBe(false);
    expect(isConnectionPackageExportCanceled(undefined)).toBe(false);
  });

  it('maps export results to dialog state transitions', () => {
    const staleDialog = {
      open: true,
      mode: 'export' as const,
      password: '  secret-pass  ',
      error: '上一次失败',
      confirmLoading: false,
    };

    const canceledResult = resolveConnectionPackageExportResult(staleDialog, { success: false, message: '已取消' });
    expect(canceledResult.kind).toBe('canceled');
    if (canceledResult.kind === 'canceled') {
      expect(typeof canceledResult.nextDialog).toBe('function');
      expect((canceledResult.nextDialog as (current: typeof staleDialog) => typeof staleDialog)({
        open: false,
        mode: 'export',
        password: 'secret-pass',
        error: '更新后的错误',
        confirmLoading: true,
      })).toEqual({
        open: false,
        mode: 'export',
        password: 'secret-pass',
        error: '',
        confirmLoading: false,
      });
    }

    expect(resolveConnectionPackageExportResult(staleDialog, { success: true, message: '导出完成' })).toEqual({
      kind: 'succeeded',
    });

    expect(resolveConnectionPackageExportResult(staleDialog, { success: false, message: '磁盘已满' })).toEqual({
      kind: 'failed',
      error: '磁盘已满',
    });

    expect(resolveConnectionPackageExportResult(staleDialog, undefined)).toEqual({
      kind: 'failed',
      error: '导出失败',
    });
  });
});
