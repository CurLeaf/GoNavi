import { describe, expect, it } from 'vitest';

import type { SavedConnection, TabData } from '../../types';
import { buildConnectionCapabilitiesSnapshot } from './aiConnectionCapabilitiesInsights';

describe('aiConnectionCapabilitiesInsights', () => {
  it('builds the current connection capability snapshot from active context', () => {
    const connections: SavedConnection[] = [{
      id: 'conn-1',
      name: '订单主库',
      config: {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
      },
    }];

    const snapshot = buildConnectionCapabilitiesSnapshot({
      activeContext: {
        connectionId: 'conn-1',
        dbName: 'crm',
      },
      connections,
    });

    if (!snapshot.hasConnection || !snapshot.capabilities) {
      throw new Error('expected active connection snapshot');
    }

    expect(snapshot.hasConnection).toBe(true);
    expect(snapshot.resolvedFrom).toBe('activeContext');
    expect(snapshot.connectionName).toBe('订单主库');
    expect(snapshot.resolvedType).toBe('mysql');
    expect(snapshot.capabilities.supportsQueryEditor).toBe(true);
    expect(snapshot.capabilities.supportsCreateDatabase).toBe(true);
    expect(snapshot.capabilities.supportsRenameDatabase).toBe(false);
    expect(snapshot.restrictions).toContain('rename_database_hidden');
  });

  it('supports inspecting an explicit saved connection and resolves Oracle-like OceanBase capabilities', () => {
    const connections: SavedConnection[] = [{
      id: 'conn-ob',
      name: 'OceanBase Oracle 租户',
      config: {
        type: 'custom',
        driver: 'oceanbase',
        oceanBaseProtocol: 'oracle',
        host: '10.0.0.18',
        port: 2881,
        user: 'sys',
      },
    }];
    const tabs: TabData[] = [{
      id: 'tab-1',
      title: '示例页签',
      type: 'query',
      connectionId: 'conn-ob',
      dbName: 'SYS',
      query: 'select 1',
    }];

    const snapshot = buildConnectionCapabilitiesSnapshot({
      connectionId: 'conn-ob',
      tabs,
      activeTabId: 'tab-1',
      connections,
    });

    if (!snapshot.hasConnection || !snapshot.capabilities) {
      throw new Error('expected explicit connection snapshot');
    }

    expect(snapshot.hasConnection).toBe(true);
    expect(snapshot.resolvedFrom).toBe('explicit');
    expect(snapshot.resolvedType).toBe('oracle');
    expect(snapshot.capabilities.supportsCreateDatabase).toBe(false);
    expect(snapshot.capabilities.supportsDropDatabase).toBe(false);
    expect(snapshot.restrictions).toContain('create_database_hidden');
    expect(snapshot.restrictions).toContain('drop_database_hidden');
  });
});
