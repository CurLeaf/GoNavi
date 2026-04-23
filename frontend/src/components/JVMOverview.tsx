import React, { useMemo } from 'react';
import { Card, Descriptions, Empty, Space, Tag, Typography } from 'antd';

import { useStore } from '../store';
import type { SavedConnection, TabData } from '../types';
import JVMModeBadge from './jvm/JVMModeBadge';

const { Paragraph, Text } = Typography;

type JVMOverviewProps = {
  tab: TabData;
};

const JVMOverview: React.FC<JVMOverviewProps> = ({ tab }) => {
  const connection = useStore((state) => state.connections.find((item) => item.id === tab.connectionId));
  const providerMode = tab.providerMode || connection?.config.jvm?.preferredMode || 'jmx';
  const readOnly = connection?.config.jvm?.readOnly !== false;
  const allowedModes = connection?.config.jvm?.allowedModes || [];

  const endpointSummary = useMemo(() => {
    if (!connection?.config.jvm?.endpoint) {
      return '';
    }
    const endpoint = connection.config.jvm.endpoint;
    if (!endpoint.enabled && !endpoint.baseUrl) {
      return '';
    }
    return endpoint.baseUrl || '已启用';
  }, [connection]);

  if (!connection) {
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />;
  }

  const jmxHost = connection.config.jvm?.jmx?.host || connection.config.host;
  const jmxPort = connection.config.jvm?.jmx?.port || connection.config.port;

  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={12} wrap>
            <JVMModeBadge mode={providerMode} />
            <Tag color={readOnly ? 'blue' : 'red'}>{readOnly ? '只读连接' : '可写连接'}</Tag>
            <Tag>{connection.config.jvm?.environment || 'dev'}</Tag>
          </Space>
          <Paragraph style={{ marginBottom: 0 }}>
            <Text strong>{connection.name}</Text>
            <Text type="secondary"> · {connection.config.host}:{connection.config.port}</Text>
          </Paragraph>
        </Space>
      </Card>

      <Card title="连接摘要">
        <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
          <Descriptions.Item label="当前模式">{providerMode}</Descriptions.Item>
          <Descriptions.Item label="允许模式">{allowedModes.length > 0 ? allowedModes.join(', ') : 'jmx'}</Descriptions.Item>
          <Descriptions.Item label="JMX 地址">{`${jmxHost}:${jmxPort}`}</Descriptions.Item>
          <Descriptions.Item label="Endpoint">{endpointSummary || '未配置'}</Descriptions.Item>
          <Descriptions.Item label="资源浏览">{'通过侧边栏展开模式节点后懒加载'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default JVMOverview;
