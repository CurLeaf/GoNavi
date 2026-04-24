import { describe, expect, it } from 'vitest';

import {
  getStoredSecretPlaceholder,
  normalizeConnectionSecretErrorMessage,
  resolveConnectionTestFailureFeedback,
  summarizeConnectionTestFailureMessage,
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

  it('keeps saved-secret lookup errors inside the modal instead of raising a global toast', () => {
    expect(resolveConnectionTestFailureFeedback({
      kind: 'runtime',
      reason: 'saved connection not found: conn-1',
      fallback: '连接失败',
    })).toEqual({
      message: '测试失败: 未找到当前连接对应的已保存密文，请重新填写密码并保存后再试',
      shouldToast: false,
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

  it('uses only the first line for connection failure toast summaries', () => {
    expect(summarizeConnectionTestFailureMessage(`测试失败: 当前端口不是 JMX 远程管理端口\n建议：请改填 JMX 端口\n技术细节：raw error`)).toBe(
      '测试失败: 当前端口不是 JMX 远程管理端口',
    );
  });
});
