import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

const controlTokens = [
  '--gn-control-radius: 6px',
  '--gn-control-height: 30px',
  '--gn-control-height-sm: 24px',
  '--gn-surface-radius: 8px',
  '--gn-chrome-height: 36px',
];

const ruleBlocks = (selectorNeedle: string): string[] => {
  const blocks: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    if (match[1]?.includes(selectorNeedle)) {
      blocks.push(match[2] ?? '');
    }
  }
  return blocks;
};

const pageCss = (relativePath: string): string =>
  fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const declaration = (source: string, selector: string, property: string): string => {
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (!selectors.includes(selector)) {
      continue;
    }
    const rule = (match[2] ?? '')
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${property}:`));
    if (rule) {
      return rule.slice(property.length + 1).trim();
    }
  }
  return '';
};

describe('audit explain and settings surfaces', () => {
  const sqlAudit = pageCss('../components/audit/SqlAuditWorkbench.css');
  const explain = pageCss('../components/explain/ExplainAnalysis.css');
  const slowQuery = pageCss('../components/explain/SlowQueryPanel.css');
  const diagnostics = pageCss('../components/requestDiagnostics/RequestDiagnosticsWorkbench.css');
  const security = pageCss('../components/SecurityUpdateSettingsModal.css');
  const connectionImport = pageCss('../components/settings/ConnectionImportSettingsPanel.css');
  const customTheme = pageCss('../components/settings/CustomThemeManager.css');
  const dataDirectory = pageCss('../components/settings/DataDirectorySettings.css');
  const settingsNav = pageCss('../components/settings/SettingsCenterTreeNav.css');
  const toolbarAppearance = pageCss('../components/settings/ToolbarButtonAppearanceSettings.css');

  it('reads panel and card radius from the surface token', () => {
    const surfaces: Array<[string, string]> = [
      [sqlAudit, '.gn-sql-audit-toolbar'],
      [sqlAudit, '.gn-sql-audit-summary-card'],
      [sqlAudit, '.gn-sql-audit-table-panel'],
      [sqlAudit, '.gn-sql-audit-detail-sql'],
      [explain, '.gn-explain-graph .react-flow__controls'],
      [explain, '.gn-explain-node'],
      [explain, '.gn-explain-card'],
      [explain, '.gn-explain-suggestion'],
      [slowQuery, '.gn-slow-query-card'],
      [slowQuery, '.gn-slow-query-full-sql'],
      [diagnostics, '.gn-request-diagnostics-table'],
      [diagnostics, '.gn-reproduction-bundle-panel'],
      [connectionImport, '.gn-connection-import-settings__panel'],
      [connectionImport, '.gn-connection-import-settings__protected'],
      [customTheme, '.gonavi-custom-theme-active'],
      [customTheme, '.gonavi-custom-theme-empty'],
      [dataDirectory, '.gn-storage-panel'],
      [dataDirectory, '.gn-storage-usage-card'],
      [toolbarAppearance, '.gn-toolbar-button-settings-preview'],
      [toolbarAppearance, '.gn-toolbar-button-settings-color'],
    ];
    for (const [source, selector] of surfaces) {
      expect(declaration(source, selector, 'border-radius')).toBe('var(--gn-surface-radius)');
    }
  });

  it('reads button and input radius and height from control tokens', () => {
    expect(declaration(
      security,
      '.security-update-settings-embedded .security-update-action-btn.ant-btn',
      'border-radius',
    )).toBe('var(--gn-control-radius)');
    expect(declaration(
      security,
      '.security-update-settings-embedded .security-update-action-btn.ant-btn',
      'height',
    )).toBe('var(--gn-control-height)');
    expect(declaration(dataDirectory, '.gn-storage-panel .ant-btn', 'border-radius')).toBe('var(--gn-control-radius)');
    expect(declaration(dataDirectory, '.gn-storage-path-editor .ant-input', 'border-radius')).toBe('var(--gn-control-radius)');
    expect(declaration(dataDirectory, '.gn-storage-path-editor .ant-input', 'min-height')).toBe('var(--gn-control-height)');
    expect(declaration(
      settingsNav,
      '.gonavi-settings-center-tree-search .ant-input-affix-wrapper',
      'border-radius',
    )).toBe('var(--gn-control-radius)');
  });

  it('keeps count pills and status dots circular', () => {
    expect(declaration(slowQuery, '.gn-slow-query-summary > span', 'border-radius')).toBe('999px');
    expect(declaration(sqlAudit, '.gn-sql-audit-timeline li::before', 'border-radius')).toBe('50%');
    expect(declaration(diagnostics, '.gn-request-diagnostics-timeline li::before', 'border-radius')).toBe('50%');
    expect(declaration(dataDirectory, '.gn-storage-usage-chart', 'border-radius')).toBe('50%');
    expect(declaration(dataDirectory, '.gn-storage-usage-legend__dot', 'border-radius')).toBe('50%');
    expect(declaration(dataDirectory, '.gn-storage-tag', 'border-radius')).toBe('999px');
  });

  it('leaves toolbar appearance color previews on their own radius', () => {
    expect(declaration(
      toolbarAppearance,
      '.gn-toolbar-button-settings-preview-button',
      'border-radius',
    )).toBe('7px');
    expect(declaration(
      toolbarAppearance,
      '.gn-toolbar-button-settings-picker-swatch',
      'border-radius',
    )).toBe('4px');
  });
});

const pageStylePaths = [
  '../components/DriverManagerWorkbench.css',
  '../components/DataImportWorkbench.css',
  '../components/data-sync/DataSyncWorkbench.css',
  '../components/data-sync/DataSyncScheduleTable.css',
  '../styles/message-queue-workbench.css',
  '../components/audit/SqlAuditWorkbench.css',
  '../components/explain/ExplainAnalysis.css',
  '../components/explain/SlowQueryPanel.css',
  '../components/requestDiagnostics/RequestDiagnosticsWorkbench.css',
  '../components/SecurityUpdateSettingsModal.css',
  '../components/settings/ConnectionImportSettingsPanel.css',
  '../components/settings/CustomThemeManager.css',
  '../components/settings/DataDirectorySettings.css',
  '../components/settings/SettingsCenterTreeNav.css',
  '../components/settings/ToolbarButtonAppearanceSettings.css',
];

const cssRules = (source: string): Array<{ selector: string; block: string }> => {
  const rules: Array<{ selector: string; block: string }> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    rules.push({ selector: match[1] ?? '', block: match[2] ?? '' });
  }
  return rules;
};

const blockValue = (block: string, property: string): string => {
  const rule = block
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${property}:`));
  return rule ? rule.slice(property.length + 1).trim() : '';
};

const isIconButtonRule = (selector: string, block: string): boolean => {
  if (/icon-only|icon-btn|btn-icon/.test(selector)) {
    return true;
  }
  const width = blockValue(block, 'width');
  const height = blockValue(block, 'height');
  const padding = blockValue(block, 'padding-inline') || blockValue(block, 'padding');
  return width !== '' && width === height && /^(0|0px)/.test(padding);
};

const isCircularStatusCapsule = (radius: string): boolean =>
  /^(999px|99px|50%)$/.test(radius.replace(/\s*!important\s*$/, '').trim());

const controlStylePaths = [
  '../v2-theme.css',
  '../styles/v2-theme-workbench.css',
  '../App.css',
  '../components/WorkbenchInspector.css',
  '../components/BatchConnectionTreeSelect.css',
  '../components/sidebar/SlowQueryRailButton.css',
  '../components/sidebar/SqlAuditRailButton.css',
  ...pageStylePaths,
];

describe('page button radius contract', () => {
  it('keeps pixel border-radius off ordinary ant buttons', () => {
    const violations: string[] = [];
    for (const relativePath of pageStylePaths) {
      const source = pageCss(relativePath);
      for (const { selector, block } of cssRules(source)) {
        if (!selector.includes('.ant-btn')) {
          continue;
        }
        const radius = blockValue(block, 'border-radius');
        if (!/\d+(\.\d+)?px/.test(radius)) {
          continue;
        }
        if (isIconButtonRule(selector, block) || isCircularStatusCapsule(radius)) {
          continue;
        }
        violations.push(`${relativePath}: ${selector.trim()} => ${radius}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('reads control height without a pixel fallback', () => {
    const violations: string[] = [];
    for (const relativePath of controlStylePaths) {
      const source = pageCss(relativePath);
      if (/--gn-control-height(?:-sm)?\s*,/.test(source)) {
        violations.push(relativePath);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('v2 control tokens', () => {
  it('defines control tokens on the v2 body', () => {
    const bodyRule = css.match(/body\[data-ui-version="v2"\]\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const token of controlTokens) {
      expect(bodyRule).toContain(token);
    }
  });

  it('keeps inset highlights out of primary button rules', () => {
    const blocks = ruleBlocks('.ant-btn-primary');
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).not.toContain('inset');
    }
  });
});
