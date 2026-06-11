import { describe, expect, it } from 'vitest';

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

  it('falls back to executable guidance for custom binaries', () => {
    const profile = buildMCPArgumentHintProfile('D:\\tools\\acme-mcp-server.exe', []);

    expect(profile?.title).toContain('本机可执行文件');
    expect(profile?.summary).toContain('GoNavi 会原样按标签顺序传入');
  });
});
