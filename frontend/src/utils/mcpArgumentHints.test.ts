import { describe, expect, it } from 'vitest';

import { buildMCPArgumentDetailHints } from './mcpArgumentDetailHints';
import { buildMCPArgumentHintProfile } from './mcpArgumentHints';

describe('mcpArgumentHints', () => {
  it('guides npx users to split package and stdio arguments', () => {
    const profile = buildMCPArgumentHintProfile('npx', ['-y']);

    expect(profile?.title).toContain('npx');
    expect(profile?.orderHint).toContain('-y -> 包名 -> --stdio');
    expect(profile?.nextActions).toContain('补充 MCP 包名，示例：@modelcontextprotocol/server-filesystem');
    expect(profile?.nextActions).toContain('补充 stdio 参数，示例：--stdio');
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
    expect(profile?.orderHint).toContain('-m -> 模块名 -> --stdio');
    expect(profile?.nextActions).toContain('补充 模块名，示例：your_mcp_server');
  });

  it('guides docker users to keep stdin and provide an image', () => {
    const profile = buildMCPArgumentHintProfile('docker', ['run', '--rm']);

    expect(profile?.title).toContain('Docker');
    expect(profile?.orderHint).toContain('run -> --rm -> -i');
    expect(profile?.nextActions).toContain('补充 保持标准输入，示例：-i');
    expect(profile?.nextActions).toContain('补充 镜像名，示例：mcp/server-fetch:latest');
  });

  it('detects full command lines pasted into the command field', () => {
    const profile = buildMCPArgumentHintProfile('docker run --rm mcp/server-fetch:latest', []);

    expect(profile?.normalizedCommand).toBe('docker');
    expect(profile?.inlineArgs).toEqual(['run', '--rm', 'mcp/server-fetch:latest']);
    expect(profile?.commandFieldWarning).toContain('启动命令字段里还包含 3 个参数');
    expect(profile?.steps.find((item) => item.key === 'run')?.satisfied).toBe(true);
    expect(profile?.steps.find((item) => item.key === 'image')?.satisfied).toBe(true);
    expect(profile?.nextActions).toContain('补充 保持标准输入，示例：-i');
  });

  it('falls back to executable guidance for custom binaries', () => {
    const profile = buildMCPArgumentHintProfile('D:\\tools\\acme-mcp-server.exe', []);

    expect(profile?.title).toContain('本机可执行文件');
    expect(profile?.summary).toContain('GoNavi 会原样按标签顺序传入');
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
        label: '授权目录',
        category: 'path',
      }),
      expect.objectContaining({
        key: 'transport',
        label: '传输模式',
        category: 'mode',
      }),
      expect.objectContaining({
        key: 'port',
        label: '端口',
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
        label: '未识别参数',
        category: 'generic',
      }),
      expect.objectContaining({
        argument: 'prod',
        label: '未识别参数的值',
      }),
      expect.objectContaining({
        argument: '--workspace',
        label: '工作区目录',
        category: 'path',
      }),
      expect.objectContaining({
        argument: 'D:\\Work',
        label: '工作区目录的值',
      }),
      expect.objectContaining({
        argument: 'extra-target',
        label: '位置参数',
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
        argument: '<已隐藏>',
        label: 'Token的值',
        sensitive: true,
      }),
    ]));
    expect(JSON.stringify(argumentHints)).not.toContain('sk-real-secret');
    expect(JSON.stringify(argumentHints)).not.toContain('ghp_real-secret-token');
  });
});
