import { useMemo } from 'react';
import { Alert, Button, Descriptions, Empty, Space, Tag, Typography, message } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n/provider';
import { copyTextToClipboard, exportReverseScriptFile } from './dmlSnapshotClipboard';
import { buildReverseScript, type DMLSnapshotDetail, type DMLSkippedRow } from './dmlSnapshotModel';

type Translate = ReturnType<typeof useI18n>['t'];

type StatementSection = {
  key: string;
  label: string;
  statements: string[];
};

const buildStatementSections = (detail: DMLSnapshotDetail, t: Translate): StatementSection[] => [
  { key: 'deletes', label: t('dml_snapshot.detail.undo_inserts'), statements: detail.deletes },
  { key: 'updates', label: t('dml_snapshot.detail.restore_updates'), statements: detail.updates },
  { key: 'inserts', label: t('dml_snapshot.detail.restore_deletes'), statements: detail.inserts },
].filter((section) => section.statements.length > 0);

const SkippedRows = ({ rows, t }: { rows: DMLSkippedRow[]; t: Translate }) => (
  <div>
    <Typography.Title level={5}>{t('dml_snapshot.detail.skipped_title')}</Typography.Title>
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      {rows.map((row, index) => (
        <div key={`${row.group}-${row.index}-${index}`} className="gn-dml-snapshot-skipped-row">
          <Tag>{t(`dml_snapshot.detail.group.${row.group}`)}</Tag>
          <span>{t('dml_snapshot.detail.skipped_row', { index: row.index })}</span>
          <span className="gn-dml-snapshot-skipped-reason">{row.reason ? t(row.reason) : ''}</span>
        </div>
      ))}
    </Space>
  </div>
);

interface DMLSnapshotDetailBodyProps {
  detail: DMLSnapshotDetail;
}

export default function DMLSnapshotDetailBody({ detail }: DMLSnapshotDetailBodyProps) {
  const { t } = useI18n();
  const script = useMemo(() => buildReverseScript(detail), [detail]);
  const sections = useMemo(() => buildStatementSections(detail, t), [detail, t]);

  const handleCopy = async () => {
    if (!script.trim()) return;
    try {
      await copyTextToClipboard(script);
      message.success(t('dml_snapshot.copy.success'));
    } catch {
      message.error(t('dml_snapshot.copy.failed'));
    }
  };

  const handleExport = () => {
    if (!script.trim()) return;
    if (exportReverseScriptFile(detail)) {
      message.success(t('dml_snapshot.export.success'));
    } else {
      message.error(t('dml_snapshot.export.failed'));
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {!detail.cannotFullyRestore ? (
        <Alert type="success" showIcon message={t('dml_snapshot.restorable.yes')} />
      ) : (
        <Alert
          type="warning"
          showIcon
          message={t('dml_snapshot.restorable.no')}
          description={
            detail.skipped.length > 0
              ? t('dml_snapshot.summary.skipped', { count: detail.skipped.length })
              : undefined
          }
        />
      )}

      <Descriptions size="small" bordered column={2}>
        <Descriptions.Item label={t('dml_snapshot.column.time')}>{detail.createdAt || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('dml_snapshot.column.table')}>{detail.table || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('dml_snapshot.column.connection')}>{detail.connection || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('dml_snapshot.column.database')}>{detail.dbName || '-'}</Descriptions.Item>
      </Descriptions>

      {sections.length === 0 ? (
        <Empty description={t('dml_snapshot.detail.no_statements')} />
      ) : (
        <>
          <Alert type="info" showIcon message={t('dml_snapshot.detail.replay_order')} />
          {sections.map((section) => (
            <div key={section.key} className="gn-dml-snapshot-script-block">
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                {section.label}
                <Tag style={{ marginLeft: 8 }}>{section.statements.length}</Tag>
              </Typography.Title>
              <pre className="gn-dml-snapshot-sql">{section.statements.join('\n')}</pre>
            </div>
          ))}
        </>
      )}

      {detail.skipped.length > 0 ? <SkippedRows rows={detail.skipped} t={t} /> : null}

      <Space>
        <Button icon={<CopyOutlined />} onClick={() => void handleCopy()} disabled={!script.trim()}>
          {t('dml_snapshot.action.copy')}
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!script.trim()}>
          {t('dml_snapshot.action.export')}
        </Button>
      </Space>
    </Space>
  );
}
