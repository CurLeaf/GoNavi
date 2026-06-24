import { describe, expect, it } from 'vitest';

import { buildJVMTabTitle, resolveJVMModeMeta } from './jvmRuntimePresentation';

describe('jvmRuntimePresentation', () => {
  it('returns labels for built-in JVM modes', () => {
    expect(resolveJVMModeMeta('jmx').label).toBe('JMX');
    expect(resolveJVMModeMeta('endpoint').label).toBe('Endpoint');
  });

  it('builds overview tab titles with connection name and mode label', () => {
    const translate = (key: string) => `T(${key})`;

    expect(buildJVMTabTitle('Orders JVM', 'overview', 'jmx', translate)).toBe('[Orders JVM] T(sidebar.jvm.tab.overview) · JMX');
  });

  it('builds resource tab titles with the planned label', () => {
    const translate = (key: string) => `T(${key})`;

    expect(buildJVMTabTitle('Orders JVM', 'resource', 'endpoint', translate)).toBe('[Orders JVM] T(sidebar.jvm.tab.resource) · Endpoint');
  });

  it('builds audit tab titles with the planned label', () => {
    const translate = (key: string) => `T(${key})`;

    expect(buildJVMTabTitle('Orders JVM', 'audit', 'jmx', translate)).toBe('[Orders JVM] T(sidebar.jvm.tab.audit) · JMX');
  });

  it('builds diagnostic and monitoring tab titles from i18n keys', () => {
    const translate = (key: string) => `T(${key})`;

    expect(buildJVMTabTitle('Orders JVM', 'diagnostic', 'agent', translate)).toBe('[Orders JVM] T(sidebar.jvm.tab.diagnostic) · Agent');
    expect(buildJVMTabTitle('Orders JVM', 'monitoring', 'jmx', translate)).toBe('[Orders JVM] T(sidebar.jvm.tab.monitoring) · JMX');
  });
});
