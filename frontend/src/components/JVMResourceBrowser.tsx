import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Skeleton, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { useStore } from '../store';
import type { JVMValueSnapshot, SavedConnection, TabData } from '../types';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import JVMModeBadge from './jvm/JVMModeBadge';

const { Paragraph, Text } = Typography;

type JVMResourceBrowserProps = {
  tab: TabData;
};

const buildJVMRuntimeConfig = (connection: SavedConnection, providerMode: string) => {
  const sourceJVM = connection.config.jvm || {};
  return buildRpcConnectionConfig(connection.config, {
    jvm: {
      ...sourceJVM,
      preferredMode: providerMode,
      allowedModes: [providerMode],
    },
  });
};

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const JVMResourceBrowser: React.FC<JVMResourceBrowserProps> = ({ tab }) => {
  const connection = useStore((state) => state.connections.find((item) => item.id === tab.connectionId));
  const providerMode = tab.providerMode || connection?.config.jvm?.preferredMode || 'jmx';
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<JVMValueSnapshot | null>(null);
  const [error, setError] = useState('');

  const displayValue = useMemo(() => formatValue(snapshot?.value), [snapshot]);

  const loadSnapshot = async () => {
    if (!connection) {
      setLoading(false);
      setSnapshot(null);
      setError('连接不存在或已被删除');
      return;
    }

    const resourcePath = String(tab.resourcePath || '').trim();
    if (!resourcePath) {
      setLoading(false);
      setSnapshot(null);
      setError('资源路径为空');
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMGetValue !== 'function') {
      setLoading(false);
      setSnapshot(null);
      setError('JVMGetValue 后端方法不可用');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await backendApp.JVMGetValue(
        buildJVMRuntimeConfig(connection, providerMode),
        resourcePath,
      );
      if (!result?.success) {
        setSnapshot(null);
        setError(String(result?.message || '读取 JVM 资源失败'));
        return;
      }
      setSnapshot((result.data || null) as JVMValueSnapshot | null);
    } catch (err: any) {
      setSnapshot(null);
      setError(err?.message || '读取 JVM 资源失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, [connection, providerMode, tab.connectionId, tab.resourcePath]);

  if (!connection) {
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />;
  }

  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={12} wrap>
            <JVMModeBadge mode={providerMode} />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadSnapshot()}>
              刷新
            </Button>
          </Space>
          <Paragraph style={{ marginBottom: 0 }}>
            <Text strong>{connection.name}</Text>
          </Paragraph>
          <Text type="secondary">{tab.resourcePath}</Text>
        </Space>
      </Card>

      <Card title="资源快照">
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {error ? <Alert type="error" showIcon message={error} /> : null}
            {snapshot ? (
              <>
                <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
                  <Descriptions.Item label="资源 ID">{snapshot.resourceId || '-'}</Descriptions.Item>
                  <Descriptions.Item label="资源类型">{snapshot.kind || tab.resourceKind || '-'}</Descriptions.Item>
                  <Descriptions.Item label="格式">{snapshot.format || '-'}</Descriptions.Item>
                  <Descriptions.Item label="版本">{snapshot.version || '-'}</Descriptions.Item>
                </Descriptions>
                <pre
                  style={{
                    margin: 0,
                    padding: 16,
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.04)',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {displayValue}
                </pre>
                {snapshot.metadata && Object.keys(snapshot.metadata).length > 0 ? (
                  <pre
                    style={{
                      margin: 0,
                      padding: 16,
                      borderRadius: 8,
                      background: 'rgba(0, 0, 0, 0.03)',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(snapshot.metadata, null, 2)}
                  </pre>
                ) : null}
              </>
            ) : error ? null : <Empty description="暂无资源数据" />}
          </Space>
        )}
      </Card>
    </div>
  );
};

export default JVMResourceBrowser;
