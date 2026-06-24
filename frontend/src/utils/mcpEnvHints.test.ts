import { describe, expect, it } from 'vitest';

import { buildMCPEnvHintProfile } from './mcpEnvHints';

const translatedCopy: Record<string, string> = {
  'ai_settings.mcp_server.env_hints.known.github_token.detail': 'T:github-token-detail',
  'ai_settings.mcp_server.env_hints.known.github_token.value_hint': 'T:github-token-value',
  'ai_settings.mcp_server.env_hints.known.https_proxy.label': 'T:https-proxy-label',
  'ai_settings.mcp_server.env_hints.known.https_proxy.detail': 'T:https-proxy-detail',
  'ai_settings.mcp_server.env_hints.known.https_proxy.value_hint': 'T:https-proxy-value',
  'ai_settings.mcp_server.env_hints.inferred.secret.label': 'T:secret-label',
  'ai_settings.mcp_server.env_hints.inferred.secret.detail': 'T:secret-detail',
  'ai_settings.mcp_server.env_hints.inferred.secret.value_hint': 'T:secret-value',
  'ai_settings.mcp_server.env_hints.warning.empty': 'T:empty {{count}}',
  'ai_settings.mcp_server.env_hints.warning.placeholder': 'T:placeholder {{count}}',
  'ai_settings.mcp_server.env_hints.warning.docker_env_not_forwarded': 'T:docker-boundary',
  'ai_settings.mcp_server.env_hints.next_action.empty': 'T:fill {{keys}}',
  'ai_settings.mcp_server.env_hints.next_action.placeholder': 'T:replace {{keys}}',
  'ai_settings.mcp_server.env_hints.next_action.docker_env': 'T:docker-env',
  'ai_settings.mcp_server.env_hints.next_action.secrets_local': 'T:secrets-local',
  'ai_settings.mcp_server.env_hints.next_action.keys_recognized': 'T:keys-recognized',
};

const translate = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => (translatedCopy[key] || key).replace(/\{\{(\w+)\}\}/g, (_match, name) => String(params?.[name] ?? ''));

describe('mcpEnvHints', () => {
  it('explains common secret and proxy env vars without exposing values', () => {
    const profile = buildMCPEnvHintProfile('uvx', ['mcp-server-github', '--stdio'], {
      GITHUB_TOKEN: 'ghp_real_secret_value',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
    });

    expect(profile?.envVarCount).toBe(2);
    expect(profile?.secretLikeCount).toBe(1);
    expect(profile?.items.find((item) => item.key === 'GITHUB_TOKEN')).toMatchObject({
      label: 'GitHub Token',
      category: 'secret',
      sensitive: true,
      known: true,
    });
    expect(profile?.items.find((item) => item.key === 'HTTPS_PROXY')).toMatchObject({
      label: 'HTTPS proxy',
      category: 'proxy',
      sensitive: false,
      known: true,
    });
    expect(JSON.stringify(profile)).not.toContain('ghp_real_secret_value');
    expect(JSON.stringify(profile)).not.toContain('127.0.0.1:7890');
  });

  it('localizes known env hint copy while preserving raw env keys and values', () => {
    const profile = buildMCPEnvHintProfile('uvx', ['mcp-server-github', '--stdio'], {
      GITHUB_TOKEN: 'ghp_real_secret_value',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
    }, translate);

    expect(profile?.items.find((item) => item.key === 'GITHUB_TOKEN')).toMatchObject({
      label: 'GitHub Token',
      detail: 'T:github-token-detail',
      valueHint: 'T:github-token-value',
    });
    expect(profile?.items.find((item) => item.key === 'HTTPS_PROXY')).toMatchObject({
      label: 'T:https-proxy-label',
      detail: 'T:https-proxy-detail',
      valueHint: 'T:https-proxy-value',
    });
    expect(JSON.stringify(profile)).toContain('GITHUB_TOKEN');
    expect(JSON.stringify(profile)).not.toContain('ghp_real_secret_value');
    expect(JSON.stringify(profile)).not.toContain('127.0.0.1:7890');
  });

  it('localizes inferred env hints and warning actions without translating raw keys', () => {
    const profile = buildMCPEnvHintProfile('docker', ['run', '--rm', '-i', 'mcp/server-fetch:latest'], {
      API_KEY: '',
      CUSTOM_TOKEN: '...',
    }, translate);

    expect(profile?.items.find((item) => item.key === 'API_KEY')).toMatchObject({
      label: 'T:secret-label',
      detail: 'T:secret-detail',
      valueHint: 'T:secret-value',
    });
    expect(profile?.warnings).toEqual(expect.arrayContaining([
      'T:empty 1',
      'T:placeholder 1',
      'T:docker-boundary',
    ]));
    expect(profile?.nextActions).toEqual(expect.arrayContaining([
      'T:fill API_KEY',
      'T:replace CUSTOM_TOKEN',
      'T:docker-env',
      'T:secrets-local',
    ]));
  });

  it('warns when secret env vars still contain placeholders', () => {
    const profile = buildMCPEnvHintProfile('npx', ['-y', '@modelcontextprotocol/server-github', '--stdio'], {
      GITHUB_TOKEN: '...',
      OPENAI_API_KEY: '',
    });

    expect(profile?.warnings).toContain('1 environment variable values are empty and must be filled or removed before testing.');
    expect(profile?.warnings).toContain('1 environment variables still look like example placeholder values.');
    expect(profile?.nextActions.join('\n')).toContain('GITHUB_TOKEN');
    expect(profile?.nextActions.join('\n')).toContain('OPENAI_API_KEY');
  });

  it('explains docker env forwarding boundaries', () => {
    const profile = buildMCPEnvHintProfile('docker', ['run', '--rm', '-i', 'mcp/server-fetch:latest'], {
      API_KEY: 'secret',
    });

    expect(profile?.warnings).toContain('When command=docker, these environment variables are passed only to the docker CLI and do not automatically enter the container.');
    expect(profile?.nextActions.join('\n')).toContain('-e KEY=VALUE');
  });

  it('does not warn about docker container env when args already forward env values', () => {
    const profile = buildMCPEnvHintProfile('docker', ['run', '--rm', '-i', '-e', 'API_KEY=secret', 'mcp/server-fetch:latest'], {
      DOCKER_HOST: 'npipe:////./pipe/docker_engine',
    });

    expect(profile?.items[0]).toMatchObject({
      key: 'DOCKER_HOST',
      label: 'Docker Daemon address',
      category: 'runtime',
    });
    expect(profile?.warnings.join('\n')).not.toContain('do not automatically enter the container');
  });
});
