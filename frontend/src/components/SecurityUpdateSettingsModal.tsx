import { Button, Empty, Modal, Tag } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';

import type { SecurityUpdateIssue, SecurityUpdateStatus } from '../types';
import {
  getSecurityUpdateIssueActionMeta,
  getSecurityUpdateIssueSeverityMeta,
  getSecurityUpdateItemStatusMeta,
  getSecurityUpdateStatusMeta,
  sortSecurityUpdateIssues,
} from '../utils/securityUpdatePresentation';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';

interface SecurityUpdateSettingsModalProps {
  open: boolean;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  status: SecurityUpdateStatus;
  onClose: () => void;
  onStart: () => void;
  onRetry: () => void;
  onRestart: () => void;
  onIssueAction: (issue: SecurityUpdateIssue) => void;
}

const sectionStyle = (overlayTheme: OverlayWorkbenchTheme) => ({
  borderRadius: 14,
  border: overlayTheme.sectionBorder,
  background: overlayTheme.sectionBg,
  padding: 16,
});

const SecurityUpdateSettingsModal = ({
  open,
  darkMode,
  overlayTheme,
  status,
  onClose,
  onStart,
  onRetry,
  onRestart,
  onIssueAction,
}: SecurityUpdateSettingsModalProps) => {
  const statusMeta = getSecurityUpdateStatusMeta(status);
  const sortedIssues = sortSecurityUpdateIssues(status.issues);
  const showStart = status.overallStatus === 'pending' || status.overallStatus === 'postponed';
  const showRetry = status.overallStatus === 'needs_attention';
  const showRestart = status.overallStatus === 'needs_attention' || status.overallStatus === 'rolled_back';

  return (
    <Modal
      title={(
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: overlayTheme.iconBg,
              color: overlayTheme.iconColor,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <SafetyCertificateOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: overlayTheme.titleText }}>
              安全更新
            </div>
            <div style={{ marginTop: 3, color: overlayTheme.mutedText, fontSize: 12 }}>
              管理已保存配置的安全更新状态与待处理项。
            </div>
          </div>
        </div>
      )}
      open={open}
      onCancel={onClose}
      footer={[
        showRetry ? (
          <Button key="retry" onClick={onRetry}>
            重新检查
          </Button>
        ) : null,
        showRestart ? (
          <Button key="restart" onClick={onRestart}>
            重新开始更新
          </Button>
        ) : null,
        showStart ? (
          <Button key="start" type="primary" onClick={onStart}>
            开始更新
          </Button>
        ) : null,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      width={760}
      styles={{
        content: {
          background: overlayTheme.shellBg,
          border: overlayTheme.shellBorder,
          boxShadow: overlayTheme.shellShadow,
          backdropFilter: overlayTheme.shellBackdropFilter,
        },
        header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
        body: { paddingTop: 8, maxHeight: 640, overflowY: 'auto' },
        footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
      }}
    >
      <div style={{ display: 'grid', gap: 14, padding: '12px 0' }}>
        <div style={sectionStyle(overlayTheme)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: overlayTheme.titleText }}>
                当前状态：{statusMeta.label}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
                {statusMeta.description}
              </div>
            </div>
            <Tag color={
              statusMeta.tone === 'success'
                ? 'success'
                : statusMeta.tone === 'error'
                  ? 'error'
                  : statusMeta.tone === 'processing'
                    ? 'processing'
                    : statusMeta.tone === 'warning'
                      ? 'warning'
                      : 'default'
            }>
              {statusMeta.label}
            </Tag>
          </div>
        </div>

        <div style={sectionStyle(overlayTheme)}>
          <div style={{ fontSize: 14, fontWeight: 700, color: overlayTheme.titleText, marginBottom: 12 }}>
            影响范围
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
            {[
              { label: '总计', value: status.summary.total },
              { label: '已更新', value: status.summary.updated },
              { label: '待处理', value: status.summary.pending },
              { label: '已跳过', value: status.summary.skipped },
              { label: '失败', value: status.summary.failed },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 12,
                  background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.75)',
                  padding: '12px 10px',
                }}
              >
                <div style={{ fontSize: 12, color: overlayTheme.mutedText }}>{item.label}</div>
                <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: overlayTheme.titleText }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={sectionStyle(overlayTheme)}>
          <div style={{ fontSize: 14, fontWeight: 700, color: overlayTheme.titleText, marginBottom: 12 }}>
            待处理清单
          </div>
          {sortedIssues.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前没有待处理项"
            />
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sortedIssues.map((issue) => {
                const actionMeta = getSecurityUpdateIssueActionMeta(issue);
                const itemStatusMeta = getSecurityUpdateItemStatusMeta(issue.status);
                const issueSeverityMeta = getSecurityUpdateIssueSeverityMeta(issue.severity);
                return (
                  <div
                    key={issue.id}
                    style={{
                      borderRadius: 12,
                      border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(16,24,40,0.08)',
                      background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.78)',
                      padding: 14,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: overlayTheme.titleText }}>
                          {issue.title || issue.message || issue.id}
                        </div>
                        <Tag color={itemStatusMeta.color}>
                          状态：{itemStatusMeta.label}
                        </Tag>
                        <Tag color={issueSeverityMeta.color}>
                          级别：{issueSeverityMeta.label}
                        </Tag>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
                        {issue.message || '当前项需要进一步处理后才能完成安全更新。'}
                      </div>
                    </div>
                    <Button
                      type={actionMeta.emphasis === 'primary' ? 'primary' : 'default'}
                      onClick={() => onIssueAction(issue)}
                    >
                      {actionMeta.label}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {status.backupPath ? (
          <div style={sectionStyle(overlayTheme)}>
            <div style={{ fontSize: 14, fontWeight: 700, color: overlayTheme.titleText, marginBottom: 8 }}>
              最近一次结果
            </div>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
              备份位置：<span style={{ color: overlayTheme.titleText }}>{status.backupPath}</span>
            </div>
            {status.lastError ? (
              <div style={{ marginTop: 8, fontSize: 13, color: '#ff7875', lineHeight: 1.7 }}>
                最近错误：{status.lastError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export type { SecurityUpdateSettingsModalProps };
export default SecurityUpdateSettingsModal;
