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
});
