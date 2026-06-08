import { describe, expect, it } from 'vitest';

import { parseMCPCommandDraft, splitShellLikeCommand } from './mcpCommandDraft';

describe('mcpCommandDraft helpers', () => {
  it('splits quoted command lines and leading env assignments into dedicated fields', () => {
    const result = parseMCPCommandDraft('OPENAI_API_KEY="abc 123" "C:\\Program Files\\GoNavi\\gonavi-mcp-server.exe" stdio --port 8811');

    expect(result).toEqual({
      ok: true,
      draft: {
        command: 'C:\\Program Files\\GoNavi\\gonavi-mcp-server.exe',
        args: ['stdio', '--port', '8811'],
        env: {
          OPENAI_API_KEY: 'abc 123',
        },
      },
    });
  });

  it('keeps python module style launches as command plus independent args', () => {
    const result = parseMCPCommandDraft('PYTHONPATH=./tools python -m my_mcp_server --stdio');

    expect(result.ok).toBe(true);
    expect(result.draft).toEqual({
      command: 'python',
      args: ['-m', 'my_mcp_server', '--stdio'],
      env: {
        PYTHONPATH: './tools',
      },
    });
  });

  it('reports unclosed quotes instead of producing a broken parse', () => {
    expect(splitShellLikeCommand('uvx "broken command')).toEqual({
      tokens: ['uvx'],
      error: '命令中存在未闭合的引号，请检查后重试。',
    });
  });
});
