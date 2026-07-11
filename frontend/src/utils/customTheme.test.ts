import { describe, expect, it } from 'vitest';
import {
  CUSTOM_THEME_MAX_BYTES,
  extractComputedCustomThemeAntTokens,
  extractCustomThemeAntTokens,
  sanitizeCustomThemeList,
  validateCustomThemeCss,
} from './customTheme';

describe('custom theme CSS validation', () => {
  it('accepts local CSS and normalizes line endings', () => {
    const result = validateCustomThemeCss(
      'body[data-custom-theme] {\r\n  --gn-accent: #8b5cf6;\r\n}',
    );
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (result.ok) expect(result.css).not.toContain('\r');
  });

  it.each([
    ['unsafe-import', '@import "https://example.com/theme.css"; body { color: red; }'],
    ['unsafe-import', '@\\69mport "theme.css"; body { color: red; }'],
    ['unsafe-import', '@im/**/port "theme.css"; body { color: red; }'],
    ['unsafe-url', 'body { background: u\\72l(https://example.com/pixel); }'],
    ['unsafe-url', 'body { background: u/**/rl(/sensitive-endpoint); }'],
    ['unsafe-url', 'body { background: image-set("https://example.com/pixel.png" 1x); }'],
    ['unsafe-url', 'body { background: image-set("/sensitive-endpoint" 1x); }'],
    ['unsafe-url', 'body { background: image-set("\\\\\\\\evil.example/pixel" 1x); }'],
    ['unsafe-url', 'body { content: "/*"; background: url(https://evil.example/pixel); --x: "*/"; }'],
    ['unsafe-url', 'body { background: src("relative-image.png"); }'],
    ['unsafe-font-face', '@font-face { font-family: demo; src: local(demo); }'],
    ['unsafe-legacy-script', 'body { behavior: expression(alert(1)); }'],
  ] as const)('rejects %s resources or legacy execution hooks', (reason, css) => {
    expect(validateCustomThemeCss(css)).toEqual(expect.objectContaining({ ok: false, reason }));
  });

  it('rejects empty, malformed and oversized stylesheets', () => {
    expect(validateCustomThemeCss('')).toEqual(expect.objectContaining({ ok: false, reason: 'empty' }));
    expect(validateCustomThemeCss('body { color: red;')).toEqual(
      expect.objectContaining({ ok: false, reason: 'invalid-syntax' }),
    );
    expect(validateCustomThemeCss('body { color: red; ) }')).toEqual(
      expect.objectContaining({ ok: false, reason: 'invalid-syntax' }),
    );
    expect(validateCustomThemeCss('body { width: calc(1px; }')).toEqual(
      expect.objectContaining({ ok: false, reason: 'invalid-syntax' }),
    );
    expect(validateCustomThemeCss(`body { --theme: "${'x'.repeat(CUSTOM_THEME_MAX_BYTES)}"; }`)).toEqual(
      expect.objectContaining({ ok: false, reason: 'too-large' }),
    );
  });

  it('extracts safe CSS color tokens for Ant Design without accepting arbitrary values', () => {
    const tokens = extractCustomThemeAntTokens(`
      body[data-custom-theme] {
        --gn-accent: #8b5cf6;
        --gn-on-accent: #111827;
        --gn-accent-2: #7c3aed;
        --gn-accent-soft: rgba(139, 92, 246, 0.18);
        --gn-bg-panel: #1d202b;
        --gn-bg-panel-2: #232733;
        --gn-bg-hover: rgba(255, 255, 255, 0.06);
        --gn-fg-1: #f5f3ff;
        --gn-fg-3: #c4b5fd;
        --gn-br-2: rgba(196, 181, 253, 0.18);
        --gn-info: #38bdf8;
        --gn-on-info: #08131a;
        --gn-on-danger: #ffffff;
        --gn-ant-primary-hover: hsl(258, 90%, 72%);
        --gn-ant-primary-active: var(--not-supported-by-ant-parser);
      }
    `);
    expect(tokens.primary).toBe('#8b5cf6');
    expect(tokens.primaryContrast).toBe('#111827');
    expect(tokens.primaryHover).toBe('hsl(258, 90%, 72%)');
    expect(tokens.primaryActive).toBe('#7c3aed');
    expect(tokens.primaryBg).toBe('rgba(139, 92, 246, 0.18)');
    expect(tokens).toEqual(expect.objectContaining({
      bgContainer: '#1d202b',
      bgElevated: '#1d202b',
      fillAlter: '#232733',
      rowHoverBg: 'rgba(255, 255, 255, 0.06)',
      textPrimary: '#f5f3ff',
      textSecondary: '#c4b5fd',
      border: 'rgba(196, 181, 253, 0.18)',
      info: '#38bdf8',
      infoContrast: '#08131a',
      dangerContrast: '#ffffff',
    }));

    const invalidTokens = extractCustomThemeAntTokens(`
      body[data-custom-theme] {
        --gn-accent: #12345;
        --gn-ant-primary: rgba(not-a-color);
      }
    `);
    expect(invalidTokens.primary).toBeUndefined();
  });

  it('reads Ant tokens from the browser-computed cascade', () => {
    const values: Record<string, string> = {
      '--gn-accent': '#0f766e',
      '--gn-ant-primary': '#7c3aed',
      '--gn-ant-primary-hover': 'rgba(124, 58, 237, 0.8)',
      '--gn-ant-primary-active': 'rgba(not-a-color)',
    };
    const tokens = extractComputedCustomThemeAntTokens({
      getPropertyValue: (property: string) => values[property] || '',
    });
    expect(tokens.primary).toBe('#7c3aed');
    expect(tokens.primaryHover).toBe('rgba(124, 58, 237, 0.8)');
    expect(tokens.primaryActive).toBe('#0f766e');
  });

  it('sanitizes malformed and duplicate persisted theme entries', () => {
    const base = {
      schemaVersion: 1,
      id: 'theme-one',
      name: 'One',
      sourceFileName: 'one.css',
      baseMode: 'dark',
      css: 'body { color: #fff; }',
      createdAt: 1,
      updatedAt: 1,
    };
    const themes = sanitizeCustomThemeList([
      base,
      { ...base, name: 'Duplicate' },
      { ...base, id: '../unsafe' },
      { ...base, id: 'theme-future', schemaVersion: 2 },
      { ...base, id: 'theme-network', css: 'body { background: url(https://example.com); }' },
    ]);
    expect(themes).toHaveLength(1);
    expect(themes[0].id).toBe('theme-one');
  });
});
