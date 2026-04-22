import { describe, expect, it } from 'vitest';

import { buildDefaultJVMConnectionValues, buildJVMConnectionConfig } from './jvmConnectionConfig';

describe('jvmConnectionConfig', () => {
  it('defaults to readonly jmx mode', () => {
    const values = buildDefaultJVMConnectionValues();
    expect(values.type).toBe('jvm');
    expect(values.jvmReadOnly).toBe(true);
    expect(values.jvmAllowedModes).toEqual(['jmx']);
    expect(values.jvmPreferredMode).toBe('jmx');
  });

  it('builds nested jvm config payload', () => {
    const config = buildJVMConnectionConfig({
      name: 'Orders JVM',
      type: 'jvm',
      host: 'orders.internal',
      port: 9010,
      jvmReadOnly: true,
      jvmAllowedModes: ['jmx', 'endpoint'],
      jvmPreferredMode: 'endpoint',
      jvmEnvironment: 'prod',
      jvmEndpointEnabled: true,
      jvmEndpointBaseUrl: 'https://orders.internal/manage/jvm',
      jvmEndpointApiKey: 'token-1',
    });
    expect(config.jvm?.preferredMode).toBe('endpoint');
    expect(config.jvm?.endpoint?.baseUrl).toBe('https://orders.internal/manage/jvm');
  });

  it('normalizes allowed modes and falls back preferred mode to first allowed mode', () => {
    const config = buildJVMConnectionConfig({
      host: 'cache.internal',
      port: 9010,
      jvmAllowedModes: [' Endpoint ', 'invalid', 'JMX', 'endpoint'],
      jvmPreferredMode: 'AGENT',
    });

    expect(config.jvm?.allowedModes).toEqual(['endpoint', 'jmx']);
    expect(config.jvm?.preferredMode).toBe('endpoint');
    expect(config.jvm?.jmx?.enabled).toBe(true);
  });

  it('normalizes environment and port defaults when input is invalid', () => {
    const config = buildJVMConnectionConfig({
      host: 'orders.internal',
      port: 0,
      jvmJmxPort: '',
      jvmEnvironment: ' PROD ',
      jvmReadOnly: false,
      jvmAllowedModes: ['JMX'],
      jvmPreferredMode: 'jmx',
    });

    expect(config.port).toBe(9010);
    expect(config.jvm?.jmx?.port).toBe(9010);
    expect(config.jvm?.environment).toBe('prod');
    expect(config.jvm?.readOnly).toBe(false);
  });
});
