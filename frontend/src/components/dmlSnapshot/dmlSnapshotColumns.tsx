import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { I18nParams } from '../../i18n/types';
import type { DMLSnapshotSummary } from './dmlSnapshotModel';

type Translate = (key: string, params?: I18nParams) => string;

export const buildDMLSnapshotColumns = (
  t: Translate,
  onView: (id: string) => void,
): ColumnsType<DMLSnapshotSummary> => [
  {
    title: t('dml_snapshot.column.time'),
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 200,
    render: (value: string) => value || '-',
  },
  {
    title: t('dml_snapshot.column.table'),
    dataIndex: 'table',
    key: 'table',
    width: 180,
    render: (value: string) => value || '-',
  },
  {
    title: t('dml_snapshot.column.connection'),
    dataIndex: 'connection',
    key: 'connection',
    width: 160,
    render: (value: string) => value || '-',
  },
  {
    title: t('dml_snapshot.column.statements'),
    dataIndex: 'statementCount',
    key: 'statementCount',
    width: 140,
    render: (_: number, record) => t('dml_snapshot.summary.statements', { count: record.statementCount }),
  },
  {
    title: t('dml_snapshot.column.restorable'),
    key: 'restorable',
    width: 180,
    render: (_: unknown, record) => (
      record.cannotFullyRestore ? (
        <Tag color="warning">{t('dml_snapshot.restorable.no')}</Tag>
      ) : (
        <Tag color="success">{t('dml_snapshot.restorable.yes')}</Tag>
      )
    ),
  },
  {
    title: '',
    key: 'actions',
    width: 100,
    render: (_: unknown, record) => (
      <Button type="link" size="small" onClick={() => void onView(record.id)}>
        {t('dml_snapshot.action.view')}
      </Button>
    ),
  },
];
