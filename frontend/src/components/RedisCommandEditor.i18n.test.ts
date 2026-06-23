import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./RedisCommandEditor.tsx', import.meta.url), 'utf8');

describe('RedisCommandEditor i18n', () => {
  it('localizes console chrome while preserving Redis command and result raw content', () => {
    [
      '请输入要执行的命令',
      '连接不存在',
      'Redis Console',
      '执行 (Cmd+Enter)',
      'Execution Output',
      '清空控制台',
      '在此终端执行命令，结果会以原样输出',
      '选中任意行',
      '仅执行选中段落',
      'Redis Command',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("tr('redis_command.message.command_required'");
    expect(source).toContain("tr('redis_command.state.connection_not_found'");
    expect(source).toContain("tr('redis_command.title.console'");
    expect(source).toContain("tr('redis_command.action.execute'");
    expect(source).toContain("tr('redis_command.output.title'");
    expect(source).toContain("tr('redis_command.action.clear_console'");
    expect(source).toContain("tr('redis_command.output.empty_hint'");
    expect(source).toContain("tr('redis_command.output.selection_tip'");
    expect(source).toContain("tr('redis_command.completion.detail'");
  });
});
