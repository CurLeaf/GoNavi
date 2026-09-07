import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AIProviderLogo, PRESET_ICON_SLUG } from './AIProviderLogo';

describe('AIProviderLogo', () => {
  it('maps known presets to brand SVG paths', () => {
    expect(PRESET_ICON_SLUG.openai).toBe('openai');
    expect(PRESET_ICON_SLUG['claude-subscription']).toBe('claudecode');
    expect(PRESET_ICON_SLUG['qwen-bailian']).toBe('alibabacloud');
    const markup = renderToStaticMarkup(<AIProviderLogo presetKey="openai" label="OpenAI" />);
    expect(markup).toContain('/icons/ai/openai.svg');
  });

  it('falls back to the first letter when there is no asset', () => {
    const markup = renderToStaticMarkup(<AIProviderLogo presetKey="moonshot" label="Kimi" />);
    expect(markup).toContain('is-fallback');
    expect(markup).toContain('K');
    expect(markup).not.toContain('/icons/ai/');
  });
});
