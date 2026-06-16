import { describe, expect, it } from 'vitest';

import { buildMCPEnvHintProfile } from './mcpEnvHints';

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
      label: 'HTTPS 代理',
      category: 'proxy',
      sensitive: false,
      known: true,
    });
    expect(JSON.stringify(profile)).not.toContain('ghp_real_secret_value');
    expect(JSON.stringify(profile)).not.toContain('127.0.0.1:7890');
  });

  it('warns when secret env vars still contain placeholders', () => {
    const profile = buildMCPEnvHintProfile('npx', ['-y', '@modelcontextprotocol/server-github', '--stdio'], {
      GITHUB_TOKEN: '...',
      OPENAI_API_KEY: '',
    });

    expect(profile?.warnings).toContain('1 个环境变量值为空，测试前需要补齐或删除。');
    expect(profile?.warnings).toContain('1 个环境变量看起来仍是示例占位值。');
    expect(profile?.nextActions.join('\n')).toContain('GITHUB_TOKEN');
    expect(profile?.nextActions.join('\n')).toContain('OPENAI_API_KEY');
  });

  it('explains docker env forwarding boundaries', () => {
    const profile = buildMCPEnvHintProfile('docker', ['run', '--rm', '-i', 'mcp/server-fetch:latest'], {
      API_KEY: 'secret',
    });

    expect(profile?.warnings).toContain('command=docker 时，这里的环境变量只传给 docker CLI，不会自动进入容器。');
    expect(profile?.nextActions.join('\n')).toContain('-e KEY=VALUE');
  });

  it('does not warn about docker container env when args already forward env values', () => {
    const profile = buildMCPEnvHintProfile('docker', ['run', '--rm', '-i', '-e', 'API_KEY=secret', 'mcp/server-fetch:latest'], {
      DOCKER_HOST: 'npipe:////./pipe/docker_engine',
    });

    expect(profile?.items[0]).toMatchObject({
      key: 'DOCKER_HOST',
      label: 'Docker Daemon 地址',
      category: 'runtime',
    });
    expect(profile?.warnings.join('\n')).not.toContain('不会自动进入容器');
  });
});
