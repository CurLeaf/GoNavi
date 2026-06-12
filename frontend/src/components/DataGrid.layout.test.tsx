import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DataGrid, {
  buildGridFieldSelectOptions,
  formatCellDisplayText,
  resolveContextMenuFieldName,
  resolveDefaultGridFilterOperator,
  resolveNextGridFilterOperatorForColumnChange,
} from './DataGrid';
import DataGridPaginationBar from './DataGridPaginationBar';
import { cloneShortcutOptions, DEFAULT_SHORTCUT_OPTIONS } from '../utils/shortcuts';

vi.mock('../store', () => ({
  useStore: (selector: (state: any) => any) => selector({
    connections: [],
    addSqlLog: vi.fn(),
    theme: 'light',
    appearance: {
      enabled: true,
      opacity: 1,
      blur: 0,
      showDataTableVerticalBorders: false,
      dataTableDensity: 'comfortable',
      uiVersion: 'v2',
    },
    queryOptions: {
      showColumnComment: false,
      showColumnType: false,
    },
    setQueryOptions: vi.fn(),
    dataEditTransactionOptions: {
      commitMode: 'manual',
      autoCommitDelayMs: 5000,
    },
    setDataEditTransactionOptions: vi.fn(),
    addTab: vi.fn(),
    setActiveContext: vi.fn(),
    tableColumnOrders: {},
    enableColumnOrderMemory: false,
    setTableColumnOrder: vi.fn(),
    setEnableColumnOrderMemory: vi.fn(),
    clearTableColumnOrder: vi.fn(),
    tableHiddenColumns: {},
    enableHiddenColumnMemory: false,
    setTableHiddenColumns: vi.fn(),
    setEnableHiddenColumnMemory: vi.fn(),
    clearTableHiddenColumns: vi.fn(),
    shortcutOptions: cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
    aiPanelVisible: false,
    setAIPanelVisible: vi.fn(),
  }),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  ImportData: vi.fn(),
  ExportTable: vi.fn(),
  ExportData: vi.fn(),
  ExportQuery: vi.fn(),
  ApplyChanges: vi.fn(),
  DBGetColumns: vi.fn(),
  DBGetIndexes: vi.fn(),
  DBGetForeignKeys: vi.fn(),
  DBShowCreateTable: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
}));

describe('DataGrid layout', () => {
  it('renders a secondary action strip for view switching and auxiliary actions', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        dbName="main"
        connectionId="conn-1"
        readOnly
        pagination={{
          current: 1,
          pageSize: 100,
          total: 1,
        }}
        onPageChange={() => {}}
      />,
    );

    expect(markup).toContain('data-grid-secondary-actions="true"');
    expect(markup).toContain('data-grid-view-switcher="true"');
    expect(markup).toContain('data-grid-column-display-action="true"');
    expect(markup).toContain('data-grid-column-quick-find-action="true"');
    expect(markup).toContain('字段显示');
    expect(markup).toContain('跳列');
    expect(markup).toContain('对象设计');
    expect(markup).toContain('data-grid-page-find="true"');
    expect(markup).toContain('data-grid-page-find-prev="true"');
    expect(markup).toContain('data-grid-page-find-next="true"');
    expect(markup).toContain('gn-v2-data-grid-status-main');
    expect(markup).toContain('gn-v2-data-grid-status-right');
    expect(markup).toContain('data-grid-v2-pagination="true"');
    expect(markup).toContain('data-grid-v2-page-chip="true"');
    expect(markup).toContain('data-grid-v2-pagination-prev="true"');
    expect(markup).toContain('data-grid-v2-pagination-next="true"');
    expect(markup).toContain('data-grid-pagination-jump="true"');
    expect(markup).toContain('跳页');
    expect(markup).toContain('跳转页码');
    expect(markup).not.toContain('class="ant-pagination');
    expect(markup).not.toContain('class="data-grid-pagination-kicker"');
    expect(markup).toContain('当前页查找...');
  });

  it('keeps the v2 footer fields action labeled as field info for views', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="user_view"
        objectType="view"
        readOnly
        pagination={{
          current: 1,
          pageSize: 100,
          total: 1,
        }}
        onPageChange={() => {}}
      />,
    );

    expect(markup).toContain('字段信息');
    expect(markup).not.toContain('对象设计');
  });

  it('hides current-page find in JSON and text record views', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    expect(source).toContain("const visiblePageFindContent = viewMode === 'table' ? pageFindContent : null;");
    expect(source).toContain('pageFindContent={visiblePageFindContent}');
  });

  it('keeps legacy secondary actions aligned on a shared search-row baseline', () => {
    const source = readFileSync(new URL('./DataGridSecondaryActions.tsx', import.meta.url), 'utf8');
    const columnQuickFindSource = readFileSync(new URL('./DataGridColumnQuickFind.tsx', import.meta.url), 'utf8');
    const pageFindSource = readFileSync(new URL('./DataGridPageFind.tsx', import.meta.url), 'utf8');
    const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');
    const paginationSource = readFileSync(new URL('./DataGridPaginationBar.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-grid-legacy-secondary-actions="true"');
    expect(source).toContain('data-grid-legacy-secondary-row="primary"');
    expect(source).toContain('data-grid-legacy-secondary-row="search"');
    expect(source).toContain('data-grid-legacy-result-view-switcher="true"');
    expect(source).toContain('data-grid-legacy-column-quick-find="true"');
    expect(source).toContain('data-grid-legacy-page-find="true"');
    expect(source).toContain('data-grid-legacy-pagination="true"');
    expect(source).toContain("justifyContent: 'flex-start'");
    expect(source).toContain('minHeight: 32');
    expect(source).toContain("style={{ display: 'flex', minWidth: 0, marginLeft: 'auto' }}");
    expect(source).toContain("flex: '0 1 240px'");
    expect(source).toContain("flex: '0 1 auto'");
    expect(columnQuickFindSource).not.toContain('定位字段列');
    expect(columnQuickFindSource).toContain("flexWrap: 'nowrap'");
    expect(columnQuickFindSource).toContain("width: 168");
    expect(columnQuickFindSource).toContain('height: 32');
    expect(columnQuickFindSource).toContain('const legacyDropdownOpen =');
    expect(columnQuickFindSource).toContain('open={isV2Ui ? undefined : legacyDropdownOpen}');
    expect(columnQuickFindSource).toContain('onSubmit: (value?: string) => void;');
    expect(columnQuickFindSource).toContain('onSubmit(nextValue);');
    expect(columnQuickFindSource).toContain('onPressEnter={() => onSubmit(value)}');
    expect(columnQuickFindSource).not.toContain('data-grid-column-quick-find-submit=');
    expect(columnQuickFindSource).not.toContain(" '跳转'");
    expect(pageFindSource).toContain("gap: 8");
    expect(pageFindSource).toContain("flexWrap: 'nowrap'");
    expect(pageFindSource).toContain('height: 32');
    expect(pageFindSource).not.toContain("flexDirection: 'column'");
    expect(pageFindSource).not.toContain(" '上一个'");
    expect(pageFindSource).not.toContain(" '下一个'");
    expect(pageFindSource).toContain("paddingInline: 8");
    expect(pageFindSource).toContain("whiteSpace: 'nowrap'");
    expect(pageFindSource).toContain("onCancel: () => void;");
    expect(pageFindSource).toContain("if (event.key === 'Escape')");
    expect(pageFindSource).toContain('onCancel();');
    expect(pageFindSource).toContain("textAlign: 'left'");
    expect(dataGridSource).toContain("const normalizedPageFindText = useMemo(() => normalizeDataGridFindQuery(pageFindText), [pageFindText]);");
    expect(dataGridSource).not.toContain("const normalizedPageFindText = useMemo(() => normalizeDataGridFindQuery(deferredPageFindText), [deferredPageFindText]);");
    expect(dataGridSource).toContain("if (event.key === 'Escape')");
    expect(dataGridSource).toContain('if (activeSelection.size === 0) {');
    expect(dataGridSource).toContain('closeCellEditMode();');
    expect(dataGridSource).toContain('resetCellSelection();');
    expect(dataGridSource).toContain("tagName === 'input' || tagName === 'textarea' || activeElement?.isContentEditable");
    expect(paginationSource).toContain("padding: 0");
    expect(paginationSource).toContain("justifyContent: 'flex-start'");
  });

  it('avoids duplicating legacy pagination page text beside the pager', () => {
    const markup = renderToStaticMarkup(
      <DataGridPaginationBar
        isV2Ui={false}
        pagination={{
          current: 1,
          pageSize: 100,
          total: 24,
        }}
        paginationV2SummaryText="24 行"
        paginationSummaryText="当前 24 条 / 共 24 条"
        paginationControlTotal={24}
        paginationTotalPages={1}
        paginationPageSizeOptions={['100', '200']}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        onV2PageStep={() => {}}
      />,
    );

    expect(markup).toContain('class="ant-pagination');
    expect(markup).not.toContain('第 1 / 1 页');
  });

  it('renders the v2 DataGrid toolbar using the redesigned topbar hooks', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        dbName="main"
        connectionId="conn-1"
        editLocator={{
          strategy: 'primary-key',
          columns: ['id'],
          valueColumns: ['id'],
          readOnly: false,
        }}
        onReload={() => {}}
        showFilter
        onToggleFilter={() => {}}
        pagination={{
          current: 1,
          pageSize: 100,
          total: 1,
        }}
        onPageChange={() => {}}
      />,
    );

    expect(markup).toContain('gn-v2-data-grid');
    expect(markup).toContain('gn-v2-data-grid-toolbar-frame');
    expect(markup).toContain('gn-v2-data-grid-toolbar-title');
    expect(markup).toContain('gn-v2-toolbar-divider');
    expect(markup).toContain('gn-v2-commit-button');
    expect(markup).toContain('gn-v2-ai-insight-button');
    expect(markup).toContain('gn-v2-smart-filter-panel');
    expect(markup).toContain('gn-v2-data-grid-table-shell');
    expect(markup).toContain('gn-v2-data-grid-table-wrap');
    expect(markup).toContain('· main');
    expect(markup).toContain('提交事务');
    expect(markup).toContain('手动提交');
    expect(markup).toContain('AI 洞察');
  });

  it('preserves fractional seconds when rendering datetime values', () => {
    expect(formatCellDisplayText('2026-05-10T09:12:33.456+08:00')).toBe('2026-05-10 09:12:33.456');
  });

  it('renders bit column hex values as decimal flags', () => {
    expect(formatCellDisplayText('0x00', 'bit(1)')).toBe('0');
    expect(formatCellDisplayText('0x01', 'bit(1)')).toBe('1');
    expect(formatCellDisplayText('0x02', 'bit varying(8)')).toBe('2');
    expect(formatCellDisplayText('0x01', 'bytea')).toBe('0x01');
  });

  it('resolves the field name copied from the cell context menu', () => {
    expect(resolveContextMenuFieldName('created_at', '创建时间')).toBe('created_at');
    expect(resolveContextMenuFieldName('', 'fallback_name')).toBe('fallback_name');
  });

  it('uses contains as the default filter operator for string-like columns', () => {
    expect(resolveDefaultGridFilterOperator('varchar(255)')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('character varying(64)')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('nvarchar(max)')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('Nullable(LowCardinality(String))')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('text')).toBe('CONTAINS');

    expect(resolveDefaultGridFilterOperator('int')).toBe('=');
    expect(resolveDefaultGridFilterOperator('decimal(10,2)')).toBe('=');
    expect(resolveDefaultGridFilterOperator('datetime')).toBe('=');
  });

  it('updates only untouched default filter operators when the column changes', () => {
    expect(resolveNextGridFilterOperatorForColumnChange({
      currentOperator: '=',
      previousColumnType: 'int',
      nextColumnType: 'varchar(64)',
    })).toBe('CONTAINS');

    expect(resolveNextGridFilterOperatorForColumnChange({
      currentOperator: 'CONTAINS',
      previousColumnType: 'varchar(64)',
      nextColumnType: 'bigint',
    })).toBe('=');

    expect(resolveNextGridFilterOperatorForColumnChange({
      currentOperator: 'STARTS_WITH',
      previousColumnType: 'varchar(64)',
      nextColumnType: 'bigint',
    })).toBe('STARTS_WITH');
  });

  it('keeps full field names in filter field select options', () => {
    const [option] = buildGridFieldSelectOptions(['mes_manufacture_order_really_long_column_name']);

    expect(option).toEqual({
      value: 'mes_manufacture_order_really_long_column_name',
      label: 'mes_manufacture_order_really_long_column_name',
      title: 'mes_manufacture_order_really_long_column_name',
    });
  });

  it('renders a DDL action for table data pages only', () => {
    const tableMarkup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        dbName="main"
        connectionId="conn-1"
      />,
    );

    expect(tableMarkup).toContain('data-grid-ddl-action="true"');
    expect(tableMarkup).toContain('查看 DDL');
    expect(tableMarkup).toContain('对象设计');
    expect(tableMarkup).not.toContain('data-grid-locate-sidebar-action="true"');

    const schemaTableMarkup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="public.users"
        dbName=""
        connectionId="conn-1"
      />,
    );

    expect(schemaTableMarkup).toContain('data-grid-ddl-action="true"');
    expect(schemaTableMarkup).toContain('查看 DDL');
    expect(schemaTableMarkup).toContain('对象设计');
    expect(schemaTableMarkup).toContain('data-grid-page-find="true"');

    const queryMarkup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        dbName="main"
        connectionId="conn-1"
        exportScope="queryResult"
      />,
    );

    expect(queryMarkup).not.toContain('data-grid-ddl-action="true"');
    expect(queryMarkup).toContain('字段信息');
    expect(queryMarkup).not.toContain('对象设计');
  });

  it('keeps row copy and paste as context menu actions instead of toolbar buttons', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        pkColumns={['id']}
      />,
    );

    expect(markup).not.toContain('data-grid-copy-row-action="true"');
    expect(markup).not.toContain('data-grid-paste-row-action="true"');
  });

  it('renders a clickable copy action for aggregate query results', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            'COUNT(*)': 12,
          },
        ]}
        columnNames={['COUNT(*)']}
        loading={false}
        exportScope="queryResult"
      />,
    );

    expect(markup).toContain('data-grid-query-copy-action="true"');
    expect(markup).not.toMatch(/data-grid-query-copy-action="true"[^>]*disabled/);
    expect(markup).toContain('复制');
    expect(markup.match(/data-grid-query-copy-action="true"/g)?.length).toBe(1);
  });

  it('keeps query-result export scopes explicit and repositions v2 context menus after measuring', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    expect(source).toContain("type QueryResultExportScope = 'selected' | 'page' | 'all';");
    expect(source).toContain("title: '导出查询结果'");
    expect(source).toContain('data-query-result-export-scope="true"');
    expect(source).toContain('选中导出');
    expect(source).toContain('当前页导出');
    expect(source).toContain('全部导出');
    expect(source).toContain('const queryResultCurrentPageRows = useMemo(() => {');
    expect(source).toContain('const resolveContextMenuPosition = useCallback((x: number, y: number, estimatedWidth: number, estimatedHeight: number) => {');
    expect(source).toContain('const rect = element.getBoundingClientRect();');
    expect(source).toContain('ref={cellContextMenuPortalRef}');
  });

  it('keeps inline cell editors stretched to the full cell width', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    expect(source).toContain('const INLINE_EDIT_FORM_ITEM_STYLE: React.CSSProperties = { margin: 0, width: \'100%\', minWidth: 0 };');
    expect(source).toContain('className="data-grid-inline-editor-form-item"');
    expect(source).toContain('className="data-grid-inline-editor-input"');
    expect(source).toContain('style={{ width: \'100%\', ...inputCellPadding }}');
    expect(source).toContain('.${gridId} .data-grid-inline-editor-form-item .ant-form-item-control-input-content');
    expect(source).toContain('.${gridId} .data-grid-inline-editor-input');
  });

  it('disables browser autocapitalization for inline cell editors', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    const editorInputCount = source.match(/\{\.\.\.noAutoCapInputProps\}[\s\S]{0,180}className="data-grid-inline-editor-input"/g)?.length || 0;

    expect(source).toContain("import { applyNoAutoCapAttributesWithin, noAutoCapInputProps } from '../utils/inputAutoCap';");
    expect(editorInputCount).toBe(2);
  });

  it('renders a quick WHERE condition editor when table filters are visible', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        showFilter
        quickWhereCondition="name like 'a%'"
        onApplyQuickWhereCondition={() => {}}
      />,
    );

    expect(markup).toContain('data-grid-quick-where="true"');
    expect(markup).toContain('data-grid-quick-where-input="true"');
    expect(markup).toContain('WHERE');
    expect(markup).toContain('输入 WHERE 后面的条件');
  });

  it('keeps quick WHERE input clipboard editing isolated from grid shortcuts', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');
    const toolbarSource = readFileSync(new URL('./DataGridToolbarFrame.tsx', import.meta.url), 'utf8');
    const filterHookSource = readFileSync(new URL('./useDataGridFilters.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(filterHookSource).toContain('const handleQuickWherePaste = React.useCallback');
    expect(filterHookSource).toContain("event.clipboardData.getData('text/plain')");
    expect(filterHookSource).toContain('const currentValue = input.value ?? quickWhereDraft;');
    expect(filterHookSource).toContain('event.stopPropagation();');
    expect(toolbarSource).toContain('data-grid-quick-where-input="true"');
    expect(toolbarSource).toContain('{...noAutoCapInputProps}');
    expect(toolbarSource).toContain('onCopy={onQuickWhereCopy}');
    expect(toolbarSource).toContain('onCut={onQuickWhereCut}');
    expect(toolbarSource).toContain('onPaste={onQuickWherePaste}');
    expect(source).toContain("['c', 'v', 'x'].includes");
    expect(css).toContain('[data-grid-quick-where-input="true"]');
    expect(css).toContain('font-size: var(--gn-font-size, 14px) !important;');
    expect(css).toContain('user-select: text !important;');
  });

  it('keeps DataGrid scroll synchronization throttled to animation frames', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');
    const secondaryActionsSource = readFileSync(new URL('./DataGridSecondaryActions.tsx', import.meta.url), 'utf8');
    const columnTitleSource = readFileSync(new URL('./DataGridColumnTitle.tsx', import.meta.url), 'utf8');
    const columnQuickFindSource = readFileSync(new URL('./DataGridColumnQuickFind.tsx', import.meta.url), 'utf8');
    const paginationBarSource = readFileSync(new URL('./DataGridPaginationBar.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(source).toContain('virtualHorizontalElementsRef');
    expect(source).toContain('const handleSubmitColumnQuickFind = useCallback((submittedValue?: string) => {');
    expect(source).toContain('const effectiveQuery = String(submittedValue ?? columnQuickFindText);');
    expect(source).toContain('resolveDataGridColumnQuickFindTarget(displayColumnNames, query)');
    expect(source).toContain("onCancel={() => setPageFindText('')}");
    expect(source).toContain('enumerable: true');
    expect(source).toContain('resolveDataGridColumnQuickFindScrollLeft({');
    expect(source).toContain('const applied = applyVirtualHorizontalOffset(tableContainer, nextScrollLeft);');
    expect(source).toContain('syncExternalScrollFromTargets();');
    expect(source).toContain("const columnQuickFindContent = isTableSurfaceActive ? (");
    expect(secondaryActionsSource).toContain('data-grid-column-quick-find-action="true"');
    expect(source).toContain('type VirtualTableScrollReference = TableReference & {');
    expect(source).toContain('const tableRef = useRef<VirtualTableScrollReference | null>(null);');
    expect(source).toContain('resolveDataGridHorizontalWheelDelta({');
    expect(source).toContain('const virtualHorizontalAlignmentRafRef = useRef<number | null>(null);');
    expect(source).toContain('const scheduleVirtualHorizontalWheel = useCallback');
    expect(source).toContain('pendingTableHorizontalDeltaRef.current += delta;');
    expect(source).toContain('tableHorizontalWheelRafRef.current = requestAnimationFrame');
    expect(source).toContain('const scheduleVirtualHorizontalAlignment = useCallback((preferredLeft?: number) => {');
    expect(source).toContain('virtualHorizontalElementsRef.current = { tableContainer: null, holderEl: null, innerEl: null, headerEl: null };');
    expect(source).toContain('applyVirtualHorizontalOffset(tableContainer, nextLeft, { forceInternalScroll: true });');
    expect(source).toContain('}, [horizontalScrollVisible, scheduleVirtualHorizontalAlignment, tableRenderData, tableScrollX, virtualEditingCell]);');
    expect(source).toContain('tableInstance.scrollTo({ left: clampedOffset, top: holderEl.scrollTop });');
    expect(source).toContain('applyVirtualHorizontalOffset(tableContainer, latestExternalScroll.scrollLeft, { forceInternalScroll: true });');
    expect(source).toContain('if (externalSyncRafRef.current !== null)');
    expect(source).toContain('externalSyncRafRef.current = requestAnimationFrame');
    expect(source).toContain('const scheduleSyncExternalScrollFromTargets = useCallback');
    expect(source).toContain('tableTargetSyncRafRef.current = requestAnimationFrame');
    expect(source).toContain("boundHorizontalTargets = externalScroll ? [] : pickHorizontalScrollTargets(tableContainer);");
    expect(source).toContain('const useInlineEditableBodyCell = enableInlineEditableCell && !enableVirtual;');
    expect(source).toContain('if (useInlineEditableBodyCell) {');
    expect(source).toContain('}, areEditableCellPropsEqual);');
    expect(source).toContain('const [virtualEditingCell, setVirtualEditingCell] = useState<VirtualEditingCellState | null>(null);');
    expect(source).toContain('const openVirtualInlineEditor = useCallback((record: Item, dataIndex: string, title: React.ReactNode) => {');
    expect(source).toContain('if (isVirtualInlineEditingCell && virtualEditable) {');
    expect(source).toContain('const DATA_GRID_VIRTUAL_EDIT_RENDER_VERSION = Symbol(\'DATA_GRID_VIRTUAL_EDIT_RENDER_VERSION\');');
    expect(source).toContain('const attachDataGridVirtualEditRenderVersion = <T extends Item>(');
    expect(source).toContain('hasDataGridVirtualEditRenderVersionChanged(record, prevRecord)');
    expect(source).not.toContain('if (enableVirtual && enableInlineEditableCell) {\n                  return (\n                      <EditableCell');
    expect(source).toContain("content-visibility: ${useVirtualHolderPaintHints ? 'auto' : 'visible'};");
    expect(source).toContain("content-visibility: ${useVirtualEditableVisibilityHints ? 'auto' : 'visible'};");
    expect(source).toContain("contain-intrinsic-size: ${useVirtualEditableVisibilityHints ? '24px 160px' : 'auto'};");
    expect(source).toContain("const useVirtualHolderPaintHints = !isMacLike && !isV2Ui;");
    expect(source).toContain("const useVirtualCellContentContain = false;");
    expect(source).toContain("const useVirtualEditableVisibilityHints = !isMacLike && !isV2Ui;");
    expect(source).toContain("contain: ${useVirtualRowCellContain ? 'layout paint style' : 'none'};");
    expect(source).toContain('const handleSharedCellContextMenu = useCallback');
    expect(source).toContain('const shouldUsePlainVirtualContent = isV2Ui && !modifiedStyle;');
    expect(source).toContain('if (shouldUsePlainVirtualContent) {');
    expect(source).toContain('return originalRenderContent;');
    expect(source).toContain('if (scrollSnapshotRafRef.current !== null) return;');
    expect(source).toContain('scrollSnapshotRafRef.current = requestAnimationFrame');
    expect(source).toContain('didRestoreScrollRef.current = false;');
    expect(source).toContain('useEffect(() => {');
    expect(source).toContain('}, [connectionId, dbName, tableName, data]);');
    expect(source).toContain('const applied = applyVirtualHorizontalOffset(tableContainer, nextLeft);');
    expect(source).toContain('resolvedLeft = readVirtualHorizontalOffset(tableContainer);');
    expect(source).toContain('lastReportedScrollRef.current = { top: nextTop, left: resolvedLeft };');
    expect(source).toContain("const dataGridBackdropFilter = isV2Ui || isMacLike ? 'none' : (opacity < 0.999 ? 'blur(14px)' : 'none');");
    expect(source).toContain('rowHoverable={!enableVirtual}');
    expect(columnTitleSource).toContain("data-grid-column-highlighted={highlighted ? 'true' : undefined}");
    expect(columnTitleSource).toContain('data-column-name={normalizedName}');
    expect(columnQuickFindSource).toContain('AutoComplete');
    expect(columnQuickFindSource).toContain('placeholder="跳到字段列..."');
    expect(secondaryActionsSource.indexOf('{pageFindContent}')).toBeLessThan(secondaryActionsSource.indexOf('gn-v2-data-grid-status-center'));
    expect(css).toContain('width: 66px !important;');
    expect(css).toContain('grid-template-columns: 160px 26px 26px !important;');
    expect(css).toContain('container-name: gn-v2-data-grid-statusbar;');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-data-grid-statusbar::-webkit-scrollbar');
    expect(css).toContain('scrollbar-width: thin;');
    expect(css).toContain('min-width: max-content;');
    expect(css).toContain('flex: 0 0 auto;');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-data-grid-status-center {');
    expect(css).not.toContain('.gn-v2-data-grid-status-center > span:last-child {\n    display: none;');
    expect(css).not.toContain('.gn-v2-data-grid-status-center > span:nth-child(2) {\n    display: none;');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-data-grid-pagination-wrap::-webkit-scrollbar');
    expect(css).toContain('@container gn-v2-data-grid-statusbar (max-width: 960px)');
    expect(css).toContain('@container gn-v2-data-grid-statusbar (max-width: 760px)');
    expect(css).toContain('.data-grid-pagination-size-select.ant-select-focused .ant-select-selector');
    expect(css).toContain('overflow-x: auto;');
    expect(paginationBarSource).toContain("label: `${value}/页`");
    expect(paginationBarSource).toContain('const maxJumpPage = Math.max(1, paginationTotalPages);');
    expect(paginationBarSource).toContain('Math.min(maxJumpPage, Math.max(1, Math.trunc(Number(jumpPage))))');
    expect(paginationBarSource).toContain('onPressEnter={submitJumpPage}');
    expect(paginationBarSource).toContain('data-grid-pagination-jump="true"');
    expect(css).toContain('.data-grid-pagination-jump-input.ant-input-number-focused');
    expect(css).toContain('background: transparent !important;');
  });

  it('keeps the DataGrid performance harness aligned with legacy and v2 comparison controls', () => {
    const harnessSource = readFileSync(new URL('../dev/PerfDataGridHarness.tsx', import.meta.url), 'utf8');
    expect(harnessSource).toContain("options={[");
    expect(harnessSource).toContain("{ label: '旧版 UI', value: 'legacy' }");
    expect(harnessSource).toContain("{ label: '新版 UI', value: 'v2' }");
    expect(harnessSource).toContain("{ value: 'comfortable', label: '标准' }");
    expect(harnessSource).toContain("{ value: 'standard', label: '紧凑' }");
    expect(harnessSource).toContain("{ value: 'compact', label: '极紧凑' }");
    expect(harnessSource).toContain("document.body.setAttribute('data-ui-version', uiVersion);");
    expect(harnessSource).toContain("if (value === null || value === undefined || value === '') {");
    expect(harnessSource).toContain("const currentState = useStore.getState();");
  });
});
