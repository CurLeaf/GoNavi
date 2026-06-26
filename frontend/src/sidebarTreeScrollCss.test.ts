import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appCss = readFileSync(path.resolve(__dirname, './App.css'), 'utf8');

describe('sidebar tree horizontal scroll css', () => {
  it('lets sidebar tree titles keep their full content width for horizontal scrolling', () => {
    expect(appCss).toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-list-holder,\s*\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-list-holder-inner\s*\{[^}]*min-width:\s*100%;/s);
    expect(appCss).not.toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-list-holder,\s*\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-list-holder-inner\s*\{[^}]*max-content/s);

    expect(appCss).toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-treenode\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*100%;/s);
    expect(appCss).not.toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-treenode\s*\{[^}]*width:\s*max-content/s);

    expect(appCss).toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-node-content-wrapper\s*\{[^}]*width:\s*max-content\s*!important;[^}]*min-width:\s*100%;/s);
    expect(appCss).not.toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-node-content-wrapper\s*\{[^}]*min-width:\s*0;/s);

    expect(appCss).toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-switcher\s*\{[^}]*width:\s*24px;[^}]*min-width:\s*24px;/s);
    expect(appCss).toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-iconEle\s*\{[^}]*width:\s*16px;[^}]*min-width:\s*16px;/s);

    expect(appCss).toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-title\s*\{[^}]*min-width:\s*max-content;[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;/s);
    expect(appCss).not.toMatch(/\.sidebar-tree-scroll-shell\s+\.ant-tree\s+\.ant-tree-title\s*\{[^}]*ellipsis/s);
  });
});
