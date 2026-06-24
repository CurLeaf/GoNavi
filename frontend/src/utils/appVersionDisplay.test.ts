import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { resolveAboutDisplayVersion } from './appVersionDisplay';

const source = readFileSync(new URL('./appVersionDisplay.ts', import.meta.url), 'utf8');

describe('resolveAboutDisplayVersion', () => {
  it('shows fixed dev version for development build', () => {
    expect(resolveAboutDisplayVersion('development', '0.6.5')).toBe('0.0.1-dev');
  });

  it('shows fixed dev version for wails dev build type', () => {
    expect(resolveAboutDisplayVersion('dev', '0.6.5')).toBe('0.0.1-dev');
  });

  it('keeps real version for non-development builds', () => {
    expect(resolveAboutDisplayVersion('production', '0.6.5')).toBe('0.6.5');
  });

  it('falls back to unknown when version is empty outside development', () => {
    expect(resolveAboutDisplayVersion('production', '', 'T:unknown')).toBe('T:unknown');
  });

  it('does not keep the old Chinese unknown fallback in production source', () => {
    expect(source).not.toContain("'未知'");
  });
});
