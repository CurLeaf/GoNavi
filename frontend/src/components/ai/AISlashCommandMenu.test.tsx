import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AISlashCommandMenu from './AISlashCommandMenu';

describe('AISlashCommandMenu', () => {
  it('renders an empty-state hint when the slash filter has no matches', () => {
    const markup = renderToStaticMarkup(
      <AISlashCommandMenu
        visible
        commands={[]}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        onSelect={() => {}}
      />,
    );

    expect(markup).toContain('data-ai-chat-slash-empty="true"');
    expect(markup).toContain('没有匹配的快捷命令');
    expect(markup).toContain('/query');
  });

  it('renders slash command entries when matches exist', () => {
    const markup = renderToStaticMarkup(
      <AISlashCommandMenu
        visible
        commands={[{
          cmd: '/sql',
          label: '生成 SQL',
          desc: '描述需求自动生成语句',
          prompt: '请根据以下需求生成 SQL：',
        }]}
        darkMode={false}
        textColor="#162033"
        mutedColor="rgba(16,24,40,0.55)"
        onSelect={() => {}}
      />,
    );

    expect(markup).toContain('/sql');
    expect(markup).toContain('生成 SQL');
    expect(markup).not.toContain('没有匹配的快捷命令');
  });
});
