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
  });

  it('supports filtering by chinese keywords in addition to command prefix', () => {
    const commands = filterAISlashCommands('体检');

    expect(commands.map((command) => command.cmd)).toContain('/health');
    expect(commands.map((command) => command.cmd)).not.toContain('/mcpadd');
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
  });
});
