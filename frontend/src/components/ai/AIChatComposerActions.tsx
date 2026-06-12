import React from 'react';
import { Button, Tooltip } from 'antd';
import { CodeOutlined, PictureOutlined, SendOutlined, StopOutlined, TableOutlined } from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { AI_CHAT_ATTACHMENT_ACCEPT } from './aiChatAttachments';

interface AIChatComposerActionsProps {
  variant: 'legacy' | 'v2';
  input: string;
  draftAttachmentCount: number;
  sending: boolean;
  darkMode: boolean;
  textColor: string;
  mutedColor: string;
  overlayTheme: OverlayWorkbenchTheme;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onAttachmentUpload: React.ChangeEventHandler<HTMLInputElement>;
  onOpenContext: () => void;
  onOpenSlashMenu?: () => void;
  onSend: () => void;
  onStop: () => void;
}

const buttonIconStyle = { fontSize: 16 };

const AIChatComposerActions: React.FC<AIChatComposerActionsProps> = ({
  variant,
  input,
  draftAttachmentCount,
  sending,
  darkMode,
  textColor,
  mutedColor,
  overlayTheme,
  fileInputRef,
  onAttachmentUpload,
  onOpenContext,
  onOpenSlashMenu,
  onSend,
  onStop,
}) => {
  const canSend = input.trim().length > 0 || draftAttachmentCount > 0;
  const isV2 = variant === 'v2';
  const legacyIconButtonStyle: React.CSSProperties = {
    color: overlayTheme.mutedText,
    border: 'none',
    background: 'transparent',
    padding: '0 4px',
    height: 26,
  };
  const v2IconButtonStyle: React.CSSProperties = {
    color: overlayTheme.mutedText,
    border: 'none',
    background: 'transparent',
  };

  return (
    <div
      className={isV2 ? 'gn-v2-ai-input-actions' : undefined}
      style={isV2 ? undefined : { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
    >
      <input
        type="file"
        accept={AI_CHAT_ATTACHMENT_ACCEPT}
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={onAttachmentUpload}
      />
      <Tooltip title="上传附件（图片、Markdown、Word、Excel、PDF、文本）">
        <Button
          type="text"
          icon={<PictureOutlined style={isV2 ? undefined : buttonIconStyle} />}
          onClick={() => fileInputRef.current?.click()}
          style={isV2 ? v2IconButtonStyle : legacyIconButtonStyle}
          onMouseEnter={isV2 ? undefined : (event) => { event.currentTarget.style.color = textColor; }}
          onMouseLeave={isV2 ? undefined : (event) => { event.currentTarget.style.color = overlayTheme.mutedText; }}
        />
      </Tooltip>
      <Tooltip title="关联附带数据库表上下文">
        <Button
          type="text"
          icon={<TableOutlined style={isV2 ? undefined : buttonIconStyle} />}
          onClick={onOpenContext}
          style={isV2 ? v2IconButtonStyle : legacyIconButtonStyle}
          onMouseEnter={isV2 ? undefined : (event) => { event.currentTarget.style.color = textColor; }}
          onMouseLeave={isV2 ? undefined : (event) => { event.currentTarget.style.color = overlayTheme.mutedText; }}
        />
      </Tooltip>
      {isV2 && (
        <Tooltip title="快捷命令">
          <Button
            type="text"
            icon={<CodeOutlined />}
            onClick={onOpenSlashMenu}
            style={v2IconButtonStyle}
          />
        </Tooltip>
      )}
      {sending ? (
        <button
          type={isV2 ? 'button' : undefined}
          className={isV2 ? 'ai-chat-send-btn ai-chat-stop-btn gn-v2-ai-send' : 'ai-chat-send-btn ai-chat-stop-btn'}
          onClick={onStop}
          title="停止生成"
          style={isV2 ? undefined : {
            background: 'rgba(255,77,79,0.1)',
            color: '#ff4d4f',
            border: '1px solid rgba(255,77,79,0.2)',
            width: 26,
            height: 26,
            borderRadius: 6,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {isV2 ? <StopOutlined /> : <div style={{ width: 10, height: 10, background: 'currentColor', borderRadius: 2 }} />}
        </button>
      ) : (
        <button
          type={isV2 ? 'button' : undefined}
          className={isV2 ? 'ai-chat-send-btn gn-v2-ai-send' : 'ai-chat-send-btn'}
          onClick={() => onSend()}
          disabled={!canSend}
          title="发送"
          style={isV2 ? undefined : {
            background: canSend ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
            color: canSend ? overlayTheme.iconColor : mutedColor,
            width: 26,
            height: 26,
            borderRadius: 6,
            border: 'none',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canSend ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          <SendOutlined />
        </button>
      )}
    </div>
  );
};

export default AIChatComposerActions;
