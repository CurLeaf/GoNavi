import { describe, expect, it } from 'vitest';

import {
  getStoredSecretPlaceholder,
  normalizeConnectionSecretErrorMessage,
  resolveConnectionTestFailureFeedback,
} from './connectionModalPresentation';

describe('connectionModalPresentation', () => {
  it('shows an explicit stored-secret placeholder instead of an empty-looking password field', () => {
    expect(getStoredSecretPlaceholder({
      hasStoredSecret: true,
      emptyPlaceholder: '密码',
      retainedLabel: '已保存密码',
    })).toBe('••••••（留空表示继续沿用已保存密码）');
  });

  it('keeps the original placeholder when no stored secret exists', () => {
    expect(getStoredSecretPlaceholder({
      hasStoredSecret: false,
      emptyPlaceholder: '密码',
      retainedLabel: '已保存密码',
    })).toBe('密码');
  });

  it('maps missing saved-connection errors to a secret-specific hint', () => {
    expect(normalizeConnectionSecretErrorMessage('saved connection not found: conn-1')).toBe(
      '未找到当前连接对应的已保存密文，请重新填写密码并保存后再试',
    );
  });

  it('preserves existing user-facing messages', () => {
    expect(normalizeConnectionSecretErrorMessage('连接测试超时')).toBe('连接测试超时');
  });

  it('shows a toast-worthy failure message for saved-secret lookup errors during connection tests', () => {
    expect(resolveConnectionTestFailureFeedback({
      kind: 'runtime',
      reason: 'saved connection not found: conn-1',
      fallback: '连接失败',
    })).toEqual({
      message: '测试失败: 未找到当前连接对应的已保存密文，请重新填写密码并保存后再试',
      shouldToast: true,
    });
  });

  it('keeps required-field validation failures inline without an extra toast', () => {
    expect(resolveConnectionTestFailureFeedback({
      kind: 'validation',
      reason: '',
      fallback: '连接失败',
    })).toEqual({
      message: '测试失败: 请先完善必填项后再测试连接',
      shouldToast: false,
    });
  });
});