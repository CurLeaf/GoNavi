import { describe, expect, it } from 'vitest';

import {
  MCP_AUTHORING_NOTES,
  MCP_TROUBLESHOOTING_GUIDES,
} from './mcpServerGuidance';

describe('mcpServerGuidance', () => {
  it('keeps actionable troubleshooting hints for common MCP setup mistakes', () => {
    const symptoms = MCP_TROUBLESHOOTING_GUIDES.map((item) => item.symptom);
    const allGuidance = MCP_TROUBLESHOOTING_GUIDES
      .flatMap((item) => [item.likelyCause, item.fix, item.example || ''])
      .join('\n');

    expect(symptoms).toContain('测试提示找不到命令');
    expect(symptoms).toContain('认证失败、401 或 403');
    expect(allGuidance).toContain('命令参数');
    expect(allGuidance).toContain('KEY=VALUE');
    expect(allGuidance).toContain('当前只支持 stdio');
  });

  it('warns users to keep secrets in local env config instead of chat content', () => {
    const notes = MCP_AUTHORING_NOTES.join('\n');

    expect(notes).toContain('本机配置');
    expect(notes).toContain('不要把密钥写进聊天内容');
    expect(notes).toContain('PowerShell $env:KEY=VALUE;');
    expect(notes).toContain('Windows set KEY=VALUE &&');
  });
});
