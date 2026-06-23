import { describe, expect, it, vi } from 'vitest';
import type { ErDiagramTableSnapshot } from './dataGridErDiagramModel';
import { collectErDiagramNeighborhood } from './useDataGridErDiagram';

const SNAPSHOTS: Record<string, ErDiagramTableSnapshot> = {
  orders: {
    tableName: 'orders',
    columns: [
      { name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI', extra: '', comment: '' },
      { name: 'customer_id', type: 'bigint', nullable: 'NO', key: '', extra: '', comment: '' },
    ],
    foreignKeys: [
      {
        name: 'fk_orders_customer',
        columnName: 'customer_id',
        refTableName: 'customers',
        refColumnName: 'id',
        constraintName: 'fk_orders_customer',
      },
    ],
    uniqueKeyGroups: [['id']],
  },
  customers: {
    tableName: 'customers',
    columns: [
      { name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI', extra: '', comment: '' },
      { name: 'region_id', type: 'bigint', nullable: 'NO', key: '', extra: '', comment: '' },
    ],
    foreignKeys: [
      {
        name: 'fk_customers_region',
        columnName: 'region_id',
        refTableName: 'regions',
        refColumnName: 'id',
        constraintName: 'fk_customers_region',
      },
    ],
    uniqueKeyGroups: [['id']],
  },
  order_items: {
    tableName: 'order_items',
    columns: [
      { name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI', extra: '', comment: '' },
      { name: 'order_id', type: 'bigint', nullable: 'NO', key: '', extra: '', comment: '' },
    ],
    foreignKeys: [
      {
        name: 'fk_items_order',
        columnName: 'order_id',
        refTableName: 'orders',
        refColumnName: 'id',
        constraintName: 'fk_items_order',
      },
    ],
    uniqueKeyGroups: [['id']],
  },
  regions: {
    tableName: 'regions',
    columns: [
      { name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI', extra: '', comment: '' },
      { name: 'name', type: 'varchar(64)', nullable: 'NO', key: '', extra: '', comment: '' },
    ],
    foreignKeys: [],
    uniqueKeyGroups: [['id']],
  },
};

describe('collectErDiagramNeighborhood', () => {
  it('expands the graph hop by hop and reports whether another layer exists', async () => {
    const loadSnapshot = vi.fn(async (tableName: string) => {
      const snapshot = SNAPSHOTS[tableName];
      if (!snapshot) {
        throw new Error(`Unknown snapshot: ${tableName}`);
      }
      return snapshot;
    });
    const loadForeignKeys = vi.fn(async (tableName: string) => {
      const snapshot = SNAPSHOTS[tableName];
      if (!snapshot) {
        throw new Error(`Unknown foreign keys: ${tableName}`);
      }
      return snapshot.foreignKeys;
    });

    const oneHop = await collectErDiagramNeighborhood({
      currentSnapshot: SNAPSHOTS.orders,
      schemaTableNames: ['orders', 'customers', 'order_items', 'regions'],
      relationDepth: 1,
      loadSnapshot,
      loadForeignKeys,
      resolveTableName: (tableName) => tableName,
    });

    expect(oneHop.relatedSnapshots.map((snapshot) => snapshot.tableName)).toEqual(
      expect.arrayContaining(['customers', 'order_items']),
    );
    expect(oneHop.relatedSnapshots.map((snapshot) => snapshot.tableName)).not.toContain('regions');
    expect(oneHop.relations.map((relation) => `${relation.sourceTableName}->${relation.targetTableName}`)).toEqual(
      expect.arrayContaining(['orders->customers', 'order_items->orders']),
    );
    expect(oneHop.canExpandRelations).toBe(true);

    const twoHop = await collectErDiagramNeighborhood({
      currentSnapshot: SNAPSHOTS.orders,
      schemaTableNames: ['orders', 'customers', 'order_items', 'regions'],
      relationDepth: 2,
      loadSnapshot,
      loadForeignKeys,
      resolveTableName: (tableName) => tableName,
    });

    expect(twoHop.relatedSnapshots.map((snapshot) => snapshot.tableName)).toEqual(
      expect.arrayContaining(['customers', 'order_items', 'regions']),
    );
    expect(twoHop.relations.map((relation) => `${relation.sourceTableName}->${relation.targetTableName}`)).toEqual(
      expect.arrayContaining(['customers->regions']),
    );
    expect(twoHop.canExpandRelations).toBe(false);
  });
});
