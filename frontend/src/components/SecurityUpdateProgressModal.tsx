import { Modal, Spin } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';

interface SecurityUpdateProgressModalProps {
  open: boolean;
  stageText: string;
  detailText?: string;
  overlayTheme: OverlayWorkbenchTheme;
}

const SecurityUpdateProgressModal = ({
  open,
  stageText,
  detailText,
  overlayTheme,
}: SecurityUpdateProgressModalProps) => {
  return (
    <Modal
      open={open}
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width={420}
      centered
      styles={{
        content: {
          background: overlayTheme.shellBg,
          border: overlayTheme.shellBorder,
          boxShadow: overlayTheme.shellShadow,
          backdropFilter: overlayTheme.shellBackdropFilter,
        },
        header: { display: 'none' },
        body: { padding: 28 },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 18,
            display: 'grid',
            placeItems: 'center',
            background: overlayTheme.iconBg,
            color: overlayTheme.iconColor,
            fontSize: 22,
          }}
        >
          <SafetyCertificateOutlined />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>
          {stageText}
        </div>
        <div style={{ fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          {detailText ?? '更新过程中会保留当前可用配置，请稍候。'}
        </div>
        <Spin size="large" />
      </div>
    </Modal>
  );
};

export type { SecurityUpdateProgressModalProps };
export default SecurityUpdateProgressModal;
