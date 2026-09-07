import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('antd', () => ({
  Select: (props: any) => (
    <div data-select="true" className={props.className} aria-label={props['aria-label']}>
      {typeof props.popupRender === 'function' ? props.popupRender(<div data-select-menu="true" />) : null}
    </div>
  ),
}));

import AIProviderPresetSelect from './AIProviderPresetSelect';

describe('AIProviderPresetSelect', () => {
  it('renders a two-column popup with an empty partner column', () => {
    const markup = renderToStaticMarkup(
      <AIProviderPresetSelect
        value="openai"
        presets={[{ key: 'openai', label: 'OpenAI' }]}
        canSelect={() => true}
        builtinLabel="Built-in"
        partnerLabel="Featured sponsors"
        partnerEmpty="No sponsors yet"
        ariaLabel="Provider"
        onChange={() => {}}
      />,
    );
    expect(markup).toContain('gonavi-ai-provider-preset-dropdown-grid');
    expect(markup).toContain('is-partner');
    expect(markup).toContain('Built-in');
    expect(markup).toContain('Featured sponsors');
    expect(markup).toContain('No sponsors yet');
  });
});
