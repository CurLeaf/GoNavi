import { useEffect, useRef, useState } from 'react';
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
import {
  hasSecurityUpdateRecentResult,
  resolveSecurityUpdateFocusState,
  type SecurityUpdateFocusState,
  type SecurityUpdateSettingsFocusTarget,
} from '../utils/securityUpdateRepairFlow';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import {
  SECURITY_UPDATE_ACTION_BUTTON_CLASS,
  SECURITY_UPDATE_MODAL_CLASS,
  SECURITY_UPDATE_RESULT_CARD_ACTIVE_CLASS,
  SECURITY_UPDATE_RESULT_CARD_CLASS,
  getSecurityUpdateActionButtonStyle,
  getSecurityUpdateSectionSurfaceStyle,
  getSecurityUpdateShellSurfaceStyle,
} from '../utils/securityUpdateVisuals';

interface SecurityUpdateSettingsModalProps {
  open: boolean;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  status: SecurityUpdateStatus;
  focusTarget?: SecurityUpdateSettingsFocusTarget | null;
  focusRequest?: number;
  onClose: () => void;
  onStart: () => void;
  onRetry: () => void;
  onRestart: () => void;
  onIssueAction: (issue: SecurityUpdateIssue) => void;
}

const sectionStyle = (
  overlayTheme: OverlayWorkbenchTheme,
  options?: { emphasized?: boolean },
) => ({
  borderRadius: 14,
  padding: 16,
  ...getSecurityUpdateSectionSurfaceStyle(overlayTheme, options),
});

const EMPTY_FOCUS_STATE: SecurityUpdateFocusState = {
  target: null,
  pulseKey: null,
};

const SecurityUpdateSettingsModal = ({
  open,
  darkMode,
  overlayTheme,
  status,
  focusTarget = null,
  focusRequest = 0,
  onClose,
  onStart,
  onRetry,
  onRestart,
  onIssueAction,
}: SecurityUpdateSettingsModalProps) => {
  const statusMeta = getSecurityUpdateStatusMeta(status);
  const sortedIssues = sortSecurityUpdateIssues(status.issues);
  const showRecentResult = hasSecurityUpdateRecentResult(status);
  const showStart = status.overallStatus === 'pending' || status.overallStatus === 'postponed';
  const showRetry = status.overallStatus === 'needs_attention';
  const showRestart = status.overallStatus === 'needs_attention' || status.overallStatus === 'rolled_back';
  const actionButtonStyle = getSecurityUpdateActionButtonStyle();
  const [activeFocus, setActiveFocus] = useState<SecurityUpdateFocusState>(EMPTY_FOCUS_STATE);
  const statusSectionRef = useRef<HTMLDivElement | null>(null);
  const recentResultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextFocus = resolveSecurityUpdateFocusState(open, focusTarget, focusRequest);
    if (!nextFocus.target || !nextFocus.pulseKey) {
      setActiveFocus(EMPTY_FOCUS_STATE);
      return undefined;
    }

    const targetNode = nextFocus.target === 'recent_result'
      ? recentResultRef.current
      : statusSectionRef.current;
    if (!targetNode) {
      return undefined;
    }

    setActiveFocus(EMPTY_FOCUS_STATE);
    const animationFrame = window.requestAnimationFrame(() => {
      targetNode.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
      targetNode.focus({ preventScroll: true });
      setActiveFocus(nextFocus);
    });
    const highlightTimer = window.setTimeout(() => {
      setActiveFocus((current) => (
        current.pulseKey === nextFocus.pulseKey ? EMPTY_FOCUS_STATE : current
      ));
    }, 1800);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(highlightTimer);
    };
  }, [focusRequest, focusTarget, open]);

  return (
    <Modal
      rootClassName={SECURITY_UPDATE_MODAL_CLASS}
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
          <Button key="retry" className={SECURITY_UPDATE_ACTION_BUTTON_CLASS} style={actionButtonStyle} onClick={onRetry}>
            重新检查
          </Button>
        ) : null,
        showRestart ? (
          <Button key="restart" className={SECURITY_UPDATE_ACTION_BUTTON_CLASS} style={actionButtonStyle} onClick={onRestart}>
            重新开始更新
          </Button>
        ) : null,
        showStart ? (
          <Button
            key="start"
            className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
            style={actionButtonStyle}
            type="primary"
            onClick={onStart}
          >
            开始更新
          </Button>
        ) : null,
        <Button key="close" className={SECURITY_UPDATE_ACTION_BUTTON_CLASS} style={actionButtonStyle} onClick={onClose}>
          关闭
        </Button>,
      ]}
      width={760}
      styles={{
        content: getSecurityUpdateShellSurfaceStyle(overlayTheme),
        header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
        body: { paddingTop: 8, maxHeight: 640, overflowY: 'auto' },
        footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
      }}
    >
      <div style={{ display: 'grid', gap: 14, padding: '12px 0' }}>
        <div
          ref={statusSectionRef}
          tabIndex={-1}
          style={sectionStyle(overlayTheme, { emphasized: activeFocus.target === 'status' })}
        >
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
                  border: overlayTheme.sectionBorder,
                  borderRadius: 12,
                  background: overlayTheme.sectionBg,
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
                      ...getSecurityUpdateSectionSurfaceStyle(overlayTheme),
                      borderRadius: 12,
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
                      className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
                      style={actionButtonStyle}
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

        {showRecentResult ? (
          <div
            ref={recentResultRef}
            tabIndex={-1}
            className={[
              SECURITY_UPDATE_RESULT_CARD_CLASS,
              activeFocus.target === 'recent_result' ? SECURITY_UPDATE_RESULT_CARD_ACTIVE_CLASS : '',
            ].filter(Boolean).join(' ')}
            style={sectionStyle(overlayTheme, { emphasized: activeFocus.target === 'recent_result' })}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: overlayTheme.titleText, marginBottom: 8 }}>
              最近一次结果
            </div>
            {status.backupPath ? (
              <div style={{ fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
                备份位置：<span style={{ color: overlayTheme.titleText }}>{status.backupPath}</span>
              </div>
            ) : null}
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
