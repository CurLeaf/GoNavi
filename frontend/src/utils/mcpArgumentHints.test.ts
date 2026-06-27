import { describe, expect, it } from 'vitest';

import { buildMCPArgumentDetailHints } from './mcpArgumentDetailHints';
import { buildMCPArgumentHintProfile } from './mcpArgumentHints';

describe('mcpArgumentHints', () => {
  it('guides npx users to split package and stdio arguments', () => {
    const profile = buildMCPArgumentHintProfile('npx', ['-y']);

    expect(profile?.title).toContain('npx');
    expect(profile?.orderHint).toContain('-y -> package -> --stdio');
    expect(profile?.nextActions).toContain('Add MCP package name, example: @modelcontextprotocol/server-filesystem');
    expect(profile?.nextActions).toContain('Add stdio argument, example: --stdio');
  });

  it('recognizes a complete node script launch', () => {
    const profile = buildMCPArgumentHintProfile('node', ['server.js', '--stdio']);

    expect(profile?.title).toContain('Node');
    expect(profile?.steps.find((item) => item.key === 'script')?.satisfied).toBe(true);
    expect(profile?.nextActions).toEqual([]);
  });

  it('explains python module launches as independent args', () => {
    const profile = buildMCPArgumentHintProfile('C:\\Python312\\python.exe', ['-m']);

    expect(profile?.commandName).toBe('python');
    expect(profile?.orderHint).toContain('-m -> module name -> --stdio');
    expect(profile?.nextActions).toContain('Add Module name, example: your_mcp_server');
  });

  it('guides docker users to keep stdin and provide an image', () => {
    const profile = buildMCPArgumentHintProfile('docker', ['run', '--rm']);

    expect(profile?.title).toContain('Docker');
    expect(profile?.orderHint).toContain('run -> --rm -> -i');
    expect(profile?.nextActions).toContain('Add Keep standard input, example: -i');
    expect(profile?.nextActions).toContain('Add Image name, example: mcp/server-fetch:latest');
  });

  it('detects full command lines pasted into the command field', () => {
    const profile = buildMCPArgumentHintProfile('docker run --rm mcp/server-fetch:latest', []);

    expect(profile?.normalizedCommand).toBe('docker');
    expect(profile?.inlineArgs).toEqual(['run', '--rm', 'mcp/server-fetch:latest']);
    expect(profile?.commandFieldWarning).toContain('The startup command field still contains 3 arguments');
    expect(profile?.steps.find((item) => item.key === 'run')?.satisfied).toBe(true);
    expect(profile?.steps.find((item) => item.key === 'image')?.satisfied).toBe(true);
    expect(profile?.nextActions).toContain('Add Keep standard input, example: -i');
  });

  it('falls back to executable guidance for custom binaries', () => {
    const profile = buildMCPArgumentHintProfile('D:\\tools\\acme-mcp-server.exe', []);

    expect(profile?.title).toContain('Local executable');
    expect(profile?.summary).toContain('GoNavi passes arguments in tag order unchanged');
  });

  it('explains common business arguments beyond startup order', () => {
    const profile = buildMCPArgumentHintProfile('npx', [
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '--stdio',
      '--directory',
      'D:\\Work',
      '--transport',
      'stdio',
      '--port=8080',
    ]);

    expect(profile?.businessHints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'directory',
        label: 'Allowed directory',
        category: 'path',
      }),
      expect.objectContaining({
        key: 'transport',
        label: 'Transport mode',
        category: 'mode',
      }),
      expect.objectContaining({
        key: 'port',
        label: 'Port',
        category: 'network',
      }),
    ]));
  });

  it('builds per-argument explanations for unknown flags and positional values', () => {
    const hints = buildMCPArgumentDetailHints('acme-mcp-server', [
      '--tenant',
      'prod',
      '--workspace',
      'D:\\Work',
      'extra-target',
    ]);

    expect(hints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        argument: '--tenant',
        label: 'Unrecognized argument',
        category: 'generic',
      }),
      expect.objectContaining({
        argument: 'prod',
        label: 'Unrecognized argument value',
      }),
      expect.objectContaining({
        argument: '--workspace',
        label: 'Workspace directory',
        category: 'path',
      }),
      expect.objectContaining({
        argument: 'D:\\Work',
        label: 'Workspace directory value',
      }),
      expect.objectContaining({
        argument: 'extra-target',
        label: 'Positional argument',
      }),
    ]));
  });

  it('sanitizes sensitive inline argument values in hints', () => {
    const args = [
      'mcp-server-demo',
      '--api-key=sk-real-secret',
      '--token',
      'ghp_real-secret-token',
      '--endpoint',
      'https://api.example.com',
    ];
    const profile = buildMCPArgumentHintProfile('uvx', [
      ...args,
    ]);
    const argumentHints = buildMCPArgumentDetailHints('uvx', args);

    expect(profile?.businessHints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'api-key',
        argument: '--api-key',
        category: 'secret',
        sensitive: true,
      }),
      expect.objectContaining({
        key: 'endpoint',
        category: 'endpoint',
      }),
    ]));
    expect(JSON.stringify(profile?.businessHints)).not.toContain('sk-real-secret');
    expect(argumentHints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        argument: '--api-key',
        sensitive: true,
      }),
      expect.objectContaining({
        argument: '<hidden>',
        label: 'Token value',
        sensitive: true,
      }),
    ]));
    expect(JSON.stringify(argumentHints)).not.toContain('sk-real-secret');
    expect(JSON.stringify(argumentHints)).not.toContain('ghp_real-secret-token');
  });
});
