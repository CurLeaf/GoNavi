import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./TableOverview.tsx', import.meta.url), 'utf8');

const cardSource = source.slice(
  source.indexOf('const renderCardTableContent = (table: TableStatRow) => ('),
  source.indexOf('const renderCardTable = (table: TableStatRow) => {'),
);

const listSource = source.slice(
  source.indexOf('const renderListTable = (table: TableStatRow) => {'),
  source.indexOf('if (loading) {'),
);

const visibleTableSectionsSource = source.slice(
  source.indexOf('const visibleTableSections = useMemo<OverviewTableSection[]>(() => {'),
  source.indexOf('const v2ContextMenuTable = useMemo('),
);
const normalizedVisibleTableSectionsSource = visibleTableSectionsSource.replace(/\s+/g, ' ').trim();

const renderOverviewSectionTitleSource = source.slice(
  source.indexOf('const renderOverviewSectionTitle = (section: OverviewTableSection) => {'),
  source.indexOf('const renderCardTableContent = (table: TableStatRow) => ('),
);
const normalizedRenderOverviewSectionTitleSource = renderOverviewSectionTitleSource.replace(/\s+/g, ' ').trim();

const toggleOverviewTablePinnedSource = source.slice(
  source.indexOf('const toggleOverviewTablePinned = useCallback((tableName: string, pinned?: boolean) => {'),
  source.indexOf('const handleRenameTable = useCallback((tableName: string) => {'),
);
const normalizedToggleOverviewTablePinnedSource = toggleOverviewTablePinnedSource.replace(/\s+/g, ' ').trim();

describe('TableOverview i18n', () => {
  it('localizes the selected card and list overview copy with existing table_overview keys', () => {
    expect(cardSource).not.toContain('title="行数"');
    expect(cardSource).not.toContain('title="数据大小"');
    expect(cardSource).not.toContain('title="引擎"');
    expect(cardSource).toContain("title={t('table_overview.sort.rows')}");
    expect(cardSource).toContain("title={t('table_overview.metric.data_size')}");
    expect(cardSource).toContain("title={t('table_overview.metric.engine')}");

    expect(listSource).not.toContain('`${table.engine} 表`');
    expect(listSource).not.toContain("'双击打开数据，右键查看更多操作'");
    expect(listSource).not.toContain("<div style={{ color: textMuted }}>行数</div>");
    expect(listSource).not.toContain("<div style={{ color: textMuted }}>数据大小</div>");
    expect(listSource).not.toContain("<div style={{ color: textMuted }}>索引大小</div>");
    expect(listSource).not.toContain("<div style={{ color: textMuted }}>相对大小</div>");
    expect(listSource).toContain("t('table_overview.row.engine_table', { engine: table.engine })");
    expect(listSource).toContain("t('table_overview.row.open_hint')");
    expect(listSource).toContain("t('table_overview.sort.rows')");
    expect(listSource).toContain("t('table_overview.metric.data_size')");
    expect(listSource).toContain("t('table_overview.metric.index_size')");
    expect(listSource).toContain("t('table_overview.metric.relative_size')");
  });

  it('localizes section titles for pinned and all groups with dedicated table_overview keys', () => {
    expect(visibleTableSectionsSource).not.toContain("title: '全部'");
    expect(visibleTableSectionsSource).not.toContain("title: '置顶'");
    expect(visibleTableSectionsSource).not.toContain("t('table_overview.section.all')");
    expect(visibleTableSectionsSource).not.toContain("t('table_overview.section.pinned')");
    expect(visibleTableSectionsSource).not.toContain('title:');
    expect(normalizedVisibleTableSectionsSource).toContain("return [{ key: 'all', kind: 'all', rows: visibleTables }];");
    expect(normalizedVisibleTableSectionsSource).toContain(
      "{ key: 'pinned', kind: 'pinned' as const, rows: pinnedRows }",
    );
    expect(normalizedVisibleTableSectionsSource).toContain(
      "{ key: 'all', kind: 'all' as const, rows: regularRows }",
    );

    expect(renderOverviewSectionTitleSource).not.toContain("title: '全部'");
    expect(renderOverviewSectionTitleSource).not.toContain("title: '置顶'");
    expect(renderOverviewSectionTitleSource).not.toContain('<span>{section.title}</span>');
    expect(renderOverviewSectionTitleSource).toContain("t('table_overview.section.all')");
    expect(renderOverviewSectionTitleSource).toContain("t('table_overview.section.pinned')");
    expect(normalizedRenderOverviewSectionTitleSource).toContain(
      "const sectionTitle = section.kind === 'pinned' ? t('table_overview.section.pinned') : t('table_overview.section.all');",
    );
  });

  it('localizes toggleOverviewTablePinned success toast without raw pinned copy', () => {
    expect(toggleOverviewTablePinnedSource).not.toContain("'已置顶表'");
    expect(toggleOverviewTablePinnedSource).not.toContain("'已取消置顶'");
    expect(normalizedToggleOverviewTablePinnedSource).toContain(
      "message.success(shouldPin ? t('table_overview.message.pinned') : t('table_overview.message.unpinned'));",
    );
  });
});
