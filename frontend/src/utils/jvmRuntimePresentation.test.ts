import { describe, expect, it } from 'vitest';

import { buildJVMTabTitle, resolveJVMModeMeta } from './jvmRuntimePresentation';

describe('jvmRuntimePresentation', () => {
  it('returns labels for built-in JVM modes', () => {
    expect(resolveJVMModeMeta('jmx').label).toBe('JMX');
    expect(resolveJVMModeMeta('endpoint').label).toBe('Endpoint');
  });

  it('builds overview tab titles with connection name and mode label', () => {
    expect(buildJVMTabTitle('Orders JVM', 'overview', 'jmx')).toBe('[Orders JVM] JVM 概览 · JMX');
  });

  it('builds resource tab titles with the planned label', () => {
    expect(buildJVMTabTitle('Orders JVM', 'resource', 'endpoint')).toBe('[Orders JVM] JVM 资源 · Endpoint');
  });

  it('builds audit tab titles with the planned label', () => {
    expect(buildJVMTabTitle('Orders JVM', 'audit', 'jmx')).toBe('[Orders JVM] JVM 审计 · JMX');
  });
});
