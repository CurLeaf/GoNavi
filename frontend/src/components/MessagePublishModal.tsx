import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Checkbox, Form, Input, Modal, Select, Space, Typography, message } from 'antd';

import { DBQuery } from '../../wailsjs/go/app/App';
import type { SavedConnection } from '../types';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import {
  buildMessagePublishCommand,
  createDefaultMessagePublishDraft,
  getMessagePublishPresentation,
  type MessagePublishDraft,
} from '../utils/messagePublish';

const { Text } = Typography;
const { TextArea } = Input;

const ROCKETMQ_DELAY_LEVEL_OPTIONS = [
  { label: '不延时', value: 0 },
  { label: '1 · 1s', value: 1 },
  { label: '2 · 5s', value: 2 },
  { label: '3 · 10s', value: 3 },
  { label: '4 · 30s', value: 4 },
  { label: '5 · 1m', value: 5 },
  { label: '6 · 2m', value: 6 },
  { label: '7 · 3m', value: 7 },
  { label: '8 · 4m', value: 8 },
  { label: '9 · 5m', value: 9 },
  { label: '10 · 6m', value: 10 },
  { label: '11 · 7m', value: 11 },
  { label: '12 · 8m', value: 12 },
  { label: '13 · 9m', value: 13 },
  { label: '14 · 10m', value: 14 },
  { label: '15 · 20m', value: 15 },
  { label: '16 · 30m', value: 16 },
  { label: '17 · 1h', value: 17 },
  { label: '18 · 2h', value: 18 },
];

export type MessagePublishModalProps = {
  open: boolean;
  connection: SavedConnection | null;
  executionDbName?: string;
  defaultDestination?: string;
  onCancel: () => void;
  onSuccess?: (result: { destination: string; affectedRows: number; commandText: string }) => void;
};

const MessagePublishModal: React.FC<MessagePublishModalProps> = ({
  open,
  connection,
  executionDbName = '',
  defaultDestination = '',
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm<MessagePublishDraft>();
  const [submitting, setSubmitting] = useState(false);
  const presentation = useMemo(
    () => getMessagePublishPresentation(connection?.config),
    [connection],
  );

  useEffect(() => {
    if (!open || !connection) return;
    form.setFieldsValue(
      createDefaultMessagePublishDraft(
        connection.config,
        defaultDestination,
      ),
    );
  }, [connection, defaultDestination, form, open]);

  useEffect(() => {
    if (open) return;
    form.resetFields();
    setSubmitting(false);
  }, [form, open]);

  const handleSubmit = async () => {
    if (!connection) return;

    let values: MessagePublishDraft;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    let command;
    try {
      command = buildMessagePublishCommand(connection.config, values);
    } catch (error: any) {
      void message.error(error?.message || '构造发送命令失败');
      return;
    }

    setSubmitting(true);
    try {
      const res = await DBQuery(
        buildRpcConnectionConfig(connection.config) as any,
        executionDbName,
        command.commandText,
      );
      if (!res?.success) {
        void message.error(`发送失败: ${res?.message || '未知错误'}`);
        return;
      }

      const affectedRows = Number((res.data as any)?.affectedRows);
      onSuccess?.({
        destination: command.destinationLabel,
        affectedRows: Number.isFinite(affectedRows) ? affectedRows : 0,
        commandText: command.commandText,
      });
    } catch (error: any) {
      void message.error(`发送失败: ${error?.message || String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`测试发送消息${connection?.name ? ` · ${connection.name}` : ''}`}
      open={open}
      onCancel={onCancel}
      onOk={() => { void handleSubmit(); }}
      okText="发送"
      confirmLoading={submitting}
      width={720}
      destroyOnHidden
      maskClosable={!submitting}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message={presentation.alertMessage}
        />

        <Form<MessagePublishDraft>
          form={form}
          layout="vertical"
          initialValues={createDefaultMessagePublishDraft(connection?.config, defaultDestination)}
        >
          <Form.Item
            label={presentation.destinationLabel}
            name="destination"
            rules={[{ required: true, message: presentation.destinationRequiredMessage }]}
          >
            <Input placeholder={presentation.destinationPlaceholder} />
          </Form.Item>

          {presentation.showExchange && (
            <Form.Item
              label="Exchange（可选）"
              name="exchange"
              extra="留空使用默认交换机；若填写自定义交换机，请确认目标 Queue 已建立 binding。"
            >
              <Input placeholder="例如：events.topic" />
            </Form.Item>
          )}

          {presentation.showRoutingKey && (
            <Form.Item
              label="Routing Key（可选）"
              name="routingKey"
              extra="留空时默认使用当前 Queue 名。"
            >
              <Input placeholder="例如：orders.queue" />
            </Form.Item>
          )}

          {presentation.showQos && (
            <Form.Item
              label="QoS"
              name="qos"
              extra="0 为至多一次，1 为至少一次，2 为仅一次。"
            >
              <Select
                options={[
                  { label: '0 · At most once', value: 0 },
                  { label: '1 · At least once', value: 1 },
                  { label: '2 · Exactly once', value: 2 },
                ]}
              />
            </Form.Item>
          )}

          {presentation.showRetain && (
            <Form.Item name="retain" valuePropName="checked" style={{ marginBottom: 16 }}>
              <Checkbox>Retain 消息</Checkbox>
            </Form.Item>
          )}

          {presentation.showTag && (
            <Form.Item
              label="Tag（可选）"
              name="tag"
              extra="留空表示不过滤或不写入 Tag。"
            >
              <Input placeholder={presentation.tagPlaceholder} />
            </Form.Item>
          )}

          {presentation.showDelayLevel && (
            <Form.Item
              label="Delay Level（可选）"
              name="delayLevel"
              extra="RocketMQ 使用固定延时级别，0 表示立即发送。"
            >
              <Select options={ROCKETMQ_DELAY_LEVEL_OPTIONS} />
            </Form.Item>
          )}

          {presentation.showKey && (
            <Form.Item label={presentation.keyLabel}>
              {presentation.showKeyMode ? (
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="keyMode" noStyle>
                    <Select
                      style={{ width: 120 }}
                      options={[
                        { label: '文本', value: 'text' },
                        { label: 'JSON', value: 'json' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="key" noStyle>
                    <Input placeholder={presentation.keyPlaceholder} />
                  </Form.Item>
                </Space.Compact>
              ) : (
                <Form.Item name="key" noStyle>
                  <Input placeholder={presentation.keyPlaceholder} />
                </Form.Item>
              )}
            </Form.Item>
          )}

          <Form.Item label="消息体类型" name="bodyMode">
            <Select
              options={[
                { label: 'JSON', value: 'json' },
                { label: '文本', value: 'text' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="消息体"
            name="body"
            rules={[{ required: true, message: '请输入消息体' }]}
            extra="JSON 模式下需输入合法 JSON；文本模式按原样发送。"
          >
            <TextArea rows={8} placeholder="请输入消息体" />
          </Form.Item>

          {presentation.showHeaders && (
            <Form.Item
              label="Headers（可选）"
              name="headers"
              extra={'需为 JSON 对象，例如 {"x-source":"gonavi"}。'}
            >
              <TextArea rows={5} placeholder='{"x-source":"gonavi"}' />
            </Form.Item>
          )}

          {presentation.showProperties && (
            <Form.Item
              label="Properties（可选）"
              name="properties"
              extra='需为 JSON 对象，例如 {"content_type":"application/json"}。'
            >
              <TextArea rows={5} placeholder='{"content_type":"application/json"}' />
            </Form.Item>
          )}
        </Form>

        <Text type="secondary">
          {presentation.successHint} 发送成功后会返回 <Text code>affectedRows</Text>，用于确认本次测试消息是否已提交。
        </Text>
      </Space>
    </Modal>
  );
};

export default MessagePublishModal;
