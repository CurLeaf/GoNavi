import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new globalThis.URL('./CustomThemeManager.tsx', import.meta.url)),
  'utf8',
);
const styles = readFileSync(
  fileURLToPath(new globalThis.URL('./CustomThemeManager.css', import.meta.url)),
  'utf8',
);

describe('CustomThemeManager', () => {
  it('supports the complete import and management workflow', () => {
    expect(source).toContain('accept=".css,text/css"');
    expect(source).toContain("requestFile({ kind: 'import' })");
    expect(source).toContain("requestFile({ kind: 'replace', themeId: theme.id })");
    expect(source).toContain('selectCustomTheme(theme.id)');
    expect(source).toContain('selectCustomTheme(null)');
    expect(source).toContain('updateCustomTheme(theme.id, { baseMode })');
    expect(source).toContain('removeCustomTheme(theme.id)');
    expect(source).toContain('CUSTOM_THEME_TEMPLATE');
  });

  it('provides accessible selection, destructive confirmation, and responsive layout', () => {
    expect(source).toContain('<fieldset className="gonavi-custom-theme-library">');
    expect(source).toContain('<legend className="gonavi-custom-theme-sr-only">');
    expect(source).toContain('BUILTIN_CUSTOM_THEME_PRESETS.map((preset) =>');
    expect(source).toContain('type="radio"');
    expect(source).toContain('name="gonavi-custom-theme-selection"');
    expect(source).toContain('checked={active}');
    expect(source).toContain('onChange={() => handleSelect(theme)}');
    expect(source).toContain('onChange={() => handleSelect(preset, displayName)}');
    expect(source).toContain('const builtinThemeTitleId = useId();');
    expect(source).toContain('aria-describedby={`${descriptionId} ${modeId}`}');
    expect(source).toContain('<Popconfirm');
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain('event.stopPropagation()');
    expect(styles).toContain('.gonavi-custom-theme-select:focus-within');
    expect(styles).toContain('grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
