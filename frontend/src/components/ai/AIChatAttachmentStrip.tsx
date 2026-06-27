import React from 'react';
import { FileTextOutlined, WarningOutlined } from '@ant-design/icons';

import type { AIChatAttachment } from '../../types';
import { t as catalogTranslate } from '../../i18n/catalog';
import { useOptionalI18n } from '../../i18n/provider';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { formatAIChatAttachmentSize } from './aiChatAttachments';

interface AIChatAttachmentStripProps {
  attachments: AIChatAttachment[];
  onRemove: (index: number) => void;
  overlayTheme: OverlayWorkbenchTheme;
  variant: 'legacy' | 'v2';
}

type AttachmentKindLabels = {
  text: string;
  image: string;
  file: string;
};

const formatAttachmentKind = (attachment: AIChatAttachment, labels: AttachmentKindLabels): string => {
  if (attachment.kind === 'markdown') return 'MD';
  if (attachment.kind === 'pdf') return 'PDF';
  if (attachment.kind === 'word') return 'Word';
  if (attachment.kind === 'excel') return 'Excel';
  if (attachment.kind === 'text') return labels.text;
  if (attachment.kind === 'image') return labels.image;
  return labels.file;
};

const AttachmentFileChip: React.FC<{
  attachment: AIChatAttachment;
  attachmentKindLabels: AttachmentKindLabels;
  onRemove: () => void;
  overlayTheme: OverlayWorkbenchTheme;
  removeAriaLabel: string;
  variant: 'legacy' | 'v2';
}> = ({ attachment, attachmentKindLabels, onRemove, overlayTheme, removeAriaLabel, variant }) => {
  if (variant === 'v2') {
    return (
      <div className={`gn-v2-ai-attachment-file${attachment.extractWarning ? ' has-warning' : ''}`}>
        <FileTextOutlined />
        <span className="gn-v2-ai-attachment-file-name" title={attachment.name}>{attachment.name}</span>
        <span className="gn-v2-ai-attachment-file-meta">
          {formatAttachmentKind(attachment, attachmentKindLabels)} · {formatAIChatAttachmentSize(attachment.size)}
        </span>
        {attachment.extractWarning ? <WarningOutlined title={attachment.extractWarning} /> : null}
        <button type="button" onClick={onRemove} aria-label={removeAriaLabel}>×</button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: 220,
        minHeight: 34,
        border: overlayTheme.shellBorder,
        borderRadius: 8,
        padding: '4px 8px',
        color: overlayTheme.titleText,
        background: 'rgba(0,0,0,0.03)',
      }}
      title={attachment.extractWarning || attachment.name}
    >
      <FileTextOutlined />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
        {attachment.name}
      </span>
      <span style={{ color: overlayTheme.mutedText, fontSize: 11, flexShrink: 0 }}>
        {formatAttachmentKind(attachment, attachmentKindLabels)}
      </span>
      {attachment.extractWarning ? <WarningOutlined style={{ color: '#faad14', flexShrink: 0 }} /> : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeAriaLabel}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: overlayTheme.mutedText, padding: 0 }}
      >
        ×
      </button>
    </div>
  );
};

export const AIChatAttachmentStrip: React.FC<AIChatAttachmentStripProps> = ({
  attachments,
  onRemove,
  overlayTheme,
  variant,
}) => {
  const i18n = useOptionalI18n();
  const t = i18n?.t ?? ((key: string, params?: Record<string, string | number | boolean | null | undefined>) =>
    catalogTranslate('en-US', key, params));
  if (attachments.length === 0) {
    return null;
  }

  const removeFileAriaLabel = t('ai_chat.input.attachment.remove_file');
  const removeImageAriaLabel = t('ai_chat.input.attachment.remove_image');
  const attachmentKindLabels: AttachmentKindLabels = {
    text: t('ai_chat.input.attachment.kind.text'),
    image: t('ai_chat.input.attachment.kind.image'),
    file: t('ai_chat.input.attachment.kind.file'),
  };
  const buildImageAlt = (index: number) => t('ai_chat.message.image_alt', { index });

  if (variant === 'v2') {
    return (
      <div className="gn-v2-ai-attachment-row">
        {attachments.map((attachment, index) => (
          attachment.kind === 'image' && attachment.dataUrl ? (
            <div key={attachment.id || index} className="gn-v2-ai-attachment-thumb">
              <img src={attachment.dataUrl} alt={buildImageAlt(index)} />
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={removeImageAriaLabel}
              >
                ×
              </button>
            </div>
          ) : (
            <AttachmentFileChip
              key={attachment.id || index}
              attachment={attachment}
              attachmentKindLabels={attachmentKindLabels}
              overlayTheme={overlayTheme}
              removeAriaLabel={removeFileAriaLabel}
              variant="v2"
              onRemove={() => onRemove(index)}
            />
          )
        ))}
      </div>
    );
  }

  return (
    <>
      {attachments.map((attachment, index) => (
        attachment.kind === 'image' && attachment.dataUrl ? (
          <div key={attachment.id || index} style={{ position: 'relative', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', border: overlayTheme.shellBorder }}>
            <img src={attachment.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={buildImageAlt(index)} />
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={removeImageAriaLabel}
              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, border: 'none', padding: 0 }}
            >
              ×
            </button>
          </div>
        ) : (
          <AttachmentFileChip
            key={attachment.id || index}
            attachment={attachment}
            attachmentKindLabels={attachmentKindLabels}
            overlayTheme={overlayTheme}
            removeAriaLabel={removeFileAriaLabel}
            variant="legacy"
            onRemove={() => onRemove(index)}
          />
        )
      ))}
    </>
  );
};

export default AIChatAttachmentStrip;
