import React, { useMemo } from 'react';
import { Alert, Descriptions, Modal, Space, Tag, Typography } from 'antd';

import type { JVMChangePreview } from '../../types';

const { Text } = Typography;

type JVMChangePreviewModalProps = {
  open: boolean;
  preview: JVMChangePreview | null;
  applying?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const riskColorMap: Record<string, string> = {
  low: 'green',
  medium: 'orange',
  high: 'red',
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

const previewBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: 'rgba(0, 0, 0, 0.04)',
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 280,
};

const JVMChangePreviewModal: React.FC<JVMChangePreviewModalProps> = ({
  open,
  preview,
  applying = false,
  onCancel,
  onConfirm,
}) => {
  const summary = useMemo(() => {
    if (!preview) {
      return '暂无预览结果';
    }
    return preview.summary || '预览已生成';
  }, [preview]);

  return (
    <Modal
      title="JVM 变更预览"
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="确认执行"
      cancelText="关闭"
      okButtonProps={{ disabled: !preview?.allowed, loading: applying }}
      width={880}
      destroyOnClose
    >
      {!preview ? (
        <Alert type="info" showIcon message="暂无预览结果" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="变更摘要">
              <Space size={8} wrap>
                <Text>{summary}</Text>
                <Tag color={riskColorMap[preview.riskLevel] || 'default'}>
                  风险 {preview.riskLevel || 'unknown'}
                </Tag>
                {preview.requiresConfirmation ? <Tag color="gold">需要确认</Tag> : null}
                {preview.allowed ? <Tag color="green">允许执行</Tag> : <Tag color="red">禁止执行</Tag>}
              </Space>
            </Descriptions.Item>
            {preview.blockingReason ? (
              <Descriptions.Item label="阻断原因">
                <Text type="danger">{preview.blockingReason}</Text>
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {!preview.allowed && preview.blockingReason ? (
            <Alert type="error" showIcon message={preview.blockingReason} />
          ) : (
            <Alert type="info" showIcon message={summary} />
          )}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              变更前
            </Text>
            <Descriptions column={1} size="small" labelStyle={{ width: 120 }} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="资源 ID">{preview.before?.resourceId || '-'}</Descriptions.Item>
              <Descriptions.Item label="版本">{preview.before?.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="格式">{preview.before?.format || '-'}</Descriptions.Item>
            </Descriptions>
            <pre style={previewBlockStyle}>{formatValue(preview.before?.value)}</pre>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              变更后
            </Text>
            <Descriptions column={1} size="small" labelStyle={{ width: 120 }} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="资源 ID">{preview.after?.resourceId || '-'}</Descriptions.Item>
              <Descriptions.Item label="版本">{preview.after?.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="格式">{preview.after?.format || '-'}</Descriptions.Item>
            </Descriptions>
            <pre style={previewBlockStyle}>{formatValue(preview.after?.value)}</pre>
          </div>
        </Space>
      )}
    </Modal>
  );
};

export default JVMChangePreviewModal;
