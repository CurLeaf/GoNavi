import { Alert, Drawer, Empty } from 'antd';
import { useI18n } from '../../i18n/provider';
import type { DMLSnapshotDetail } from './dmlSnapshotModel';
import DMLSnapshotDetailBody from './DMLSnapshotDetailBody';

interface DMLSnapshotDetailDrawerProps {
  open: boolean;
  loading: boolean;
  detail: DMLSnapshotDetail | null;
  error: string;
  onClose: () => void;
}

export default function DMLSnapshotDetailDrawer({
  open,
  loading,
  detail,
  error,
  onClose,
}: DMLSnapshotDetailDrawerProps) {
  const { t } = useI18n();

  return (
    <Drawer
      title={t('dml_snapshot.detail.title')}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      {detail ? (
        <DMLSnapshotDetailBody detail={detail} />
      ) : loading ? null : (
        <Empty description={t('dml_snapshot.detail.no_statements')} />
      )}
    </Drawer>
  );
}
