import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const v2ThemeCss = readFileSync(path.resolve(__dirname, './v2-theme.css'), 'utf8');

describe('v2 modal confirm theme', () => {
  it('keeps static confirm title and content readable in dark theme', () => {
    expect(v2ThemeCss).toMatch(/body\[data-ui-version="v2"\]\s+\.ant-modal-confirm\s+\.ant-modal-confirm-title\s*\{[^}]*color:\s*var\(--gn-fg-1\)\s*!important;/s);
    expect(v2ThemeCss).toMatch(/body\[data-ui-version="v2"\]\s+\.ant-modal-confirm\s+\.ant-modal-confirm-content\s*\{[^}]*color:\s*var\(--gn-fg-2\)\s*!important;/s);
  });
});
