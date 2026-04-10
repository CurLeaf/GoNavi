import { Button, Modal } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import type { CSSProperties } from 'react';

import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';

interface SecurityUpdateIntroModalProps {
  open: boolean;
  loading?: boolean;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  onStart: () => void;
  onPostpone: () => void;
  onViewDetails: () => void;
}

const actionButtonStyle: CSSProperties = {
  height: 38,
  borderRadius: 12,
  paddingInline: 18,
  fontWeight: 600,
};

const SecurityUpdateIntroModal = ({
  open,
  loading = false,
  darkMode,
  overlayTheme,
  onStart,
  onPostpone,
  onViewDetails,
}: SecurityUpdateIntroModalProps) => {
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
              已保存配置安全更新
            </div>
            <div style={{ marginTop: 3, color: overlayTheme.mutedText, fontSize: 12 }}>
              使用新的安全存储方式前，需要先完成一次本地配置更新。
            </div>
          </div>
        </div>
      )}
      open={open}
      closable={!loading}
      maskClosable={!loading}
      keyboard={!loading}
      onCancel={onPostpone}
      width={560}
      styles={{
        content: {
          background: overlayTheme.shellBg,
          border: overlayTheme.shellBorder,
          boxShadow: overlayTheme.shellShadow,
          backdropFilter: overlayTheme.shellBackdropFilter,
        },
        header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
        body: { paddingTop: 8 },
        footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
      }}
      footer={[
        <Button key="details" type="primary" ghost style={actionButtonStyle} onClick={onViewDetails} disabled={loading}>
          查看详情
        </Button>,
        <Button key="later" type="primary" ghost style={actionButtonStyle} onClick={onPostpone} disabled={loading}>
          稍后提醒我
        </Button>,
        <Button key="start" type="primary" style={actionButtonStyle} loading={loading} onClick={onStart}>
          立即更新
        </Button>,
      ]}
    >
      <div
        style={{
          padding: '12px 0 6px',
          color: darkMode ? 'rgba(255,255,255,0.82)' : '#2f3b52',
          lineHeight: 1.8,
          fontSize: 14,
        }}
      >
        为了让已保存的连接、代理和相关服务配置使用新的安全存储方式，本次更新需要进行一次本地配置更新。
        更新前会自动创建本地备份；如果本次未完成，系统会保留当前可用配置，你也可以稍后继续。
      </div>
    </Modal>
  );
};

export type { SecurityUpdateIntroModalProps };
export default SecurityUpdateIntroModal;
