import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';

import { useStore } from '../store';
import type { JVMAuditRecord, TabData } from '../types';
import JVMModeBadge from './jvm/JVMModeBadge';

const { Text } = Typography;

type JVMAuditViewerProps = {
  tab: TabData;
};

const LIMIT_OPTIONS = [20, 50, 100, 200];

const normalizeAuditRecords = (value: any): JVMAuditRecord[] => {
  if (Array.isArray(value)) {
    return value as JVMAuditRecord[];
  }
  if (Array.isArray(value?.data)) {
    return value.data as JVMAuditRecord[];
  }
  return [];
};

const filterAuditRecordsByMode = (records: JVMAuditRecord[], providerMode?: string): JVMAuditRecord[] => {
  const normalizedMode = String(providerMode || '').trim().toLowerCase();
  if (!normalizedMode) {
    return records;
  }
  return records.filter((record) => String(record.providerMode || '').trim().toLowerCase() === normalizedMode);
};

const formatTimestamp = (timestamp: number): string => {
  if (!timestamp) {
    return '-';
  }
  const normalized = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }
  return date.toLocaleString('zh-CN', { hour12: false });
};

const resultColor = (result: string): string => {
  const normalized = String(result || '').trim().toLowerCase();
  if (normalized.includes('success') || normalized.includes('ok') || normalized.includes('done')) {
    return 'green';
  }
  if (normalized.includes('warn')) {
    return 'gold';
  }
  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'red';
  }
  return 'default';
};

const JVMAuditViewer: React.FC<JVMAuditViewerProps> = ({ tab }) => {
  const connection = useStore((state) => state.connections.find((item) => item.id === tab.connectionId));
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<JVMAuditRecord[]>([]);
  const [error, setError] = useState('');

  const columns = useMemo<ColumnsType<JVMAuditRecord>>(
    () => [
      {
        title: '时间',
        dataIndex: 'timestamp',
        key: 'timestamp',
        width: 180,
        render: (value: number) => formatTimestamp(value),
      },
      {
        title: '模式',
        dataIndex: 'providerMode',
        key: 'providerMode',
        width: 120,
        render: (value: string) => <JVMModeBadge mode={value || tab.providerMode || 'jmx'} />,
      },
      {
        title: '动作',
        dataIndex: 'action',
        key: 'action',
        width: 120,
        render: (value: string) => value || '-',
      },
      {
        title: '资源',
        dataIndex: 'resourceId',
        key: 'resourceId',
        ellipsis: true,
        render: (value: string) => value || '-',
      },
      {
        title: '原因',
        dataIndex: 'reason',
        key: 'reason',
        ellipsis: true,
        render: (value: string) => value || '-',
      },
      {
        title: '结果',
        dataIndex: 'result',
        key: 'result',
        width: 140,
        render: (value: string) => <Tag color={resultColor(value)}>{value || 'unknown'}</Tag>,
      },
    ],
    [tab.providerMode],
  );

  const loadRecords = async () => {
    if (!connection) {
      setLoading(false);
      setRecords([]);
      setError('连接不存在或已被删除');
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMListAuditRecords !== 'function') {
      setLoading(false);
      setRecords([]);
      setError('JVMListAuditRecords 后端方法不可用');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await backendApp.JVMListAuditRecords(connection.id, limit);
      if (result?.success === false) {
        setRecords([]);
        setError(String(result?.message || '读取 JVM 审计记录失败'));
        return;
      }
      setRecords(filterAuditRecordsByMode(normalizeAuditRecords(result), tab.providerMode));
    } catch (err: any) {
      setRecords([]);
      setError(err?.message || '读取 JVM 审计记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [connection, limit, tab.connectionId]);

  if (!connection) {
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />;
  }

  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={12} wrap>
            <JVMModeBadge mode={tab.providerMode || connection.config.jvm?.preferredMode || 'jmx'} />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadRecords()}>
              刷新
            </Button>
            <Select
              size="small"
              value={limit}
              onChange={setLimit}
              options={LIMIT_OPTIONS.map((item) => ({ value: item, label: `最近 ${item} 条` }))}
              style={{ width: 128 }}
            />
          </Space>
          <Space size={8} wrap>
            <Text strong>{connection.name}</Text>
            <Text type="secondary">{connection.id}</Text>
          </Space>
        </Space>
      </Card>

      <Card title="审计记录">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Table<JVMAuditRecord>
            rowKey={(record) => `${record.timestamp}-${record.resourceId}-${record.action}`}
            loading={loading}
            columns={columns}
            dataSource={records}
            pagination={false}
            locale={{
              emptyText: error ? '当前无法加载审计记录' : '暂无审计记录',
            }}
            scroll={{ x: 960 }}
            size="small"
          />
        </Space>
      </Card>
    </div>
  );
};

export default JVMAuditViewer;
