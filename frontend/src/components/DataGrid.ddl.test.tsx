import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DataGrid, {
  attachDataGridVirtualEditRenderVersion,
  buildDataGridCommitChangeSet,
  GONAVI_ROW_KEY,
  hasDataGridVirtualEditRenderVersionChanged,
} from './DataGrid';
import { ORACLE_ROWID_LOCATOR_COLUMN } from '../utils/rowLocator';

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
    TableOutlined: Icon,
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
  Modal.useModal = () => [{ info: vi.fn(() => ({ destroy: vi.fn() })) }, null];

  const passthrough = ({ children }: any) => <>{children}</>;
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
    Dropdown: passthrough,
    Form,
    Pagination: () => null,
    Select: () => null,
    Modal,
    Checkbox: ({ checked, onChange }: any) => <input type="checkbox" checked={checked} onChange={onChange} />,
    Segmented,
    Tooltip: passthrough,
    Popover: passthrough,
    DatePicker: () => null,
    TimePicker: () => null,
    AutoComplete: ({ children }: any) => <>{children}</>,
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
    });

    expect(result).toEqual({ ok: false, error: '当前结果没有可用的安全行定位方式，无法提交修改。' });
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

    expect(result).toEqual({ ok: false, error: '定位列 EMAIL 的值为空，无法安全提交修改。' });
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
    backendApp.DBShowCreateTable.mockResolvedValue({ success: true, data: 'CREATE TABLE users' });
    storeState.appearance.uiVersion = 'legacy';
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
    backendApp.ImportData.mockReset();
    backendApp.ExportTable.mockReset();
    backendApp.ExportData.mockReset();
    backendApp.ExportQuery.mockReset();
    backendApp.ApplyChanges.mockReset();
    backendApp.DBGetColumns.mockReset();
    backendApp.DBGetIndexes.mockReset();
    backendApp.DBGetForeignKeys.mockReset();
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
      });
    },
  );

  it('opens the v2 column header context menu from table headers', async () => {
    storeState.appearance.uiVersion = 'v2';
    storeState.queryOptions.showColumnComment = true;
    storeState.queryOptions.showColumnType = true;
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'id', type: 'bigint', comment: '主键 ID' }],
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
    expect(textContent(renderer!.root)).toContain('复制字段名称');
    expect(textContent(renderer!.root)).toContain('复制列数据');
    expect(textContent(renderer!.root)).toContain('升序排序');
    expect(textContent(renderer!.root)).toContain('隐藏此字段');
    expect(textContent(renderer!.root)).toContain('隐藏字段类型');
    expect(textContent(renderer!.root)).toContain('隐藏字段备注');
    renderer!.unmount();
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
    expect(textContent(renderer!.root)).toContain('复制字段名称');
    expect(textContent(renderer!.root)).toContain('复制行数据');
    expect(textContent(renderer!.root)).toContain('复制列数据');
    expect(textContent(renderer!.root)).toContain('复制为 INSERT');
    expect(textContent(renderer!.root)).toContain('导出');
    renderer!.unmount();
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
      findButton(renderer!, '复制列数据').props.onClick({
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
      findButton(renderer!, '复制行数据').props.onClick({
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
      findButton(renderer!, '复制列数据').props.onClick({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('alpha\nbeta');
    renderer!.unmount();
  });

  it('switches the v2 footer field tab into the main fields view', async () => {
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
      findButton(renderer!, '字段信息').props.onClick();
    });

    const content = textContent(renderer!.root);
    expect(content).toContain('FIELDS');
    expect(content).toContain('2 个字段');
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
      findButton(renderer!, '字段信息').props.onClick();
    });
    expect(textContent(renderer!.root)).toContain('FIELDS');

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
    expect(content).not.toContain('FIELDS');
    expect(content).not.toContain('gn-v2-data-grid-fields-view');
    expect(content).toContain('数据预览');
    expect(content).toContain('结果视图');
    expect(content).toContain('字段信息');
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
    expect(textContent(editors[0])).toContain('CREATE TABLE users');
    expect(renderer!.root.findAll((node) => node.type === 'pre' && textContent(node).includes('CREATE TABLE users'))).toHaveLength(0);
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
