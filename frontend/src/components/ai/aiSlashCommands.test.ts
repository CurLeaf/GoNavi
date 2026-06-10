import { describe, expect, it } from 'vitest';

import {
  filterAISlashCommands,
  getFeaturedAISlashCommands,
  groupAISlashCommands,
} from './aiSlashCommands';

describe('aiSlashCommands', () => {
  it('returns all default commands when only slash is present', () => {
    const commands = filterAISlashCommands('/');

    expect(commands.length).toBeGreaterThan(8);
    expect(commands.some((command) => command.cmd === '/health')).toBe(true);
    expect(commands.some((command) => command.cmd === '/mcp')).toBe(true);
    expect(commands.some((command) => command.cmd === '/mcpadd')).toBe(true);
    expect(commands.some((command) => command.cmd === '/mcpdraft')).toBe(true);
    expect(commands.some((command) => command.cmd === '/mcptool')).toBe(true);
    expect(commands.some((command) => command.cmd === '/connfail')).toBe(true);
    expect(commands.some((command) => command.cmd === '/shortcuts')).toBe(true);
    expect(commands.some((command) => command.cmd === '/applog')).toBe(true);
    expect(commands.some((command) => command.cmd === '/airender')).toBe(true);
    expect(commands.some((command) => command.cmd === '/tx')).toBe(true);
  });

  it('supports filtering by chinese keywords in addition to command prefix', () => {
    const commands = filterAISlashCommands('体检');

    expect(commands.map((command) => command.cmd)).toContain('/health');
    expect(commands.map((command) => command.cmd)).not.toContain('/mcpadd');
  });

  it('supports filtering shortcut diagnostics by chinese keyword and command prefix', () => {
    expect(filterAISlashCommands('快捷键').map((command) => command.cmd)).toContain('/shortcuts');
    expect(filterAISlashCommands('/sho').map((command) => command.cmd)).toContain('/shortcuts');
  });

  it('supports filtering connection-failure diagnostics by chinese keyword and command prefix', () => {
    expect(filterAISlashCommands('连接失败').map((command) => command.cmd)).toContain('/connfail');
    expect(filterAISlashCommands('/conn').map((command) => command.cmd)).toContain('/connfail');
  });

  it('supports filtering app-log diagnostics by chinese keyword and command prefix', () => {
    expect(filterAISlashCommands('日志').map((command) => command.cmd)).toContain('/applog');
    expect(filterAISlashCommands('/app').map((command) => command.cmd)).toContain('/applog');
  });

  it('supports filtering ai-render diagnostics by chinese keyword and command prefix', () => {
    expect(filterAISlashCommands('气泡空白').map((command) => command.cmd)).toContain('/airender');
    expect(filterAISlashCommands('/air').map((command) => command.cmd)).toContain('/airender');
  });

  it('supports filtering sql editor transaction diagnostics by keyword and command prefix', () => {
    expect(filterAISlashCommands('自动提交').map((command) => command.cmd)).toContain('/tx');
    expect(filterAISlashCommands('未提交').map((command) => command.cmd)).toContain('/tx');
    expect(filterAISlashCommands('/tx').map((command) => command.cmd)).toContain('/tx');
  });

  it('supports filtering mcp tool schema diagnostics by keyword and command prefix', () => {
    expect(filterAISlashCommands('arguments').map((command) => command.cmd)).toContain('/mcptool');
    expect(filterAISlashCommands('MCP工具参数').map((command) => command.cmd)).toContain('/mcptool');
    expect(filterAISlashCommands('/mcpt').map((command) => command.cmd)).toContain('/mcptool');
  });

  it('supports filtering mcp draft validation diagnostics by keyword and command prefix', () => {
    expect(filterAISlashCommands('MCP草稿').map((command) => command.cmd)).toContain('/mcpdraft');
    expect(filterAISlashCommands('启动命令').map((command) => command.cmd)).toContain('/mcpdraft');
    expect(filterAISlashCommands('/mcpd').map((command) => command.cmd)).toContain('/mcpdraft');
  });

  it('groups commands by configured category order', () => {
    const groups = groupAISlashCommands(filterAISlashCommands('/'));

    expect(groups[0]?.key).toBe('generate');
    expect(groups[1]?.key).toBe('review');
    expect(groups[2]?.key).toBe('diagnose');
  });

  it('keeps featured commands available for empty-state quick picks', () => {
    const featured = getFeaturedAISlashCommands().map((command) => command.cmd);

    expect(featured).toContain('/sql');
    expect(featured).toContain('/health');
    expect(featured).toContain('/mcp');
    expect(featured).toContain('/mcpadd');
    expect(featured).toContain('/connfail');
    expect(featured).toContain('/tx');
    expect(featured).not.toContain('/shortcuts');
  });
});
