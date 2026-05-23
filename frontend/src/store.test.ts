import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const importStore = async () => {
  const store = await import('./store');
  await store.useStore.persist.rehydrate();
  return store;
};

describe('store appearance persistence', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('fills missing DataGrid appearance settings with defaults during hydration', async () => {
    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        appearance: {
          enabled: false,
          opacity: 0.75,
          blur: 6,
          useNativeMacWindowControls: true,
        },
      },
      version: 7,
    }));

    const { useStore } = await importStore();
    const appearance = useStore.getState().appearance;

    expect(appearance.uiVersion).toBe('legacy');
    expect(appearance.enabled).toBe(false);
    expect(appearance.opacity).toBe(0.75);
    expect(appearance.blur).toBe(6);
    expect(appearance.useNativeMacWindowControls).toBe(true);
    expect(appearance.showDataTableVerticalBorders).toBe(false);
    expect(appearance.dataTableDensity).toBe('comfortable');
    expect(appearance.dataTableFontSize).toBeNull();
    expect(appearance.dataTableFontSizeFollowGlobal).toBe(true);
    expect(appearance.sidebarTreeFontSize).toBeNull();
    expect(appearance.sidebarTreeFontSizeFollowGlobal).toBe(true);
  });

  it('persists DataGrid appearance settings and restores them after reload', async () => {
    const { useStore } = await importStore();

    useStore.getState().setAppearance({
      showDataTableVerticalBorders: true,
      dataTableDensity: 'compact',
    });

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.appearance.showDataTableVerticalBorders).toBe(true);
    expect(persisted.state.appearance.dataTableDensity).toBe('compact');

    vi.resetModules();
    const reloaded = await importStore();
    const appearance = reloaded.useStore.getState().appearance;

    expect(appearance.showDataTableVerticalBorders).toBe(true);
    expect(appearance.dataTableDensity).toBe('compact');
  });

  it('does not clear persisted legacy connections during hydration migration', async () => {
    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        connections: [
          {
            id: 'legacy-1',
            name: 'Legacy',
            config: {
              id: 'legacy-1',
              type: 'postgres',
              host: 'db.local',
              port: 5432,
              user: 'postgres',
              password: 'secret',
            },
          },
        ],
      },
      version: 7,
    }));

    const { useStore } = await importStore();

    expect(useStore.getState().connections).toHaveLength(1);
    expect(useStore.getState().connections[0]?.config.password).toBe('secret');
  });

  it('does not fail hydration when persisted OceanBase connection uses unsupported native protocol', async () => {
    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        connections: [
          {
            id: 'oceanbase-native',
            name: 'OceanBase Native',
            config: {
              id: 'oceanbase-native',
              type: 'oceanbase',
              host: 'ob.local',
              port: 2881,
              user: 'root@test',
              oceanBaseProtocol: 'mysql',
              connectionParams: 'protocol=native',
            },
          },
        ],
      },
      version: 9,
    }));

    const { useStore } = await importStore();
    const config = useStore.getState().connections[0]?.config;

    expect(useStore.getState().connections).toHaveLength(1);
    expect(config?.connectionParams).toBe('protocol=native');
    expect(config?.oceanBaseProtocol).toBe('mysql');
  });

  it('preserves JVM Arthas diagnostic config when replacing saved connections', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'jvm-1',
        name: 'Orders JVM',
        config: {
          id: 'jvm-1',
          type: 'jvm',
          host: '127.0.0.1',
          port: 9010,
          user: '',
          jvm: {
            allowedModes: ['jmx'],
            preferredMode: 'jmx',
            diagnostic: {
              enabled: true,
              transport: 'arthas-tunnel',
              baseUrl: 'http://127.0.0.1:7777',
              targetId: 'gonavi-local-test',
              apiKey: 'diag-token',
              allowObserveCommands: true,
              allowTraceCommands: true,
              allowMutatingCommands: false,
              timeoutSeconds: 20,
            },
          },
        },
      },
    ]);

    expect(useStore.getState().connections[0]?.config.jvm?.diagnostic).toEqual({
      enabled: true,
      transport: 'arthas-tunnel',
      baseUrl: 'http://127.0.0.1:7777',
      targetId: 'gonavi-local-test',
      apiKey: 'diag-token',
      allowObserveCommands: true,
      allowTraceCommands: true,
      allowMutatingCommands: false,
      timeoutSeconds: 20,
    });
  });

  it('preserves connection icon metadata when replacing saved connections', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'visual-1',
        name: 'Visual Orders',
        iconType: 'postgres',
        iconColor: '#2f855a',
        config: {
          id: 'visual-1',
          type: 'mysql',
          host: 'db.local',
          port: 3306,
          user: 'root',
        },
      },
    ]);

    expect(useStore.getState().connections[0]?.iconType).toBe('postgres');
    expect(useStore.getState().connections[0]?.iconColor).toBe('#2f855a');
  });

  it('normalizes ClickHouse protocol override when replacing saved connections', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'clickhouse-http',
        name: 'ClickHouse HTTP',
        config: {
          id: 'clickhouse-http',
          type: 'clickhouse',
          host: 'clickhouse.local',
          port: 8125,
          user: 'default',
          clickHouseProtocol: 'https' as any,
        },
      },
    ]);

    expect(useStore.getState().connections[0]?.config.clickHouseProtocol).toBe(
      'http',
    );
  });

  it('keeps StarRocks saved connections as independent datasource type', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'starrocks-fe',
        name: 'StarRocks FE',
        config: {
          id: 'starrocks-fe',
          type: 'starrocks',
          host: 'starrocks.local',
          port: 9030,
          user: 'root',
        },
      },
    ]);

    const config = useStore.getState().connections[0]?.config;
    expect(config?.type).toBe('starrocks');
    expect(config?.port).toBe(9030);
  });

  it('keeps InterSystems IRIS saved connections as independent datasource type', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'iris-user',
        name: 'IRIS USER',
        config: {
          id: 'iris-user',
          type: 'iris',
          host: 'iris.local',
          port: 1972,
          user: '_SYSTEM',
          database: 'USER',
        },
      },
      {
        id: 'iris-alias',
        name: 'IRIS Alias',
        config: {
          id: 'iris-alias',
          type: 'InterSystemsIRIS',
          host: 'iris-alias.local',
          port: 1972,
          user: '_SYSTEM',
          database: 'USER',
        },
      },
    ]);

    const connections = useStore.getState().connections;
    expect(connections[0]?.config.type).toBe('iris');
    expect(connections[0]?.config.port).toBe(1972);
    expect(connections[1]?.config.type).toBe('iris');
  });

  it('normalizes saved connection type aliases without falling back to mysql', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      { id: 'pg', name: 'Postgres', config: { id: 'pg', type: 'PostgreSQL', host: 'pg.local', port: 5432, user: 'postgres' } },
      { id: 'mssql', name: 'MSSQL', config: { id: 'mssql', type: 'mssql', host: 'sql.local', port: 1433, user: 'sa' } },
      { id: 'kingbase', name: 'Kingbase', config: { id: 'kingbase', type: 'kingbase8', host: 'kingbase.local', port: 54321, user: 'system' } },
      { id: 'dm', name: 'Dameng', config: { id: 'dm', type: 'dm8', host: 'dm.local', port: 5236, user: 'SYSDBA' } },
      { id: 'sqlite', name: 'SQLite', config: { id: 'sqlite', type: 'sqlite3', host: 'D:/db/app.sqlite', port: 0, user: '' } },
    ]);

    expect(useStore.getState().connections.map((conn) => conn.config.type)).toEqual([
      'postgres',
      'sqlserver',
      'kingbase',
      'dameng',
      'sqlite',
    ]);
  });

  it('preserves SSL certificate paths for SSL-capable saved connections', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'postgres-ssl',
        name: 'Postgres SSL',
        config: {
          id: 'postgres-ssl',
          type: 'postgres',
          host: 'db.local',
          port: 5432,
          user: 'postgres',
          useSSL: true,
          sslMode: 'required',
          sslCAPath: 'C:/certs/ca.pem',
          sslCertPath: 'C:/certs/client-cert.pem',
          sslKeyPath: 'C:/certs/client-key.pem',
        },
      },
    ]);

    const config = useStore.getState().connections[0]?.config;
    expect(config?.sslCAPath).toBe('C:/certs/ca.pem');
    expect(config?.sslCertPath).toBe('C:/certs/client-cert.pem');
    expect(config?.sslKeyPath).toBe('C:/certs/client-key.pem');
  });

  it('normalizes OceanBase protocol override when replacing saved connections', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'oceanbase-oracle',
        name: 'OceanBase Oracle',
        config: {
          id: 'oceanbase-oracle',
          type: 'oceanbase',
          host: 'ob.local',
          port: 2881,
          user: 'sys@oracle001',
          oceanBaseProtocol: 'oracle',
        },
      },
    ]);

    expect(useStore.getState().connections[0]?.config.oceanBaseProtocol).toBe(
      'oracle',
    );
  });

  it('restores OceanBase protocol from saved URI or connection params', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'oceanbase-uri-oracle',
        name: 'OceanBase URI Oracle',
        config: {
          id: 'oceanbase-uri-oracle',
          type: 'oceanbase',
          host: 'ob.local',
          port: 2881,
          user: 'sys@oracle001',
          uri: 'oceanbase://sys%40oracle001:pass@ob.local:2881/OBORCL?protocol=oracle',
        },
      },
      {
        id: 'oceanbase-param-oracle',
        name: 'OceanBase Param Oracle',
        config: {
          id: 'oceanbase-param-oracle',
          type: 'oceanbase',
          host: 'ob.local',
          port: 2881,
          user: 'sys@oracle001',
          connectionParams: 'tenantMode=oracle&PREFETCH_ROWS=5000',
        },
      },
    ]);

    expect(useStore.getState().connections[0]?.config.oceanBaseProtocol).toBe(
      'oracle',
    );
    expect(useStore.getState().connections[1]?.config.oceanBaseProtocol).toBe(
      'oracle',
    );
  });

  it('prefers OceanBase protocol query key over legacy aliases when restoring saved connections', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'oceanbase-conflict',
        name: 'OceanBase Conflict',
        config: {
          id: 'oceanbase-conflict',
          type: 'oceanbase',
          host: 'ob.local',
          port: 2881,
          user: 'root@test',
          connectionParams: 'protocol=mysql&tenantMode=oracle',
        },
      },
    ]);

    expect(useStore.getState().connections[0]?.config.oceanBaseProtocol).toBe(
      'mysql',
    );
  });

  it('keeps saved OceanBase native protocol loadable for connect-time rejection', async () => {
    const { useStore } = await importStore();

    expect(() => useStore.getState().replaceConnections([
      {
        id: 'oceanbase-native',
        name: 'OceanBase Native',
        config: {
          id: 'oceanbase-native',
          type: 'oceanbase',
          host: 'ob.local',
          port: 2881,
          user: 'root@test',
          oceanBaseProtocol: 'mysql',
          connectionParams: 'protocol=native',
        },
      },
    ])).not.toThrow();
    expect(useStore.getState().connections[0]?.config.connectionParams).toBe(
      'protocol=native',
    );
    expect(useStore.getState().connections[0]?.config.oceanBaseProtocol).toBe(
      'mysql',
    );
  });

  it('normalizes OceanBase protocol when updating a saved connection', async () => {
    const { useStore } = await importStore();

    useStore.getState().replaceConnections([
      {
        id: 'oceanbase-existing',
        name: 'OceanBase Existing',
        config: {
          id: 'oceanbase-existing',
          type: 'oceanbase',
          host: 'ob.local',
          port: 2881,
          user: 'root@test',
          connectionParams: 'protocol=mysql',
        },
      },
    ]);

    useStore.getState().updateConnection({
      id: 'oceanbase-existing',
      name: 'OceanBase Existing',
      config: {
        id: 'oceanbase-existing',
        type: 'oceanbase',
        host: 'ob.local',
        port: 2881,
        user: 'sys@oracle001',
        connectionParams: 'protocol=oracle',
      },
    });

    expect(useStore.getState().connections[0]?.config.oceanBaseProtocol).toBe(
      'oracle',
    );
  });

  it('keeps legacy global proxy password during hydration until explicit cleanup', async () => {
    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        globalProxy: {
          enabled: true,
          type: 'http',
          host: '127.0.0.1',
          port: 8080,
          user: 'ops',
          password: 'proxy-secret',
        },
      },
      version: 7,
    }));

    const { useStore } = await importStore();

    expect(useStore.getState().globalProxy.password).toBe('proxy-secret');
    expect(useStore.getState().globalProxy.hasPassword).toBe(true);
  });

  it('persists external SQL directories and restores valid items after reload', async () => {
    const { useStore } = await importStore();

    useStore.getState().saveExternalSQLDirectory({
      id: 'ext-1',
      name: 'scripts',
      path: 'D:/sql/scripts',
      connectionId: 'conn-1',
      dbName: 'demo',
      createdAt: 1,
    });

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.externalSQLDirectories).toEqual([
      {
        id: 'ext-1',
        name: 'scripts',
        path: 'D:/sql/scripts',
        connectionId: 'conn-1',
        dbName: 'demo',
        createdAt: 1,
      },
    ]);

    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        externalSQLDirectories: [
          persisted.state.externalSQLDirectories[0],
          { path: '', name: 'broken' },
        ],
      },
      version: 7,
    }));

    vi.resetModules();
    const reloaded = await importStore();
    expect(reloaded.useStore.getState().externalSQLDirectories).toEqual([
      {
        id: 'ext-1',
        name: 'scripts',
        path: 'D:/sql/scripts',
        connectionId: 'conn-1',
        dbName: 'demo',
        createdAt: 1,
      },
    ]);
  });

  it('persists open query tab drafts and restores them after reload', async () => {
    const { useStore } = await importStore();

    useStore.getState().addTab({
      id: 'query-tab-1',
      title: '临时 SQL',
      type: 'query',
      connectionId: 'conn-1',
      dbName: 'main',
      query: 'select * from users where id = 1;',
    });
    useStore.getState().updateQueryTabDraft('query-tab-1', {
      query: 'select * from orders where status = "paid";',
      connectionId: 'conn-2',
      dbName: 'reporting',
    });

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.tabs).toEqual([
      expect.objectContaining({
        id: 'query-tab-1',
        title: '临时 SQL',
        type: 'query',
        connectionId: 'conn-2',
        dbName: 'reporting',
        query: 'select * from orders where status = "paid";',
      }),
    ]);
    expect(persisted.state.activeTabId).toBe('query-tab-1');

    vi.resetModules();
    const reloaded = await importStore();
    expect(reloaded.useStore.getState().tabs).toEqual([
      expect.objectContaining({
        id: 'query-tab-1',
        type: 'query',
        connectionId: 'conn-2',
        dbName: 'reporting',
        query: 'select * from orders where status = "paid";',
      }),
    ]);
    expect(reloaded.useStore.getState().activeTabId).toBe('query-tab-1');
  });

  it('only restores persisted query tabs with useful SQL state', async () => {
    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        tabs: [
          {
            id: 'query-1',
            title: '有效 SQL',
            type: 'query',
            connectionId: 'conn-1',
            dbName: 'main',
            query: 'select 1;',
          },
          {
            id: 'table-1',
            title: 'users',
            type: 'table',
            connectionId: 'conn-1',
            dbName: 'main',
            tableName: 'users',
          },
          {
            id: 'empty-query',
            title: '空查询',
            type: 'query',
            connectionId: 'conn-1',
            dbName: 'main',
            query: '   ',
          },
        ],
        activeTabId: 'table-1',
      },
      version: 9,
    }));

    const { useStore } = await importStore();

    expect(useStore.getState().tabs).toEqual([
      expect.objectContaining({
        id: 'query-1',
        type: 'query',
        query: 'select 1;',
      }),
    ]);
    expect(useStore.getState().activeTabId).toBe('query-1');
  });

  it('persists recent SQL execution logs and trims oversized entries', async () => {
    const { useStore } = await importStore();
    const longSql = `select '${'x'.repeat(120 * 1024)}'`;

    useStore.getState().addSqlLog({
      id: 'log-1',
      timestamp: 100,
      sql: longSql,
      status: 'success',
      duration: 12,
      dbName: 'main',
    });

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.sqlLogs).toHaveLength(1);
    expect(persisted.state.sqlLogs[0].sql.length).toBe(100 * 1024);
    expect(persisted.state.sqlLogs[0].dbName).toBe('main');

    vi.resetModules();
    const reloaded = await importStore();
    expect(reloaded.useStore.getState().sqlLogs[0]).toEqual(expect.objectContaining({
      id: 'log-1',
      status: 'success',
      duration: 12,
      dbName: 'main',
    }));
    expect(reloaded.useStore.getState().sqlLogs[0]?.sql.length).toBe(100 * 1024);
  });

  it('defaults AI chat send shortcut to Enter in shared shortcut options', async () => {
    const { useStore } = await importStore();

    expect(useStore.getState().shortcutOptions.sendAIChatMessage).toEqual({
      mac: { combo: 'Enter', enabled: true },
      windows: { combo: 'Enter', enabled: true },
    });
  });

  it('persists recorded AI chat send shortcut and restores it after reload', async () => {
    const { useStore } = await importStore();

    useStore.getState().updateShortcut('sendAIChatMessage', {
      combo: 'Meta+Enter',
      enabled: true,
    }, 'mac');

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.shortcutOptions.sendAIChatMessage).toEqual({
      mac: { combo: 'Meta+Enter', enabled: true },
      windows: { combo: 'Enter', enabled: true },
    });

    vi.resetModules();
    const reloaded = await importStore();
    expect(reloaded.useStore.getState().shortcutOptions.sendAIChatMessage).toEqual({
      mac: { combo: 'Meta+Enter', enabled: true },
      windows: { combo: 'Enter', enabled: true },
    });
  });

  it('falls back to Enter when persisted AI chat send shortcut is invalid', async () => {
    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        shortcutOptions: {
          sendAIChatMessage: {
            combo: 'A',
            enabled: true,
          },
        },
      },
      version: 8,
    }));

    const { useStore } = await importStore();

    expect(useStore.getState().shortcutOptions.sendAIChatMessage).toEqual({
      mac: { combo: 'Enter', enabled: true },
      windows: { combo: 'Enter', enabled: true },
    });
  });

  it('does not overwrite recorded AI chat send shortcut during startup config refresh', async () => {
    const { useStore } = await importStore();
    useStore.getState().updateShortcut('sendAIChatMessage', {
      combo: 'Ctrl+Enter',
      enabled: true,
    }, 'windows');

    useStore.getState().replaceConnections([]);

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.shortcutOptions.sendAIChatMessage).toEqual({
      mac: { combo: 'Enter', enabled: true },
      windows: { combo: 'Ctrl+Enter', enabled: true },
    });
  });

  it('keeps persisted AI chat send shortcut when startup refresh runs before shortcut hydration catches up', async () => {
    const { useStore } = await importStore();
    const shortcutOptions = useStore.getState().shortcutOptions;
    storage.setItem('lite-db-storage', JSON.stringify({
      state: {
        shortcutOptions: {
          ...shortcutOptions,
          sendAIChatMessage: {
            mac: { combo: 'Meta+Enter', enabled: true },
            windows: { combo: 'Ctrl+Enter', enabled: true },
          },
        },
      },
      version: 8,
    }));
    useStore.setState({
      shortcutOptions: {
        ...shortcutOptions,
        sendAIChatMessage: {
          mac: { combo: 'Enter', enabled: true },
          windows: { combo: 'Enter', enabled: true },
        },
      },
    });

    useStore.getState().replaceConnections([]);

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.shortcutOptions.sendAIChatMessage).toEqual({
      mac: { combo: 'Meta+Enter', enabled: true },
      windows: { combo: 'Ctrl+Enter', enabled: true },
    });
  });

  it('does not let a stale default shortcut state overwrite an explicitly recorded AI chat shortcut', async () => {
    const { useStore } = await importStore();
    const shortcutOptions = useStore.getState().shortcutOptions;

    useStore.getState().updateShortcut('sendAIChatMessage', {
      combo: 'Meta+Enter',
      enabled: true,
    }, 'mac');
    useStore.setState({
      shortcutOptions: {
        ...shortcutOptions,
        sendAIChatMessage: {
          mac: { combo: 'Enter', enabled: true },
          windows: { combo: 'Enter', enabled: true },
        },
      },
    });
    useStore.getState().replaceGlobalProxy({});

    const persisted = JSON.parse(storage.getItem('lite-db-storage') || '{}');
    expect(persisted.state.shortcutOptions.sendAIChatMessage).toEqual({
      mac: { combo: 'Meta+Enter', enabled: true },
      windows: { combo: 'Enter', enabled: true },
    });
  });
});
