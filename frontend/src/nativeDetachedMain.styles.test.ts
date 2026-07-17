import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const detachedEntrySource = readFileSync(
  fileURLToPath(new globalThis.URL('./nativeDetachedMain.tsx', import.meta.url)),
  'utf8',
);

describe('native detached window styles', () => {
  it('loads the app and workbench styles from the detached entry', () => {
    expect(detachedEntrySource).toContain("import './App.css';");
    expect(detachedEntrySource).toContain("import './v2-theme.css';");
    expect(detachedEntrySource).toContain("import './styles/v2-theme-workbench.css';");
  });
});
