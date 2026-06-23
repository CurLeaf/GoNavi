import { describe, expect, it } from 'vitest';
import {
  buildErDiagramGraph,
  extractErTableNames,
  normalizeForeignKeyDefinitions,
  resolveErActualTableName,
  tableNamesMatch,
  type ErDiagramTableSnapshot,
} from './dataGridErDiagramModel';

describe('dataGridErDiagramModel', () => {
  it('builds a one-hop ER graph with incoming and outgoing relations', () => {
    const currentSnapshot: ErDiagramTableSnapshot = {
      tableName: 'orders',
      columns: [
        { name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI', extra: '', comment: 'pk' },
        { name: 'customer_id', type: 'bigint', nullable: 'NO', key: '', extra: '', comment: 'customer fk' },
        { name: 'order_no', type: 'varchar(32)', nullable: 'NO', key: '', extra: '', comment: '' },
        { name: 'created_at', type: 'datetime', nullable: 'NO', key: '', extra: '', comment: '' },
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
    };

    const relatedSnapshots: ErDiagramTableSnapshot[] = [
      {
        tableName: 'customers',
        columns: [
          { name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI', extra: '', comment: '' },
          { name: 'name', type: 'varchar(120)', nullable: 'NO', key: '', extra: '', comment: '' },
        ],
        foreignKeys: [],
        uniqueKeyGroups: [['id']],
      },
      {
        tableName: 'order_items',
        columns: [
          { name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI', extra: '', comment: '' },
          { name: 'order_id', type: 'bigint', nullable: 'NO', key: '', extra: '', comment: '' },
          { name: 'sku', type: 'varchar(64)', nullable: 'NO', key: '', extra: '', comment: '' },
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
    ];

    const graph = buildErDiagramGraph({
      currentTableName: 'orders',
      currentSnapshot,
      relatedSnapshots,
      relations: [
        {
          sourceTableName: 'orders',
          targetTableName: 'customers',
          columnName: 'customer_id',
          refColumnName: 'id',
          constraintName: 'fk_orders_customer',
          direction: 'outgoing',
        },
        {
          sourceTableName: 'order_items',
          targetTableName: 'orders',
          columnName: 'order_id',
          refColumnName: 'id',
          constraintName: 'fk_items_order',
          direction: 'incoming',
        },
      ],
    });

    expect(graph.relatedTableCount).toBe(2);
    expect(graph.relationCount).toBe(2);
    expect(graph.incomingTableCount).toBe(1);
    expect(graph.outgoingTableCount).toBe(1);

    const ordersNode = graph.nodes.find((node) => node.tableName === 'orders');
    const customersNode = graph.nodes.find((node) => node.tableName === 'customers');
    const itemsNode = graph.nodes.find((node) => node.tableName === 'order_items');

    expect(ordersNode?.role).toBe('current');
    expect(customersNode?.role).toBe('outgoing');
    expect(itemsNode?.role).toBe('incoming');
    expect(ordersNode?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['id', 'customer_id']),
    );
    expect(ordersNode?.columns.find((column) => column.name === 'id')?.isPrimary).toBe(true);
    expect(ordersNode?.columns.find((column) => column.name === 'customer_id')?.isForeign).toBe(true);
    expect(graph.edges.map((edge) => edge.label)).toEqual(
      expect.arrayContaining(['customer_id -> id', 'order_id -> id']),
    );
  });

  it('normalizes qualified table names and foreign key rows', () => {
    expect(tableNamesMatch('public.orders', 'orders')).toBe(true);
    expect(resolveErActualTableName('orders', ['public.orders', 'audit.orders_archive'])).toBe('public.orders');
    expect(extractErTableNames([{ Tables_in_main: 'orders' }, { Table: 'public.customers' }])).toEqual([
      'orders',
      'public.customers',
    ]);
    expect(normalizeForeignKeyDefinitions([
      {
        ColumnName: 'customer_id',
        RefTableName: 'public.customers',
        RefColumnName: 'id',
        ConstraintName: 'fk_orders_customer',
      },
    ])).toEqual([
      {
        name: '',
        columnName: 'customer_id',
        refTableName: 'public.customers',
        refColumnName: 'id',
        constraintName: 'fk_orders_customer',
      },
    ]);
  });

  it('keeps all fields in the node model while exposing a collapsed preview count', () => {
    const currentSnapshot: ErDiagramTableSnapshot = {
      tableName: 'messages',
      columns: Array.from({ length: 12 }, (_, index) => ({
        name: `col_${index + 1}`,
        type: 'varchar(32)',
        nullable: index === 0 ? 'NO' : 'YES',
        key: index === 0 ? 'PRI' : '',
        extra: '',
        comment: '',
      })),
      foreignKeys: [],
      uniqueKeyGroups: [['col_1']],
    };

    const graph = buildErDiagramGraph({
      currentTableName: 'messages',
      currentSnapshot,
      relatedSnapshots: [],
      relations: [],
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.columns).toHaveLength(12);
    expect(graph.nodes[0]?.previewColumnCount).toBe(10);
    expect(graph.nodes[0]?.hiddenColumnCount).toBe(2);
  });
});
