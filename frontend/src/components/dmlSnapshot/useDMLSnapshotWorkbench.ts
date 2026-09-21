import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/provider';
import {
  normalizeDMLSnapshotDetail,
  normalizeDMLSnapshotList,
  type DMLSnapshotDetail,
  type DMLSnapshotSummary,
} from './dmlSnapshotModel';
import {
  DMLSnapshotBackendMessage,
  requireDMLSnapshotMethod,
  resolveDMLSnapshotBackend,
  unwrapDMLSnapshotResult,
  type DMLSnapshotBackend,
} from './dmlSnapshotRpc';

export const useDMLSnapshotWorkbench = (backendOverride?: DMLSnapshotBackend) => {
  const { t } = useI18n();
  const backend = backendOverride ?? resolveDMLSnapshotBackend();

  const [summaries, setSummaries] = useState<DMLSnapshotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DMLSnapshotDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // 竞态守卫：刷新按钮可连点，只允许最后一次请求落地。
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const list = requireDMLSnapshotMethod(backend, 'ListDMLSnapshots');
        const data = unwrapDMLSnapshotResult(await list());
        if (requestRef.current !== requestId) return;
        setSummaries(normalizeDMLSnapshotList(data));
      } catch (err) {
        if (requestRef.current !== requestId) return;
        // 仅后端经 appText 本地化的 message 可直接展示；
        // 其余（方法缺失等）一律换成本地化文案，避免内部英文串泄漏到界面。
        setLoadError(err instanceof DMLSnapshotBackendMessage
          ? err.message
          : t('dml_snapshot.error.load_failed'));
        setSummaries([]);
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    };

    void load();
  }, [backend, refreshKey, t]);

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    try {
      const getDetail = requireDMLSnapshotMethod(backend, 'GetDMLSnapshot');
      const data = unwrapDMLSnapshotResult(await getDetail(id));
      setDetail(normalizeDMLSnapshotDetail(data));
    } catch (err) {
      // 同列表路径：只透出后端本地化 message，内部异常换兜底文案。
      setDetailError(err instanceof DMLSnapshotBackendMessage
        ? err.message
        : t('dml_snapshot.error.detail_failed'));
    } finally {
      setDetailLoading(false);
    }
  }, [backend, t]);

  return {
    t,
    summaries,
    loading,
    loadError,
    detailOpen,
    detailLoading,
    detail,
    detailError,
    refresh: () => setRefreshKey((current) => current + 1),
    openDetail,
    closeDetail: () => setDetailOpen(false),
  };
};
