import { describe, expect, it } from 'vitest';

import { createGlobalProxyDraft, toPersistedGlobalProxy, toSaveGlobalProxyInput } from './globalProxyDraft';

describe('global proxy draft', () => {
  it('hydrates a secretless draft from backend metadata while keeping password input blank', () => {
    const draft = createGlobalProxyDraft({
      enabled: true,
      type: 'http',
      host: '127.0.0.1',
      port: 8080,
      user: 'ops',
      hasPassword: true,
      password: 'should-be-ignored',
    });

    expect(draft.password).toBe('');
    expect(draft.hasPassword).toBe(true);
  });

  it('drops password from persisted metadata but preserves hasPassword', () => {
    const persisted = toPersistedGlobalProxy({
      enabled: true,
      type: 'http',
      host: '127.0.0.1',
      port: 8080,
      user: 'ops',
      password: 'proxy-secret',
      hasPassword: true,
    });

    expect('password' in persisted).toBe(false);
    expect(persisted.hasPassword).toBe(true);
  });

  it('passes explicit saved password clearing intent to the backend save payload', () => {
    const input = toSaveGlobalProxyInput({
      enabled: true,
      type: 'socks5',
      host: '127.0.0.1',
      port: 7890,
      hasPassword: true,
      clearPassword: true,
    });

    expect(input.password).toBe('');
    expect(input.clearPassword).toBe(true);
  });
});
