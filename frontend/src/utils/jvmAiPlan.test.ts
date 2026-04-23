import { describe, expect, it } from 'vitest';

import { extractJVMChangePlan } from './jvmAiPlan';

describe('extractJVMChangePlan', () => {
  it('parses fenced json plan with namespace and key selector', () => {
    const message = [
      '建议先预览再执行：',
      '```json',
      '{"targetType":"cacheEntry","selector":{"namespace":"orders","key":"user:1"},"action":"updateValue","payload":{"format":"json","value":{"status":"ACTIVE"}},"reason":"修复缓存脏值"}',
      '```',
    ].join('\n');

    const plan = extractJVMChangePlan(message);
    expect(plan?.action).toBe('updateValue');
    expect(plan?.selector.namespace).toBe('orders');
    expect(plan?.selector.key).toBe('user:1');
  });

  it('parses fenced json plan with explicit resource path', () => {
    const message = [
      '```json',
      '{"targetType":"managedBean","selector":{"resourcePath":"/cache/orders/user:1"},"action":"clear","reason":"触发受控清理"}',
      '```',
    ].join('\n');

    const plan = extractJVMChangePlan(message);
    expect(plan?.targetType).toBe('managedBean');
    expect(plan?.selector.resourcePath).toBe('/cache/orders/user:1');
    expect(plan?.action).toBe('clear');
  });

  it('returns null for malformed plan', () => {
    expect(extractJVMChangePlan('```json\n{"action":1}\n```')).toBeNull();
  });

  it('returns null when selector is missing', () => {
    expect(
      extractJVMChangePlan('```json\n{"targetType":"cacheEntry","action":"evict","reason":"修复缓存脏值"}\n```'),
    ).toBeNull();
  });
});
