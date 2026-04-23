import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Input, Skeleton, Space, Tag, Typography } from 'antd';
import { FileSearchOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';

import { useStore } from '../store';
import type {
  JVMApplyResult,
  JVMChangePreview,
  JVMChangeRequest,
  JVMAIPlanContext,
  JVMValueSnapshot,
  SavedConnection,
  TabData,
} from '../types';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import {
  buildJVMChangeDraftFromAIPlan,
  buildJVMAIPlanPrompt,
  matchesJVMAIPlanTargetTab,
  type JVMAIChangeDraft,
  type JVMAIChangePlan,
} from '../utils/jvmAiPlan';
import { buildJVMTabTitle } from '../utils/jvmRuntimePresentation';
import JVMModeBadge from './jvm/JVMModeBadge';
import JVMChangePreviewModal from './jvm/JVMChangePreviewModal';

const { Paragraph, Text } = Typography;
const { TextArea } = Input;
const DEFAULT_PAYLOAD_TEXT = '{\n  \n}';

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

const formatDraftPayload = (draft: JVMAIChangeDraft): string => {
  try {
    return JSON.stringify(draft.payload ?? {}, null, 2);
  } catch {
    return '{}';
  }
};

const normalizePreviewResult = (value: any): JVMChangePreview | null => {
  if (value && typeof value === 'object' && typeof value.allowed === 'boolean') {
    return value as JVMChangePreview;
  }
  if (value?.data && typeof value.data.allowed === 'boolean') {
    return value.data as JVMChangePreview;
  }
  return null;
};

const normalizeApplyResult = (value: any): JVMApplyResult | null => {
  if (value && typeof value === 'object' && typeof value.status === 'string') {
    return value as JVMApplyResult;
  }
  if (value?.data && typeof value.data.status === 'string') {
    return value.data as JVMApplyResult;
  }
  return null;
};

const JVMResourceBrowser: React.FC<JVMResourceBrowserProps> = ({ tab }) => {
  const connection = useStore((state) => state.connections.find((item) => item.id === tab.connectionId));
  const addTab = useStore((state) => state.addTab);
  const providerMode = (tab.providerMode || connection?.config.jvm?.preferredMode || 'jmx') as 'jmx' | 'endpoint' | 'agent';
  const resourcePath = String(tab.resourcePath || '').trim();
  const readOnly = connection?.config.jvm?.readOnly !== false;
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<JVMValueSnapshot | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState('put');
  const [reason, setReason] = useState('');
  const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD_TEXT);
  const [draftResourceId, setDraftResourceId] = useState('');
  const [draftError, setDraftError] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<JVMChangePreview | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);

  const displayValue = useMemo(() => formatValue(snapshot?.value), [snapshot]);

  const loadSnapshot = async () => {
    if (!connection) {
      setLoading(false);
      setSnapshot(null);
      setError('连接不存在或已被删除');
      return;
    }

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
  }, [connection, providerMode, resourcePath, tab.connectionId]);

  useEffect(() => {
    setAction('put');
    setReason('');
    setPayloadText(DEFAULT_PAYLOAD_TEXT);
    setDraftResourceId('');
    setDraftError('');
    setApplyMessage('');
    setPreviewOpen(false);
    setPreviewResult(null);
  }, [providerMode, resourcePath, tab.connectionId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            plan?: JVMAIChangePlan;
            targetTabId?: string;
            connectionId?: string;
            providerMode?: JVMAIPlanContext['providerMode'];
            resourcePath?: string;
          }
        | undefined;
      const plan = detail?.plan;
      if (!plan || (detail?.targetTabId && detail.targetTabId !== tab.id)) {
        return;
      }

      const planContext =
        detail?.targetTabId && detail?.connectionId && detail?.providerMode && detail?.resourcePath
          ? {
              tabId: detail.targetTabId,
              connectionId: detail.connectionId,
              providerMode: detail.providerMode,
              resourcePath: detail.resourcePath,
            }
          : undefined;

      if (!planContext) {
        setDraftError('AI 计划缺少来源上下文，请在目标 JVM 资源页重新生成后再应用。');
        setApplyMessage('');
        setPreviewOpen(false);
        setPreviewResult(null);
        return;
      }

      if (!matchesJVMAIPlanTargetTab(tab, planContext)) {
        setDraftError('当前 JVM 页签与 AI 计划的来源上下文不一致，已拒绝自动应用。');
        setApplyMessage('');
        setPreviewOpen(false);
        setPreviewResult(null);
        return;
      }

      let draftFromPlan: JVMAIChangeDraft;
      try {
        draftFromPlan = buildJVMChangeDraftFromAIPlan(plan);
      } catch (err: any) {
        setDraftError(err?.message || 'AI 计划暂时无法转换为 JVM 预览草稿');
        setApplyMessage('');
        setPreviewOpen(false);
        setPreviewResult(null);
        return;
      }

      setDraftResourceId(draftFromPlan.resourceId);
      setAction(draftFromPlan.action);
      setReason(draftFromPlan.reason);
      setPayloadText(formatDraftPayload(draftFromPlan));
      setDraftError('');
      setApplyMessage(`已从 AI 计划填充草稿，目标资源为 ${draftFromPlan.resourceId}，请先执行“预览变更”再确认写入。`);
      setPreviewOpen(false);
      setPreviewResult(null);
    };

    window.addEventListener('gonavi:jvm-apply-ai-plan', handler as EventListener);
    return () => window.removeEventListener('gonavi:jvm-apply-ai-plan', handler as EventListener);
  }, [resourcePath, tab.id]);

  const buildDraftPlan = (): JVMChangeRequest => {
    const trimmedAction = String(action || '').trim() || 'put';
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
      throw new Error('请填写变更原因');
    }

    const rawPayload = String(payloadText || '').trim();
    let payload: Record<string, any> = {};
    if (rawPayload) {
      const parsed = JSON.parse(rawPayload);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Payload 必须是 JSON 对象');
      }
      payload = parsed as Record<string, any>;
    }

    const resourceId = String(draftResourceId || snapshot?.resourceId || resourcePath).trim();
    if (!resourceId) {
      throw new Error('资源 ID 为空，无法生成变更草稿');
    }

    return {
      providerMode,
      resourceId,
      action: trimmedAction,
      reason: trimmedReason,
      expectedVersion: snapshot?.version || undefined,
      payload,
    };
  };

  const handleOpenAudit = () => {
    if (!connection) {
      return;
    }

    addTab({
      id: `jvm-audit-${connection.id}-${providerMode}`,
      title: buildJVMTabTitle(connection.name, 'audit', providerMode),
      type: 'jvm-audit',
      connectionId: connection.id,
      providerMode,
    });
  };

  const handleAskAIForPlan = () => {
    if (!connection) {
      setDraftError('连接不存在或已被删除');
      return;
    }

    const prompt = buildJVMAIPlanPrompt({
      connectionName: connection.name,
      host: connection.config.host,
      providerMode,
      resourcePath,
      readOnly,
      environment: connection.config.jvm?.environment,
      snapshot,
    });

    const store = useStore.getState();
    const wasClosed = !store.aiPanelVisible;
    if (wasClosed) {
      store.setAIPanelVisible(true);
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
    }, wasClosed ? 350 : 0);
  };

  const handlePreview = async () => {
    if (!connection) {
      setDraftError('连接不存在或已被删除');
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMPreviewChange !== 'function') {
      setDraftError('JVMPreviewChange 后端方法不可用');
      return;
    }

    let draftPlan: JVMChangeRequest;
    try {
      draftPlan = buildDraftPlan();
    } catch (err: any) {
      setDraftError(err?.message || '变更草稿不合法');
      return;
    }

    setPreviewLoading(true);
    setDraftError('');
    setApplyMessage('');
    try {
      const result = await backendApp.JVMPreviewChange(
        buildJVMRuntimeConfig(connection, providerMode),
        draftPlan,
      );
      if (result?.success === false) {
        setPreviewResult(null);
        setPreviewOpen(false);
        setDraftError(String(result?.message || '预览 JVM 变更失败'));
        return;
      }

      const preview = normalizePreviewResult(result);
      if (!preview) {
        setPreviewResult(null);
        setPreviewOpen(false);
        setDraftError('预览结果格式不正确');
        return;
      }

      setPreviewResult(preview);
      setPreviewOpen(true);
    } catch (err: any) {
      setPreviewResult(null);
      setPreviewOpen(false);
      setDraftError(err?.message || '预览 JVM 变更失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!connection) {
      setDraftError('连接不存在或已被删除');
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMApplyChange !== 'function') {
      setDraftError('JVMApplyChange 后端方法不可用');
      return;
    }

    let draftPlan: JVMChangeRequest;
    try {
      draftPlan = buildDraftPlan();
    } catch (err: any) {
      setDraftError(err?.message || '变更草稿不合法');
      return;
    }

    setApplyLoading(true);
    setDraftError('');
    setApplyMessage('');
    try {
      const result = await backendApp.JVMApplyChange(
        buildJVMRuntimeConfig(connection, providerMode),
        draftPlan,
      );
      if (result?.success === false) {
        setDraftError(String(result?.message || '执行 JVM 变更失败'));
        return;
      }

      const applyResult = normalizeApplyResult(result);
      if (applyResult?.updatedValue) {
        setSnapshot(applyResult.updatedValue);
      }

      setPreviewOpen(false);
      setPreviewResult(null);
      setApplyMessage(applyResult?.message || result?.message || 'JVM 变更已执行');
      await loadSnapshot();
    } catch (err: any) {
      setDraftError(err?.message || '执行 JVM 变更失败');
    } finally {
      setApplyLoading(false);
    }
  };

  if (!connection) {
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />;
  }

  return (
    <>
      <div style={{ padding: 20, display: 'grid', gap: 16 }}>
        <Card>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space size={12} wrap>
              <JVMModeBadge mode={providerMode} />
              <Tag color={readOnly ? 'blue' : 'red'}>{readOnly ? '只读连接' : '可写连接'}</Tag>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadSnapshot()}>
                刷新
              </Button>
              <Button size="small" icon={<FileSearchOutlined />} onClick={handleOpenAudit}>
                审计记录
              </Button>
              <Button size="small" icon={<RobotOutlined />} onClick={handleAskAIForPlan}>
                AI 生成计划
              </Button>
            </Space>
            <Paragraph style={{ marginBottom: 0 }}>
              <Text strong>{connection.name}</Text>
            </Paragraph>
            <Text type="secondary">{resourcePath || '-'}</Text>
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

        <Card title="变更草稿">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {readOnly ? (
              <Alert
                type="warning"
                showIcon
                message="当前连接默认只读，预览或执行可能被后端策略拒绝。"
              />
            ) : null}
            {draftError ? <Alert type="error" showIcon message={draftError} /> : null}
            {applyMessage ? <Alert type="success" showIcon message={applyMessage} /> : null}
            <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
              <Descriptions.Item label="资源路径">{resourcePath || '-'}</Descriptions.Item>
              <Descriptions.Item label="目标资源">{draftResourceId || resourcePath || '-'}</Descriptions.Item>
              <Descriptions.Item label="资源版本">{snapshot?.version || '-'}</Descriptions.Item>
            </Descriptions>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>Action</Text>
              <Input
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="例如 put"
                maxLength={64}
              />
            </Space>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>变更原因</Text>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="填写本次 JVM 资源变更原因"
                maxLength={200}
              />
            </Space>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>Payload(JSON)</Text>
              <Text type="secondary">需要输入 JSON 对象，预览和执行都会直接使用这份 payload。</Text>
              <TextArea
                value={payloadText}
                onChange={(event) => setPayloadText(event.target.value)}
                autoSize={{ minRows: 8, maxRows: 18 }}
                spellCheck={false}
              />
            </Space>
            <Space size={12} wrap>
              <Button type="primary" loading={previewLoading} onClick={() => void handlePreview()}>
                预览变更
              </Button>
              <Button icon={<RobotOutlined />} onClick={handleAskAIForPlan}>
                让 AI 生成计划
              </Button>
            </Space>
          </Space>
        </Card>
      </div>

      <JVMChangePreviewModal
        open={previewOpen}
        preview={previewResult}
        applying={applyLoading}
        onCancel={() => {
          if (applyLoading) {
            return;
          }
          setPreviewOpen(false);
        }}
        onConfirm={() => void handleApply()}
      />
    </>
  );
};

export default JVMResourceBrowser;
