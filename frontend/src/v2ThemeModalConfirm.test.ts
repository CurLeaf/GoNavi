import { describe, expect, it } from 'vitest';
import { readV2ThemeCss } from './test/readV2ThemeCss';

const v2ThemeCss = readV2ThemeCss();

describe('v2 modal confirm theme', () => {
  it('keeps static confirm title and content readable in dark theme', () => {
    expect(v2ThemeCss).toMatch(/body\[data-ui-version="v2"\]\s+\.ant-modal-confirm\s+\.ant-modal-confirm-title\s*\{[^}]*color:\s*var\(--gn-fg-1\)\s*!important;/s);
    expect(v2ThemeCss).toMatch(/body\[data-ui-version="v2"\]\s+\.ant-modal-confirm\s+\.ant-modal-confirm-content\s*\{[^}]*color:\s*var\(--gn-fg-2\)\s*!important;/s);
  });
});
