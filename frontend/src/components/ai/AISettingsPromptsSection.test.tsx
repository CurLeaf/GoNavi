import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AISettingsPromptsSection from './AISettingsPromptsSection';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AISettingsPromptsSection', () => {
  it('renders editable user prompts and readonly builtin prompt blocks after extraction', () => {
    const markup = renderToStaticMarkup(
      <AISettingsPromptsSection
        builtinPrompts={{ 数据库: '生成 SQL 前必须先确认字段名。' }}
        userPromptSettings={{
          global: '',
          database: '',
          jvm: '',
          jvmDiagnostic: '',
        }}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        inputBg="#fff"
        darkMode={false}
        loading={false}
        onChangeUserPrompt={() => {}}
        onSave={() => {}}
      />,
    );

    expect(markup).toContain('用户级自定义提示词');
    expect(markup).toContain('全局补充提示词');
    expect(markup).toContain('保存自定义提示词');
    expect(markup).toContain('数据库');
    expect(markup).toContain('生成 SQL 前必须先确认字段名');
  });
});
