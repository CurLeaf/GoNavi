import { readFileSync } from 'node:fs';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DataGrid, {
  attachDataGridVirtualEditRenderVersion,
  buildDataGridCommitChangeSet,
  GONAVI_ROW_KEY,
  hasDataGridVirtualEditRenderVersionChanged,
} from './DataGrid';
import { V2CellContextMenuView, V2ColumnHeaderContextMenuView, V2TableGroupContextMenuView } from './V2TableContextMenu';
import { setCurrentLanguage, t } from '../i18n';
import { DUCKDB_ROWID_LOCATOR_COLUMN, ORACLE_ROWID_LOCATOR_COLUMN } from '../utils/rowLocator';

const storeState = vi.hoisted(() => ({
  connections: [
    {
      id: 'conn-1',
      name: 'local',
      config: {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: 'main',
      },
    },
  ],
  addSqlLog: vi.fn(),
  theme: 'light',
  appearance: {
    enabled: true,
    opacity: 1,
    blur: 0,
    uiVersion: 'v2',
    showDataTableVerticalBorders: false,
    dataTableDensity: 'comfortable',
  },
  queryOptions: {
    showColumnComment: false,
    showColumnType: false,
  },
  setQueryOptions: vi.fn(),
  dataEditTransactionOptions: {
    commitMode: 'manual' as 'manual' | 'auto',
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
  aiPanelVisible: false,
  setAIPanelVisible: vi.fn(),
}));

const backendApp = vi.hoisted(() => ({
  ImportData: vi.fn(),
  ExportTable: vi.fn(),
  ExportData: vi.fn(),
  ExportQuery: vi.fn(),
  ApplyChanges: vi.fn(),
  DBGetColumns: vi.fn(),
  DBGetIndexes: vi.fn(),
  DBGetForeignKeys: vi.fn(),
  DBGetTriggers: vi.fn(),
  DBQuery: vi.fn(),
  DBShowCreateTable: vi.fn(),
}));

const testRenderState = vi.hoisted(() => ({
  latestColumns: [] as any[],
  latestTableProps: null as any,
}));

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  loading: vi.fn(() => vi.fn()),
}));

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof storeState) => any) => selector(storeState),
}));

vi.mock('../../wailsjs/go/app/App', () => backendApp);

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<any>('react-dom');
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  };
});

vi.mock('@monaco-editor/react', () => ({
  default: (props: { value?: string; language?: string; theme?: string; options?: Record<string, unknown> }) => (
    <div
      data-monaco-editor="true"
      data-language={props.language}
      data-theme={props.theme}
      data-read-only={String(Boolean(props.options?.readOnly))}
    >
      {props.value}
    </div>
  ),
}));

vi.mock('./ImportPreviewModal', () => ({
  default: () => null,
}));

vi.mock('./TableDesigner', () => ({
  default: ({ tab, embedded }: { tab: { tableName?: string; initialTab?: string }; embedded?: boolean }) => (
    <div data-table-designer={embedded ? 'embedded' : 'standalone'}>
      <span>SCHEMA DESIGNER</span>
      <span>{tab.tableName || 'unknown-table'}</span>
      <span>{tab.initialTab || 'columns'}</span>
    </div>
  ),
}));

vi.mock('@ant-design/icons', () => {
  const Icon = () => <span />;

  return {
    ReloadOutlined: Icon,
    ImportOutlined: Icon,
    ExportOutlined: Icon,
    DownOutlined: Icon,
    PlusOutlined: Icon,
    DeleteOutlined: Icon,
    SaveOutlined: Icon,
    UndoOutlined: Icon,
    FilterOutlined: Icon,
    CloseOutlined: Icon,
    ConsoleSqlOutlined: Icon,
    FileTextOutlined: Icon,
    CopyOutlined: Icon,
    ClearOutlined: Icon,
    EditOutlined: Icon,
    VerticalAlignBottomOutlined: Icon,
    ColumnWidthOutlined: Icon,
    EyeInvisibleOutlined: Icon,
    LeftOutlined: Icon,
    RightOutlined: Icon,
    RobotOutlined: Icon,
    SearchOutlined: Icon,
    LinkOutlined: Icon,
    AimOutlined: Icon,
    TableOutlined: Icon,
    CheckSquareOutlined: Icon,
    SortAscendingOutlined: Icon,
    SortDescendingOutlined: Icon,
    DatabaseOutlined: Icon,
    NodeIndexOutlined: Icon,
    ThunderboltOutlined: Icon,
  };
});

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <>{children}</>,
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  closestCenter: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <>{children}</>,
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
  horizontalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
  arrayMove: (items: any[], from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

vi.mock('antd', () => {
  const Button = ({ children, disabled, loading, onClick, type, ...rest }: any) => (
    <button type="button" disabled={disabled || loading} data-button-type={type} onClick={onClick} {...rest}>
      {children}
    </button>
  );
  const Input: any = ({ value, onChange, placeholder, ...rest }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} {...rest} />
  );
  Input.TextArea = ({ value, onChange, placeholder }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} />
  );

  const createForm = () => ({
    resetFields: vi.fn(),
    setFieldsValue: vi.fn(),
    getFieldsValue: vi.fn(() => ({})),
    getFieldValue: vi.fn(),
    validateFields: vi.fn(() => Promise.resolve({})),
  });

  const Form: any = ({ children }: any) => <form>{children}</form>;
  Form.Item = ({ children }: any) => <>{children}</>;
  Form.useForm = () => [createForm()];

  const Modal: any = ({ children, footer, open, title }: any) => (
    open ? (
      <section data-modal-title={title}>
        <h2>{title}</h2>
        {children}
        <div>{footer}</div>
      </section>
    ) : null
  );
  Modal.useModal = () => {
    const [infoConfig, setInfoConfig] = React.useState<any>(null);
    return [{
      info: vi.fn((config: any) => {
        setInfoConfig(config);
        return {
          destroy: vi.fn(() => {
            setInfoConfig(null);
          }),
        };
      }),
    }, infoConfig ? <section data-modal-use-holder="true">{infoConfig.content}</section> : null];
  };

  const passthrough = ({ children }: any) => <>{children}</>;
  const Dropdown = ({ children, menu, disabled }: any) => (
    <>
      {children}
      {!disabled && menu?.items?.map((item: any) => (
        item?.type === 'divider'
          ? null
          : <button key={item.key} type="button" disabled={item.disabled} onClick={item.onClick}>{item.label}</button>
      ))}
    </>
  );
  const Space = ({ children }: any) => <div>{children}</div>;
  const Tabs = ({ items = [], activeKey, onChange }: any) => {
    const resolvedActiveKey = activeKey ?? items[0]?.key;
    const activeItem = items.find((item: any) => item.key === resolvedActiveKey) || items[0];
    return (
      <div data-tabs-active-key={resolvedActiveKey}>
        <div>
          {items.map((item: any) => (
            <button key={item.key} type="button" data-tab-key={item.key} onClick={() => onChange?.(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <div>{activeItem?.children ?? null}</div>
      </div>
    );
  };
  const Empty: any = ({ description }: any) => <div>{description || 'empty'}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = 'presented-image-simple';
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Radio: any = ({ children }: any) => <span>{children}</span>;
  Radio.Group = ({ children }: any) => <div>{children}</div>;
  Radio.Button = ({ children }: any) => <button type="button">{children}</button>;
  const Segmented = ({ value, options, onChange }: any) => (
    <div data-segmented-value={value}>
      {(options || []).map((option: any) => (
        <button
          key={option.value}
          type="button"
          data-segmented-option={option.value}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const MockTable = React.forwardRef((_props: any, _ref) => {
      const props = _props;
      const { columns } = props;
      testRenderState.latestColumns = Array.isArray(columns) ? columns : [];
      testRenderState.latestTableProps = props;
      return <table />;
    });
  MockTable.displayName = 'MockTable';

  return {
    Table: MockTable,
    message: messageApi,
    Input,
    Button,
    Dropdown,
    Form,
    Pagination: () => null,
    Select: ({ children }: any) => <div>{children}</div>,
    Modal,
    Checkbox: ({ checked, onChange }: any) => <input type="checkbox" checked={checked} onChange={onChange} />,
    Segmented,
    Tooltip: passthrough,
    Popover: passthrough,
    DatePicker: () => null,
    TimePicker: () => null,
    AutoComplete: ({ children }: any) => <>{children}</>,
    Tabs,
    Empty,
    Space,
    Tag,
    Radio,
  };
});

const textContent = (node: any): string =>
  (node.children || [])
    .map((item: any) => (typeof item === 'string' ? item : textContent(item)))
    .join('');

const findButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node).includes(text))[0];

const waitForEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const normalizeValue = (_columnName: string, value: any) => value;
const rowKeyToString = (key: any) => String(key);

const commitColumnGuard = (columnName: string) => (
  columnName !== GONAVI_ROW_KEY && columnName !== ORACLE_ROWID_LOCATOR_COLUMN
);

describe('DataGrid commit change set', () => {
  it('uses unique locator values instead of falling back to the whole row', () => {
    const result = buildDataGridCommitChangeSet({
      addedRows: [],
      modifiedRows: {
        'row-1': { [GONAVI_ROW_KEY]: 'row-1', EMAIL: 'a@example.com', NAME: 'new-name', AGE: 42 },
      },
      deletedRowKeys: new Set(),
      data: [{ [GONAVI_ROW_KEY]: 'row-1', EMAIL: 'a@example.com', NAME: 'old-name', AGE: 42 }],
      editLocator: {
        strategy: 'unique-key',
        columns: ['EMAIL'],
        valueColumns: ['EMAIL'],
        readOnly: false,
      },
      visibleColumnNames: ['EMAIL', 'NAME', 'AGE'],
      rowKeyToString,
      normalizeCommitCellValue: normalizeValue,
      shouldCommitColumn: commitColumnGuard,
    });

    expect(result).toEqual({
      ok: true,
      changes: {
        inserts: [],
        updates: [{ keys: { EMAIL: 'a@example.com' }, values: { NAME: 'new-name' } }],
        deletes: [],
      },
    });
  });

  it('uses hidden Oracle ROWID only as locator and excludes it from update values', () => {
    const result = buildDataGridCommitChangeSet({
      addedRows: [],
      modifiedRows: {
        'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name', [ORACLE_ROWID_LOCATOR_COLUMN]: 'BBBB' },
      },
      deletedRowKeys: new Set(),
      data: [{ [GONAVI_ROW_KEY]: 'row-1', NAME: 'old-name', [ORACLE_ROWID_LOCATOR_COLUMN]: 'AAAA' }],
      editLocator: {
        strategy: 'oracle-rowid',
        columns: ['ROWID'],
        valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
        hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
        readOnly: false,
      },
      visibleColumnNames: ['NAME'],
      rowKeyToString,
      normalizeCommitCellValue: normalizeValue,
      shouldCommitColumn: commitColumnGuard,
    });

    expect(result).toEqual({
      ok: true,
      changes: {
        inserts: [],
        updates: [{ keys: { ROWID: 'AAAA' }, values: { NAME: 'new-name' } }],
        deletes: [],
      },
    });
  });

  it('uses hidden DuckDB rowid only as locator and excludes it from update values', () => {
    const result = buildDataGridCommitChangeSet({
      addedRows: [],
      modifiedRows: {
        'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name', [DUCKDB_ROWID_LOCATOR_COLUMN]: 18 },
      },
      deletedRowKeys: new Set(),
      data: [{ [GONAVI_ROW_KEY]: 'row-1', NAME: 'old-name', [DUCKDB_ROWID_LOCATOR_COLUMN]: 17 }],
      editLocator: {
        strategy: 'duckdb-rowid',
        columns: ['rowid'],
        valueColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
        hiddenColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
        readOnly: false,
      },
      visibleColumnNames: ['NAME'],
      rowKeyToString,
      normalizeCommitCellValue: normalizeValue,
      shouldCommitColumn: commitColumnGuard,
    });

    expect(result).toEqual({
      ok: true,
      changes: {
        inserts: [],
        updates: [{ keys: { rowid: 17 }, values: { NAME: 'new-name' } }],
        deletes: [],
      },
    });
  });

  it('commits only writable result columns and maps aliases back to table columns', () => {
    const result = buildDataGridCommitChangeSet({
      addedRows: [],
      modifiedRows: {
        'row-1': {
          [GONAVI_ROW_KEY]: 'row-1',
          DISPLAY_NAME: 'new-name',
          NAME_UPPER: 'NEW-NAME',
        },
      },
      deletedRowKeys: new Set(),
      data: [{
        [GONAVI_ROW_KEY]: 'row-1',
        ID: 7,
        DISPLAY_NAME: 'old-name',
        NAME_UPPER: 'OLD-NAME',
      }],
      editLocator: {
        strategy: 'primary-key',
        columns: ['ID'],
        valueColumns: ['ID'],
        writableColumns: {
          DISPLAY_NAME: 'NAME',
        },
        readOnly: false,
      },
      visibleColumnNames: ['DISPLAY_NAME', 'NAME_UPPER'],
      rowKeyToString,
      normalizeCommitCellValue: normalizeValue,
      shouldCommitColumn: commitColumnGuard,
    });

    expect(result).toEqual({
      ok: true,
      changes: {
        inserts: [],
        updates: [{ keys: { ID: 7 }, values: { NAME: 'new-name' } }],
        deletes: [],
      },
    });
  });

  it('uses MongoDB _id as the locator and keeps _id out of update values', () => {
    const result = buildDataGridCommitChangeSet({
      addedRows: [{
        [GONAVI_ROW_KEY]: 'new-1',
        _id: '507f1f77bcf86cd799439013',
        __gonavi_mongodb_id_locator__: { $oid: '507f1f77bcf86cd799439013' },
        name: 'insert-name',
      }],
      modifiedRows: {
        'row-1': {
          [GONAVI_ROW_KEY]: 'row-1',
          _id: '507f1f77bcf86cd799439999',
          __gonavi_mongodb_id_locator__: '507f1f77bcf86cd799439999',
          name: 'new-name',
        },
      },
      deletedRowKeys: new Set(['row-2']),
      data: [
        {
          [GONAVI_ROW_KEY]: 'row-1',
          _id: '507f1f77bcf86cd799439011',
          __gonavi_mongodb_id_locator__: { $oid: '507f1f77bcf86cd799439011' },
          name: 'old-name',
        },
        {
          [GONAVI_ROW_KEY]: 'row-2',
          _id: '507f1f77bcf86cd799439012',
          __gonavi_mongodb_id_locator__: '507f1f77bcf86cd799439012',
          name: 'to-delete',
        },
      ],
      editLocator: {
        strategy: 'primary-key',
        columns: ['_id'],
        valueColumns: ['__gonavi_mongodb_id_locator__'],
        hiddenColumns: ['__gonavi_mongodb_id_locator__'],
        writableColumns: {
          name: 'name',
        },
        readOnly: false,
      },
      visibleColumnNames: ['_id', 'name'],
      rowKeyToString,
      normalizeCommitCellValue: normalizeValue,
      shouldCommitColumn: commitColumnGuard,
    });

    expect(result).toEqual({
      ok: true,
      changes: {
        inserts: [{ name: 'insert-name' }],
        updates: [{ keys: { _id: { $oid: '507f1f77bcf86cd799439011' } }, values: { name: 'new-name' } }],
        deletes: [{ _id: '507f1f77bcf86cd799439012' }],
      },
    });
  });

  it('fails closed when no safe locator is available', () => {
    const result = buildDataGridCommitChangeSet({
      addedRows: [],
      modifiedRows: {
        'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name' },
      },
      deletedRowKeys: new Set(),
      data: [{ [GONAVI_ROW_KEY]: 'row-1', NAME: 'old-name' }],
      editLocator: undefined,
      visibleColumnNames: ['NAME'],
      rowKeyToString,
      normalizeCommitCellValue: normalizeValue,
      shouldCommitColumn: commitColumnGuard,
      rowLocatorMessages: {
        noSafeLocator: () => 'No safe row locator is available for this result set.',
      },
    } as any);

    expect(result).toEqual({ ok: false, error: 'No safe row locator is available for this result set.' });
  });

  it('rejects delete rows when unique locator value is null', () => {
    const result = buildDataGridCommitChangeSet({
      addedRows: [],
      modifiedRows: {},
      deletedRowKeys: new Set(['row-1']),
      data: [{ [GONAVI_ROW_KEY]: 'row-1', EMAIL: null, NAME: 'old-name' }],
      editLocator: {
        strategy: 'unique-key',
        columns: ['EMAIL'],
        valueColumns: ['EMAIL'],
        readOnly: false,
      },
      visibleColumnNames: ['EMAIL', 'NAME'],
      rowKeyToString,
      normalizeCommitCellValue: normalizeValue,
      shouldCommitColumn: commitColumnGuard,
    });

    expect(result).toEqual({ ok: false, error: 'Locator column EMAIL is empty, so changes cannot be submitted safely.' });
  });

  it('keeps DataGrid safe locator fallback messages out of source Chinese literals', () => {
    const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');
    const rowLocatorSource = readFileSync(new URL('../utils/rowLocator.ts', import.meta.url), 'utf8');

    expect(`${dataGridSource}\n${rowLocatorSource}`).not.toMatch(/当前结果没有可用的安全行定位方式|定位列 .* 的值为空，无法安全提交修改/);
    expect(dataGridSource).toContain('data_grid.message.no_safe_locator');
    expect(dataGridSource).toContain('data_grid.message.locator_column_value_empty');
  });

  it('keeps DataGrid column quick-find warning messages localized', () => {
    const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    expect(dataGridSource).not.toMatch(/未找到字段列|当前未渲染，无法定位/);
    expect(dataGridSource).toContain('data_grid.message.column_quick_find_not_found');
    expect(dataGridSource).toContain('data_grid.message.column_quick_find_not_rendered');
  });

  it('keeps DataGrid datetime picker now footer localized', () => {
    const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    expect(dataGridSource).not.toContain('>此刻</a>');
    expect(dataGridSource).toContain('data_grid.datetime_picker.now');
  });

  it('keeps DataGrid AI insight prompt wrapper localized', () => {
    const dataGridSource = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    expect(dataGridSource).not.toMatch(/请帮我分析以下查询结果数据|请分析数据特征|业务上的洞察/);
    expect(dataGridSource).toContain('data_grid.ai_insight.prompt');
  });

  it('marks the active virtual editing row so shouldCellUpdate can reopen inline editors', () => {
    const rows = [
      { [GONAVI_ROW_KEY]: 'row-1', id: 1, name: 'alpha' },
      { [GONAVI_ROW_KEY]: 'row-2', id: 2, name: 'beta' },
    ];

    const nextRows = attachDataGridVirtualEditRenderVersion(rows, { rowKey: 'row-1', dataIndex: 'name', title: 'name' });

    expect(nextRows[0]).not.toBe(rows[0]);
    expect(nextRows[1]).toBe(rows[1]);
    expect(hasDataGridVirtualEditRenderVersionChanged(nextRows[0], rows[0])).toBe(true);
    expect(hasDataGridVirtualEditRenderVersionChanged(nextRows[1], rows[1])).toBe(false);
  });
});

describe('DataGrid DDL interactions', () => {
  beforeEach(() => {
    backendApp.DBGetColumns.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetIndexes.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetForeignKeys.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetTriggers.mockResolvedValue({ success: true, data: [] });
    backendApp.DBQuery.mockResolvedValue({ success: true, data: [] });
    backendApp.DBShowCreateTable.mockResolvedValue({ success: true, data: 'CREATE TABLE users' });
    setCurrentLanguage('zh-CN');
    storeState.appearance.uiVersion = 'legacy';
    storeState.dataEditTransactionOptions = {
      commitMode: 'manual',
      autoCommitDelayMs: 5000,
    };
    storeState.setDataEditTransactionOptions.mockReset();
    storeState.setDataEditTransactionOptions.mockImplementation((options: Partial<typeof storeState.dataEditTransactionOptions>) => {
      storeState.dataEditTransactionOptions = {
        ...storeState.dataEditTransactionOptions,
        ...options,
      };
    });
    storeState.addTab.mockReset();
    storeState.setActiveContext.mockReset();
    testRenderState.latestColumns = [];
    testRenderState.latestTableProps = null;

    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      activeElement: null,
      elementFromPoint: vi.fn(() => null),
      createElement: vi.fn(() => ({
        style: {},
        getContext: vi.fn(() => ({ measureText: vi.fn(() => ({ width: 0 })) })),
      })),
      body: { style: {} },
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      innerHeight: 768,
      innerWidth: 1024,
      getComputedStyle: vi.fn(() => ({ font: '12px sans-serif' })),
    });
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: '',
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    });
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    backendApp.ImportData.mockReset();
    backendApp.ExportTable.mockReset();
    backendApp.ExportData.mockReset();
    backendApp.ExportQuery.mockReset();
    backendApp.ApplyChanges.mockReset();
    backendApp.DBGetColumns.mockReset();
    backendApp.DBGetIndexes.mockReset();
    backendApp.DBGetForeignKeys.mockReset();
    backendApp.DBGetTriggers.mockReset();
    backendApp.DBQuery.mockReset();
    backendApp.DBShowCreateTable.mockReset();
    vi.unstubAllGlobals();
  });

  it('ignores stale DDL responses after the table context changes', async () => {
    let resolveFirstRequest: (value: any) => void = () => {};
    backendApp.DBShowCreateTable.mockReturnValueOnce(new Promise((resolve) => {
      resolveFirstRequest = resolve;
    }));

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1 }]}
          columnNames={['id']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
          pkColumns={['id']}
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      findButton(renderer!, '查看 DDL').props.onClick();
    });

    await act(async () => {
      renderer!.update(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-2', id: 2 }]}
          columnNames={['id']}
          loading={false}
          tableName="orders"
          dbName="main"
          connectionId="conn-1"
        />,
      );
      resolveFirstRequest({ success: true, data: 'CREATE TABLE users' });
    });
    await waitForEffects();

    expect(textContent(renderer!.root)).not.toContain('CREATE TABLE users');
    expect(renderer!.root.findAll((node) => node.props['data-modal-title'] === 'DDL - orders')).toHaveLength(0);
  });

  it.each(['legacy', 'v2'] as const)(
    'opens the referenced table when clicking a foreign-key column header in %s UI',
    async (uiVersion) => {
      storeState.appearance.uiVersion = uiVersion;
      backendApp.DBGetForeignKeys.mockResolvedValueOnce({
        success: true,
        data: [{
          columnName: 'customer_id',
          refTableName: 'customers',
          refColumnName: 'id',
          constraintName: 'fk_orders_customer',
        }],
      });

      let renderer: ReactTestRenderer;
      await act(async () => {
        renderer = create(
          <DataGrid
            data={[{ __gonavi_row_key__: 'row-1', id: 1, customer_id: 10 }]}
            columnNames={['id', 'customer_id']}
            loading={false}
            tableName="orders"
            dbName="main"
            connectionId="conn-1"
          />,
        );
      });
      await waitForEffects();

      const fkColumn = testRenderState.latestColumns.find((column) => column.key === 'customer_id');
      expect(fkColumn).toBeTruthy();
      const headerRenderer = create(<>{fkColumn.title}</>);
      const fkJump = headerRenderer.root.findByProps({ 'data-grid-fk-jump': 'true' });
      await act(async () => {
        fkJump.props.onClick({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      });

      expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'main' });
      expect(storeState.addTab).toHaveBeenCalledWith({
        id: 'conn-1-main-table-customers',
        title: 'customers',
        type: 'table',
        connectionId: 'conn-1',
        dbName: 'main',
        tableName: 'customers',
        objectType: 'table',
      });
    },
  );

  it('opens the v2 column header context menu from table headers', async () => {
    setCurrentLanguage('en-US');
    storeState.appearance.uiVersion = 'v2';
    storeState.queryOptions.showColumnComment = true;
    storeState.queryOptions.showColumnType = true;
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ Name: 'id', Type: 'bigint', Comment: '主键 ID' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1 }]}
          columnNames={['id']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
          pkColumns={['id']}
        />,
      );
    });
    await waitForEffects();

    const idColumn = testRenderState.latestColumns.find((column) => column.key === 'id');
    expect(idColumn).toBeTruthy();
    const headerProps = idColumn.onHeaderCell(idColumn);

    await act(async () => {
      headerProps.onContextMenu({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 120,
        clientY: 88,
      });
    });

    expect(renderer!.root.findByProps({ 'data-v2-column-context-menu': 'true' })).toBeTruthy();
    expect(textContent(renderer!.root)).toContain(t('sidebar.v2_table_menu.copy_section'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.copy_field_name'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.copy_column_data'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.sort_ascending'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.hide_column'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.hide_column_type'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.hide_column_comment'));
    expect(textContent(renderer!.root)).toContain('bigint');
    expect(textContent(renderer!.root)).toContain('主键 ID');
    renderer!.unmount();
  });

  it('localizes v2 column header fallback labels', () => {
    setCurrentLanguage('en-US');

    const renderer = create(
      <V2ColumnHeaderContextMenuView
        fieldName=""
        columnType=""
        columnComment=""
        showColumnType={false}
        showColumnComment={false}
      />,
    );

    const content = textContent(renderer.root);
    expect(content).toContain(t('data_grid.context_menu.column_unnamed_field'));
    expect(content).toContain(t('data_grid.context_menu.column_unknown_type'));
    expect(content).toContain(t('data_grid.context_menu.column_no_comment'));
    expect(content).toContain(t('data_grid.context_menu.show_column_type'));
    expect(content).toContain(t('data_grid.context_menu.show_column_comment'));
    renderer.unmount();
  });

  it('localizes v2 table group menu labels and fallback metadata', () => {
    setCurrentLanguage('en-US');

    const renderer = create(
      <V2TableGroupContextMenuView
        dbName=""
        count={2}
        currentSort="frequency"
      />,
    );

    const content = textContent(renderer.root);
    expect(content).toContain(t('sidebar.v2_table_group_menu.title'));
    expect(content).toContain(t('sidebar.v2_table_group_menu.current_database'));
    expect(content).toContain(t('sidebar.v2_table_group_menu.sort_frequency'));
    expect(content).toContain(t('sidebar.menu.create_table'));
    expect(content).toContain(t('data_grid.context_menu.sort_section'));
    expect(content).toContain(t('sidebar.menu.sort_by_name'));
    expect(content).toContain(t('sidebar.menu.sort_by_frequency'));
    expect(content).toContain(t('data_grid.context_menu.current_marker'));
    ['表 · tables', '使用频率', '当前数据库', '张表', '当前按', '新建表', '排序', '按名称排序', '按使用频率排序', '当前'].forEach((rawSnippet) => {
      expect(content).not.toContain(rawSnippet);
    });
    renderer.unmount();
  });

  it('localizes v2 cell editing labels and fallback metadata', () => {
    setCurrentLanguage('en-US');

    const renderer = create(
      <V2CellContextMenuView
        fieldName=""
        tableName=""
        rowLabel=""
        selectedRowCount={3}
        canModifyData
        copiedRowCount={2}
        canPasteCopiedColumns
      />,
    );

    const content = textContent(renderer.root);
    expect(content).toContain(t('data_grid.context_menu.column_unnamed_field'));
    expect(content).toContain(t('data_grid.context_menu.current_row'));
    expect(content).toContain(t('data_grid.context_menu.copy_field_name'));
    expect(content).toContain(t('data_grid.context_menu.edit_section'));
    expect(content).toContain(t('data_grid.batch_fill.set_null'));
    expect(content).toContain(t('data_grid.context_menu.edit_row'));
    expect(content).toContain(t('data_grid.context_menu.copy_row_as_new'));
    expect(content).toContain(t('data_grid.context_menu.paste_row_as_new_count', { count: 2 }));
    expect(content).toContain(t('data_grid.context_menu.fill_to_selected_rows', { count: '3' }));
    expect(content).toContain(t('data_grid.context_menu.paste_copied_columns'));
    ['未命名字段', '当前行', '当前单元格', '复制字段名称', '编辑', '设置为 NULL', '编辑本行', '复制本行为新增行', '粘贴为新增行', '填充到选中行', '粘贴已复制列'].forEach((rawSnippet) => {
      expect(content).not.toContain(rawSnippet);
    });
    renderer.unmount();
  });

  it('keeps the v2 column header menu labels on i18n keys', () => {
    const source = readFileSync(new URL('./V2TableContextMenu.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('export const V2ColumnHeaderContextMenuView');
    const end = source.indexOf('export const V2CellContextMenuView', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const columnMenuSource = source.slice(start, end);

    [
      "t('sidebar.v2_table_menu.copy_section')",
      "t('data_grid.context_menu.column_unknown_type')",
      "t('data_grid.context_menu.column_no_comment')",
      "t('data_grid.context_menu.column_unnamed_field')",
      "t('data_grid.context_menu.copy_field_name')",
      "t('data_grid.context_menu.copy_column_data')",
      "t('data_grid.context_menu.sort_section')",
      "t('data_grid.context_menu.sort_ascending')",
      "t('data_grid.context_menu.sort_descending')",
      "t('data_grid.context_menu.clear_column_sort')",
      "t('data_grid.context_menu.current_marker')",
      "t('data_grid.context_menu.column_display_section')",
      "t('data_grid.context_menu.auto_fit_column')",
      "t('data_grid.context_menu.hide_column')",
      "t('data_grid.context_menu.show_column_type')",
      "t('data_grid.context_menu.hide_column_type')",
      "t('data_grid.context_menu.show_column_comment')",
      "t('data_grid.context_menu.hide_column_comment')",
    ].forEach((expectedSnippet) => {
      expect(columnMenuSource).toContain(expectedSnippet);
    });

    [
      '<div className="gn-v2-context-menu-section-title">复制</div>',
      '未知类型',
      '暂无备注',
      '未命名字段',
      '复制字段名称',
      '复制列数据',
      '排序',
      '升序排序',
      '降序排序',
      '取消此字段排序',
      '当前',
      '字段显示',
      '按内容自适应列宽',
      '隐藏此字段',
      '显示字段类型',
      '隐藏字段类型',
      '显示字段备注',
      '隐藏字段备注',
    ].forEach((rawSnippet) => {
      expect(columnMenuSource).not.toContain(rawSnippet);
    });
  });

  it('keeps the v2 table group menu labels on i18n keys', () => {
    const source = readFileSync(new URL('./V2TableContextMenu.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('export const V2TableGroupContextMenuView');
    const end = source.indexOf('export type V2DatabaseContextMenuActionKey', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const groupMenuSource = source.slice(start, end);

    [
      "t('sidebar.v2_table_group_menu.title')",
      "t('sidebar.v2_table_group_menu.current_database')",
      "t('sidebar.v2_table_group_menu.sort_name')",
      "t('sidebar.v2_table_group_menu.sort_frequency')",
      "t('sidebar.v2_table_group_menu.meta'",
      "t('sidebar.menu.create_table')",
      "t('data_grid.context_menu.sort_section')",
      "t('sidebar.menu.sort_by_name')",
      "t('sidebar.menu.sort_by_frequency')",
      "t('data_grid.context_menu.current_marker')",
    ].forEach((expectedSnippet) => {
      expect(groupMenuSource).toContain(expectedSnippet);
    });

    [
      '表 · tables',
      '使用频率',
      '名称',
      '当前数据库',
      '张表',
      '当前按',
      '新建表',
      '<div className="gn-v2-context-menu-section-title">排序</div>',
      '按名称排序',
      '按使用频率排序',
      "'当前'",
    ].forEach((rawSnippet) => {
      expect(groupMenuSource).not.toContain(rawSnippet);
    });
  });

  it('opens the v2 cell context menu for table cells instead of the legacy inline menu', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1 }]}
          columnNames={['id']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    const idColumn = testRenderState.latestColumns.find((column) => column.key === 'id');
    const cellProps = idColumn.onCell({ __gonavi_row_key__: 'row-1', id: 1 });
    const contextTarget = {
      closest: (selector: string) => selector === '[data-row-key][data-col-name]'
        ? {
            getAttribute: (name: string) => {
              if (name === 'data-row-key') return 'row-1';
              if (name === 'data-col-name') return 'id';
              return null;
            },
          }
        : null,
    } as unknown as HTMLElement;
    await act(async () => {
      cellProps.onContextMenu({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 160,
        clientY: 120,
        currentTarget: contextTarget,
        target: contextTarget,
      });
    });

    expect(renderer!.root.findByProps({ 'data-v2-cell-context-menu': 'true' })).toBeTruthy();
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.copy_field_name'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.copy_row_data'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.copy_column_data'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.context_menu.copy_as_insert'));
    expect(textContent(renderer!.root)).toContain(t('data_grid.toolbar.export'));
    renderer!.unmount();
  });

  it('keeps the v2 cell copy and export menu labels on i18n keys', () => {
    const source = readFileSync(new URL('./V2TableContextMenu.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('export const V2CellContextMenuView');
    expect(start).toBeGreaterThanOrEqual(0);
    const cellMenuSource = source.slice(start);

    [
      "t('data_grid.context_menu.column_unnamed_field')",
      "t('data_grid.context_menu.current_row')",
      "t('data_grid.context_menu.current_cell')",
      "t('data_grid.context_menu.copy_field_name')",
      "t('data_grid.context_menu.edit_section')",
      "t('data_grid.batch_fill.set_null')",
      "t('data_grid.context_menu.edit_row')",
      "t('data_grid.context_menu.copy_row_as_new')",
      "t('data_grid.context_menu.paste_row_as_new')",
      "t('data_grid.context_menu.paste_row_as_new_count'",
      "t('data_grid.context_menu.fill_to_selected_rows'",
      "t('data_grid.context_menu.paste_copied_columns')",
      "t('sidebar.v2_table_menu.copy_section')",
      "t('data_grid.context_menu.copy_row_data')",
      "t('data_grid.context_menu.copy_column_data')",
      "t('data_grid.context_menu.copy_as_insert')",
      "t('data_grid.context_menu.copy_as_update')",
      "t('data_grid.context_menu.copy_as_delete')",
      "t('data_grid.context_menu.copy_as_json')",
      "t('data_grid.context_menu.copy_as_csv')",
      "t('data_grid.context_menu.copy_as_markdown')",
      "t('data_grid.toolbar.export')",
      "t('sidebar.v2_table_menu.item_with_suffix', { label: 'CSV', suffix: '.csv' })",
      "t('sidebar.v2_table_menu.item_with_suffix', { label: 'Excel', suffix: '.xlsx' })",
      "t('sidebar.v2_table_menu.item_with_suffix', { label: 'JSON', suffix: '.json' })",
      "t('sidebar.v2_table_menu.item_with_suffix', { label: 'HTML', suffix: '.html' })",
    ].forEach((expectedSnippet) => {
      expect(cellMenuSource).toContain(expectedSnippet);
    });

    [
      '<div className="gn-v2-context-menu-section-title">复制</div>',
      '<div className="gn-v2-context-menu-section-title">导出</div>',
      "title: '复制行数据'",
      "title: '复制列数据'",
      "title: '复制为 INSERT'",
      "title: '复制为 UPDATE'",
      "title: '复制为 DELETE'",
      "title: '复制为 JSON'",
      "title: '复制为 CSV'",
      "title: '复制为 Markdown'",
      '未命名字段',
      '当前行',
      '当前单元格',
      '复制字段名称',
      '<div className="gn-v2-context-menu-section-title">编辑</div>',
      '设置为 NULL',
      '编辑本行',
      '复制本行为新增行',
      '粘贴为新增行',
      '填充到选中行',
      '粘贴已复制列 · 同名列',
    ].forEach((rawSnippet) => {
      expect(cellMenuSource).not.toContain(rawSnippet);
    });
  });

  it('exports query-result rows from in-memory data without rerunning ExportQuery', async () => {
    backendApp.ExportData.mockResolvedValue({ success: true });
    backendApp.ExportQuery.mockResolvedValue({ success: true });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[
            { __gonavi_row_key__: 'row-1', owner: 'sa' },
            { __gonavi_row_key__: 'row-2', owner: 'dbo' },
          ]}
          columnNames={['owner']}
          loading={false}
          exportScope="queryResult"
          resultSql="EXEC sp_helpdb"
          dbName="master"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      await findButton(renderer!, 'HTML').props.onClick();
    });

    const exportAllButton = findButton(renderer!, t('data_grid.export.all_rows', { count: 2 }));
    await act(async () => {
      await exportAllButton.props.onClick();
    });
    await waitForEffects();

    expect(backendApp.ExportData).toHaveBeenCalledTimes(1);
    expect(backendApp.ExportData).toHaveBeenCalledWith(
      [{ owner: 'sa' }, { owner: 'dbo' }],
      ['owner'],
      'export',
      'html',
    );
    expect(backendApp.ExportQuery).not.toHaveBeenCalled();
  });

  it('copies loaded column data from the v2 column header context menu', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[
            { __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' },
            { __gonavi_row_key__: 'row-2', id: 2, name: 'beta' },
          ]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    const idColumn = testRenderState.latestColumns.find((column) => column.key === 'id');
    const headerProps = idColumn.onHeaderCell(idColumn);
    await act(async () => {
      headerProps.onContextMenu({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 120,
        clientY: 88,
      });
    });

    await act(async () => {
      findButton(renderer!, t('data_grid.context_menu.copy_column_data')).props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1\n2');
    renderer!.unmount();
  });

  it('copies row and column data from the v2 cell context menu', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[
            { __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' },
            { __gonavi_row_key__: 'row-2', id: 2, name: 'beta' },
          ]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    const nameColumn = testRenderState.latestColumns.find((column) => column.key === 'name');
    const cellProps = nameColumn.onCell({ __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' });
    const contextTarget = {
      closest: (selector: string) => selector === '[data-row-key][data-col-name]'
        ? {
            getAttribute: (name: string) => {
              if (name === 'data-row-key') return 'row-1';
              if (name === 'data-col-name') return 'name';
              return null;
            },
          }
        : null,
    } as unknown as HTMLElement;
    await act(async () => {
      cellProps.onContextMenu({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 160,
        clientY: 120,
        currentTarget: contextTarget,
        target: contextTarget,
      });
    });

    await act(async () => {
      findButton(renderer!, t('data_grid.context_menu.copy_row_data')).props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('id\tname\n1\talpha');

    await act(async () => {
      cellProps.onContextMenu({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 160,
        clientY: 120,
        currentTarget: contextTarget,
        target: contextTarget,
      });
    });
    await act(async () => {
      findButton(renderer!, t('data_grid.context_menu.copy_column_data')).props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('alpha\nbeta');
    renderer!.unmount();
  });

  it('copies the current row for paste and pastes it as a new row from the v2 cell context menu', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[
            { __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' },
          ]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
          pkColumns={['id']}
        />,
      );
    });
    await waitForEffects();

    const nameColumn = testRenderState.latestColumns.find((column) => column.key === 'name');
    const contextTarget = {
      closest: (selector: string) => selector === '[data-row-key][data-col-name]'
        ? {
            getAttribute: (name: string) => {
              if (name === 'data-row-key') return 'row-1';
              if (name === 'data-col-name') return 'name';
              return null;
            },
          }
        : null,
    } as unknown as HTMLElement;

    const openMenu = async () => {
      const cellProps = nameColumn.onCell({ __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' });
      await act(async () => {
        cellProps.onContextMenu({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 160,
          clientY: 120,
          currentTarget: contextTarget,
          target: contextTarget,
        });
      });
    };

    await openMenu();
    await act(async () => {
      findButton(renderer!, t('data_grid.context_menu.copy_row_as_new')).props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    expect(messageApi.success).toHaveBeenCalledWith(t('data_grid.message.copied_rows', { count: 1 }));

    await openMenu();
    await act(async () => {
      findButton(renderer!, t('data_grid.context_menu.paste_row_as_new_count', { count: 1 })).props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    expect(messageApi.success).toHaveBeenCalledWith(t('data_grid.message.pasted_rows_as_new', { count: 1 }));
    expect(testRenderState.latestTableProps.dataSource).toHaveLength(2);
    expect(testRenderState.latestTableProps.dataSource[1][GONAVI_ROW_KEY]).toContain('paste-');
    renderer!.unmount();
  });

  it('auto commits pending table edits after the configured delay', async () => {
    vi.useFakeTimers();
    storeState.appearance.uiVersion = 'v2';
    storeState.dataEditTransactionOptions = {
      commitMode: 'auto',
      autoCommitDelayMs: 3000,
    };
    backendApp.ApplyChanges.mockResolvedValue({ success: true, message: 'ok' });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[
            { __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' },
          ]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
          pkColumns={['id']}
        />,
      );
    });
    await waitForEffects();

    const nameColumn = testRenderState.latestColumns.find((column) => column.key === 'name');
    const contextTarget = {
      closest: (selector: string) => selector === '[data-row-key][data-col-name]'
        ? {
            getAttribute: (name: string) => {
              if (name === 'data-row-key') return 'row-1';
              if (name === 'data-col-name') return 'name';
              return null;
            },
          }
        : null,
    } as unknown as HTMLElement;

    const openMenu = async () => {
      const cellProps = nameColumn.onCell({ __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' });
      await act(async () => {
        cellProps.onContextMenu({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 160,
          clientY: 120,
          currentTarget: contextTarget,
          target: contextTarget,
        });
      });
    };

    await openMenu();
    await act(async () => {
      findButton(renderer!, '复制本行为新增行').props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });
    await openMenu();
    await act(async () => {
      findButton(renderer!, t('data_grid.context_menu.paste_row_as_new_count', { count: 1 })).props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    expect(backendApp.ApplyChanges).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2999);
      await Promise.resolve();
    });
    expect(backendApp.ApplyChanges).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.ApplyChanges).toHaveBeenCalledTimes(1);
    expect(backendApp.ApplyChanges.mock.calls[0][3]).toMatchObject({
      inserts: [
        expect.objectContaining({
          id: 1,
          name: 'alpha',
        }),
      ],
      updates: [],
      deletes: [],
      locatorStrategy: 'primary-key',
    });
    expect(messageApi.success).toHaveBeenCalledWith('自动提交成功');
    renderer!.unmount();
  });

  it('switches the v2 footer object tab into the embedded designer view', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'id', type: 'bigint', key: 'PRI', nullable: 'NO', default: '', comment: '' },
        { name: 'name', type: 'varchar(255)', key: '', nullable: 'YES', default: '', comment: '' },
      ],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' }]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      findButton(renderer!, '对象设计').props.onClick();
    });

    const content = textContent(renderer!.root);
    expect(content).toContain('SCHEMA DESIGNER');
    expect(content).toContain('字段');
    expect(content).toContain('id');
    expect(content).toContain('name');
  });

  it('returns to the legacy table view when v2-only footer views are active during UI switch', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' }]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      findButton(renderer!, '对象设计').props.onClick();
    });
    expect(textContent(renderer!.root)).toContain('SCHEMA DESIGNER');

    storeState.appearance.uiVersion = 'legacy';
    await act(async () => {
      renderer!.update(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' }]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    const content = textContent(renderer!.root);
    expect(content).not.toContain('SCHEMA DESIGNER');
    expect(content).not.toContain('gn-v2-data-grid-fields-view');
    expect(content).toContain('数据预览');
    expect(content).toContain('结果视图');
    expect(content).toContain('字段信息');
  });

  it('keeps the v2 fields tab as read-only field info for views', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'id', type: 'bigint', key: '', nullable: 'NO', default: '', comment: '' },
        { name: 'name', type: 'varchar(255)', key: '', nullable: 'YES', default: '', comment: '' },
      ],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1, name: 'alpha' }]}
          columnNames={['id', 'name']}
          loading={false}
          tableName="user_view"
          dbName="main"
          connectionId="conn-1"
          objectType="view"
        />,
      );
    });
    await waitForEffects();

    expect(textContent(renderer!.root)).toContain('字段信息');
    expect(textContent(renderer!.root)).not.toContain('对象设计');

    await act(async () => {
      findButton(renderer!, '字段信息').props.onClick();
    });

    const content = textContent(renderer!.root);
    expect(content).toContain(t('data_grid.metadata_view.fields_badge'));
    expect(content).toContain(t('data_grid.metadata_view.field_count', { count: 2 }));
    expect(content).toContain('id');
    expect(content).toContain('name');
    expect(content).not.toContain('SCHEMA DESIGNER');
  });

  it('renders the v2 footer DDL view with the Monaco SQL editor', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBShowCreateTable.mockResolvedValueOnce({
      success: true,
      data: 'CREATE TABLE users (`id` bigint)',
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1 }]}
          columnNames={['id']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      findButton(renderer!, '查看 DDL').props.onClick();
    });
    await waitForEffects();

    const editors = renderer!.root.findAll((node) => node.props['data-monaco-editor'] === 'true');
    expect(editors).toHaveLength(1);
    expect(editors[0].props['data-language']).toBe('sql');
    expect(editors[0].props['data-read-only']).toBe('true');
    expect(textContent(editors[0])).toContain('CREATE TABLE');
    expect(textContent(editors[0])).toContain('users');
    expect(renderer!.root.findAll((node) => node.type === 'pre' && textContent(node).includes('CREATE TABLE users'))).toHaveLength(0);
  });

  it('formats DuckDB DDL into readable multiline SQL in the v2 view', async () => {
    storeState.appearance.uiVersion = 'v2';
    storeState.connections[0].config.type = 'duckdb';
    backendApp.DBShowCreateTable.mockResolvedValueOnce({
      success: true,
      data: 'CREATE TABLE customers(customer_id BIGINT, customer_code VARCHAR, city VARCHAR, tier VARCHAR, signup_date DATE, lifetime_value DECIMAL(12,2), PRIMARY KEY(customer_id));',
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', customer_id: 1 }]}
          columnNames={['customer_id']}
          loading={false}
          tableName="example.main.customers"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      findButton(renderer!, '查看 DDL').props.onClick();
    });
    await waitForEffects();

    const editors = renderer!.root.findAll((node) => node.props['data-monaco-editor'] === 'true');
    expect(editors).toHaveLength(1);
    const ddlText = textContent(editors[0]);
    expect(ddlText).toContain('CREATE TABLE customers (');
    expect(ddlText).toContain('customer_id BIGINT,');
    expect(ddlText).toContain('PRIMARY KEY (customer_id)');
    expect(ddlText).toContain('\n');
  });

  it('opens the v2 DDL view as a right sidebar while keeping the table visible', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBShowCreateTable.mockResolvedValueOnce({
      success: true,
      data: 'CREATE TABLE users (`id` bigint)',
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1 }]}
          columnNames={['id']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      findButton(renderer!, '查看 DDL').props.onClick();
    });
    await waitForEffects();

    await act(async () => {
      renderer!.root.findByProps({ 'data-segmented-option': 'side' }).props.onClick();
    });

    const sideWorkspace = renderer!.root.findByProps({ 'data-grid-ddl-layout': 'side' });
    expect(sideWorkspace.props.className).toBe('gn-v2-data-grid-split-workspace');
    expect(renderer!.root.findByProps({ 'aria-label': '表 DDL 侧栏' }).props.className).toBe('gn-v2-data-grid-ddl-sidebar');
    expect(renderer!.root.findByProps({ 'data-grid-ddl-view': 'side' }).props.className).toContain('is-side');
    expect(renderer!.root.findAllByType('table')).toHaveLength(1);
    expect(sideWorkspace.props.style.gridTemplateColumns).toBe('minmax(0, 1fr) 8px 420px');
    expect(sideWorkspace.props.style['--gn-v2-ddl-sidebar-width']).toBe('420px');
    expect(renderer!.root.findByProps({ 'data-grid-ddl-resizer': 'true' }).props['aria-valuenow']).toBe(420);

    const editors = renderer!.root.findAll((node) => node.props['data-monaco-editor'] === 'true');
    expect(editors).toHaveLength(1);
    expect(editors[0].props['data-language']).toBe('sql');
    expect(textContent(editors[0])).toContain('CREATE TABLE users');
  });

  it('previews and commits the v2 DDL sidebar width after dragging the separator', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBShowCreateTable.mockResolvedValueOnce({
      success: true,
      data: 'CREATE TABLE users (`id` bigint)',
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <DataGrid
          data={[{ __gonavi_row_key__: 'row-1', id: 1 }]}
          columnNames={['id']}
          loading={false}
          tableName="users"
          dbName="main"
          connectionId="conn-1"
        />,
      );
    });
    await waitForEffects();

    await act(async () => {
      findButton(renderer!, '查看 DDL').props.onClick();
    });
    await waitForEffects();

    await act(async () => {
      renderer!.root.findByProps({ 'data-segmented-option': 'side' }).props.onClick();
    });

    const container = renderer!.root.findByProps({ 'data-grid-ddl-layout': 'side' });
    expect(container.props.style.gridTemplateColumns).toBe('minmax(0, 1fr) 8px 420px');
    expect(renderer!.root.findByProps({ 'data-grid-ddl-resize-preview': 'true' }).props.className).toBe('gn-v2-data-grid-ddl-resize-preview');

    const addEventListenerMock = vi.mocked(document.addEventListener);
    const removeEventListenerMock = vi.mocked(document.removeEventListener);
    const resizer = renderer!.root.findByProps({ 'data-grid-ddl-resizer': 'true' });
    await act(async () => {
      resizer.props.onMouseDown({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 900,
      });
    });

    const mouseMoveHandler = addEventListenerMock.mock.calls.find(([eventName]) => eventName === 'mousemove')?.[1] as ((event: MouseEvent) => void) | undefined;
    const mouseUpHandler = addEventListenerMock.mock.calls.find(([eventName]) => eventName === 'mouseup')?.[1] as (() => void) | undefined;
    expect(mouseMoveHandler).toBeTypeOf('function');
    expect(mouseUpHandler).toBeTypeOf('function');

    await act(async () => {
      mouseMoveHandler?.({ clientX: 780 } as MouseEvent);
    });

    const movingContainer = renderer!.root.findByProps({ 'data-grid-ddl-layout': 'side' });
    expect(movingContainer.props.style.gridTemplateColumns).toBe('minmax(0, 1fr) 8px 420px');
    expect(movingContainer.props.style['--gn-v2-ddl-sidebar-width']).toBe('420px');
    expect(renderer!.root.findByProps({ 'data-grid-ddl-resizer': 'true' }).props['aria-valuenow']).toBe(420);

    await act(async () => {
      mouseUpHandler?.();
    });

    const resizedContainer = renderer!.root.findByProps({ 'data-grid-ddl-layout': 'side' });
    expect(resizedContainer.props.style.gridTemplateColumns).toBe('minmax(0, 1fr) 8px 540px');
    expect(resizedContainer.props.style['--gn-v2-ddl-sidebar-width']).toBe('540px');
    expect(renderer!.root.findByProps({ 'data-grid-ddl-resizer': 'true' }).props['aria-valuenow']).toBe(540);
    expect(removeEventListenerMock).toHaveBeenCalledWith('mousemove', mouseMoveHandler);
    expect(removeEventListenerMock).toHaveBeenCalledWith('mouseup', mouseUpHandler);
  });
});
