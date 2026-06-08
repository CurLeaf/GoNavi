import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AISettingsContextSection from './AISettingsContextSection';
import AISettingsSafetySection from './AISettingsSafetySection';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

const overlayTheme = buildOverlayWorkbenchTheme(false);

describe('AI settings readonly sections', () => {
  it('renders the safety cards and keeps the selected level visible', () => {
    const markup = renderToStaticMarkup(
      <AISettingsSafetySection
        safetyLevel="readonly"
        darkMode={false}
        overlayTheme={overlayTheme}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        onChange={() => {}}
      />,
    );

    expect(markup).toContain('只读模式');
    expect(markup).toContain('读写模式');
    expect(markup).toContain('完全模式');
  });

  it('renders the context cards and keeps the selected level visible', () => {
    const markup = renderToStaticMarkup(
      <AISettingsContextSection
        contextLevel="with_samples"
        darkMode={false}
        overlayTheme={overlayTheme}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
        onChange={() => {}}
      />,
    );

    expect(markup).toContain('仅 Schema');
    expect(markup).toContain('含采样数据');
    expect(markup).toContain('含查询结果');
  });
});
