import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AISettingsSkillsSection from './AISettingsSkillsSection';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AISettingsSkillsSection', () => {
  it('renders the extracted skill configuration section', () => {
    const markup = renderToStaticMarkup(
      <AISettingsSkillsSection
        skills={[]}
        skillRequiredToolOptions={[]}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        inputBg="#fff"
        loading={false}
        onAddSkill={() => {}}
        onUpdateSkillDraft={() => {}}
        onSaveSkill={() => {}}
        onDeleteSkill={() => {}}
      />,
    );

    expect(markup).toContain('新增 Skill');
    expect(markup).toContain('还没有 Skill');
    expect(markup).toContain('命名的提示模块');
  });
});
