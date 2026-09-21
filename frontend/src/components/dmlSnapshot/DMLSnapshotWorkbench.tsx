import { useMemo } from 'react';
import { Alert, Button, Empty, Space, Table, Typography } from 'antd';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import { buildDMLSnapshotColumns } from './dmlSnapshotColumns';
import DMLSnapshotDetailDrawer from './DMLSnapshotDetailDrawer';
import { useDMLSnapshotWorkbench } from './useDMLSnapshotWorkbench';
import type { DMLSnapshotBackend } from './dmlSnapshotRpc';
import './DMLSnapshotWorkbench.css';

interface DMLSnapshotWorkbenchProps {
  backend?: DMLSnapshotBackend;
  isActive?: boolean;
}

export default function DMLSnapshotWorkbench({
  backend: backendOverride,
  isActive = true,
}: DMLSnapshotWorkbenchProps) {
  const {
    t,
    summaries,
    loading,
    loadError,
    detailOpen,
    detailLoading,
    detail,
    detailError,
    refresh,
    openDetail,
    closeDetail,
  } = useDMLSnapshotWorkbench(backendOverride);

  const columns = useMemo(
    () => buildDMLSnapshotColumns(t, (id) => void openDetail(id)),
    [openDetail, t],
  );

  return (
    <section className="gn-dml-snapshot-workbench" aria-label={t('dml_snapshot.workbench.aria_label')}>
      <header className="gn-dml-snapshot-header">
        <div className="gn-dml-snapshot-title-group">
          <span className="gn-dml-snapshot-title-icon"><HistoryOutlined /></span>
          <div className="gn-dml-snapshot-title-copy">
            <Typography.Title level={4}>{t('dml_snapshot.workbench.title')}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
              {t('dml_snapshot.workbench.description')}
            </Typography.Paragraph>
          </div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
          {t('dml_snapshot.action.refresh')}
        </Button>
      </header>

      <Alert
        type="warning"
        showIcon
        message={t('dml_snapshot.notice.title')}
        description={(
          <Space direction="vertical" size={2}>
            <span>{t('dml_snapshot.notice.manual')}</span>
            <span>{t('dml_snapshot.notice.concurrent')}</span>
            <span>{t('dml_snapshot.notice.conflict')}</span>
            <span>{t('dml_snapshot.notice.trigger')}</span>
            <span>{t('dml_snapshot.notice.retention')}</span>
          </Space>
        )}
      />

      {/* 失败时只显示错误，不再叠加一个"无数据"表格 —— 那会让人以为快照真的为空。 */}
      {loadError ? <Alert type="error" showIcon message={loadError} /> : null}

      {loadError ? null : !loading && summaries.length === 0 ? (
        <Empty
          description={(
            <Space direction="vertical" size={2}>
              <span>{t('dml_snapshot.empty')}</span>
              <Typography.Text type="secondary">{t('dml_snapshot.empty_hint')}</Typography.Text>
            </Space>
          )}
        />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={loading && isActive}
          columns={columns}
          dataSource={summaries}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
        />
      )}

      <DMLSnapshotDetailDrawer
        open={detailOpen}
        loading={detailLoading}
        detail={detail}
        error={detailError}
        onClose={closeDetail}
      />
    </section>
  );
}
