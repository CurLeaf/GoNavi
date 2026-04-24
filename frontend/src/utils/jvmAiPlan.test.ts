import { describe, expect, it } from 'vitest';

import { buildJVMChangeDraftFromAIPlan, extractJVMChangePlan, resolveJVMAIPlanResourceId, resolveJVMAIPlanTargetTabId } from './jvmAiPlan';

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
    expect(plan ? resolveJVMAIPlanResourceId(plan) : '').toBe('orders/user:1');
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

describe('buildJVMChangeDraftFromAIPlan', () => {
  it('maps updateValue plan to current JVM change contract', () => {
    const plan = extractJVMChangePlan(
      '```json\n{"targetType":"cacheEntry","selector":{"namespace":"orders","key":"user:1"},"action":"updateValue","payload":{"format":"json","value":{"status":"ACTIVE"}},"reason":"修复缓存脏值"}\n```',
    );

    expect(plan).not.toBeNull();
    expect(buildJVMChangeDraftFromAIPlan(plan!)).toEqual({
      resourceId: 'orders/user:1',
      action: 'put',
      reason: '修复缓存脏值',
      source: 'ai-plan',
      payload: {
        status: 'ACTIVE',
      },
    });
  });

  it('maps clear plan without leaking wrapper payload fields', () => {
    const plan = extractJVMChangePlan(
      '```json\n{"targetType":"managedBean","selector":{"resourcePath":"/cache/orders"},"action":"clear","reason":"受控清理"}\n```',
    );

    expect(plan).not.toBeNull();
    expect(buildJVMChangeDraftFromAIPlan(plan!)).toEqual({
      resourceId: '/cache/orders',
      action: 'clear',
      reason: '受控清理',
      source: 'ai-plan',
      payload: {},
    });
  });

  it('rejects non-object update payload values for current preview contract', () => {
    const plan = extractJVMChangePlan(
      '```json\n{"targetType":"cacheEntry","selector":{"resourcePath":"/cache/orders"},"action":"updateValue","payload":{"format":"text","value":"ACTIVE"},"reason":"修复缓存脏值"}\n```',
    );

    expect(plan).not.toBeNull();
    expect(() => buildJVMChangeDraftFromAIPlan(plan!)).toThrow('当前 JVM 预览要求 payload 仍然是 JSON 对象');
  });

  it('keeps generic action for managed bean payload updates', () => {
    const plan = extractJVMChangePlan(
      '```json\n{"targetType":"attribute","selector":{"resourcePath":"jmx://java.lang/type=Memory/attribute/Verbose"},"action":"set","payload":{"format":"json","value":{"value":true}},"reason":"开启诊断日志"}\n```',
    );

    expect(plan).not.toBeNull();
    expect(buildJVMChangeDraftFromAIPlan(plan!)).toEqual({
      resourceId: 'jmx://java.lang/type=Memory/attribute/Verbose',
      action: 'set',
      reason: '开启诊断日志',
      source: 'ai-plan',
      payload: {
        value: true,
      },
    });
  });
});

describe('resolveJVMAIPlanTargetTabId', () => {
  it('prefers the original tab when message context still matches', () => {
    expect(
      resolveJVMAIPlanTargetTabId(
        [
          {
            id: 'tab-orders',
            title: 'orders',
            type: 'jvm-resource',
            connectionId: 'conn-orders',
            providerMode: 'endpoint',
            resourcePath: '/cache/orders/user:1',
          },
        ],
        {
          tabId: 'tab-orders',
          connectionId: 'conn-orders',
          providerMode: 'endpoint',
          resourcePath: '/cache/orders/user:1',
        },
      ),
    ).toBe('tab-orders');
  });

  it('falls back to a reopened tab with the same JVM context', () => {
    expect(
      resolveJVMAIPlanTargetTabId(
        [
          {
            id: 'tab-orders-reopened',
            title: 'orders',
            type: 'jvm-resource',
            connectionId: 'conn-orders',
            providerMode: 'endpoint',
            resourcePath: '/cache/orders/user:1',
          },
        ],
        {
          tabId: 'tab-orders-old',
          connectionId: 'conn-orders',
          providerMode: 'endpoint',
          resourcePath: '/cache/orders/user:1',
        },
      ),
    ).toBe('tab-orders-reopened');
  });

  it('rejects tabs that only match the current session but not the original JVM context', () => {
    expect(
      resolveJVMAIPlanTargetTabId(
        [
          {
            id: 'tab-other-resource',
            title: 'orders-other',
            type: 'jvm-resource',
            connectionId: 'conn-orders',
            providerMode: 'endpoint',
            resourcePath: '/cache/orders/user:2',
          },
        ],
        {
          tabId: 'tab-orders',
          connectionId: 'conn-orders',
          providerMode: 'endpoint',
          resourcePath: '/cache/orders/user:1',
        },
      ),
    ).toBe('');
  });
});
