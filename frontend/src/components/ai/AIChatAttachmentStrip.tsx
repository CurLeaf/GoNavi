import React from 'react';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface AIChatAttachmentStripProps {
  draftImages: string[];
  onRemove: (index: number) => void;
  overlayTheme: OverlayWorkbenchTheme;
  variant: 'legacy' | 'v2';
}

export const AIChatAttachmentStrip: React.FC<AIChatAttachmentStripProps> = ({
  draftImages,
  onRemove,
  overlayTheme,
  variant,
}) => {
  if (draftImages.length === 0) {
    return null;
  }

  if (variant === 'v2') {
    return (
      <div className="gn-v2-ai-attachment-row">
        {draftImages.map((b64, index) => (
          <div key={index} className="gn-v2-ai-attachment-thumb">
            <img src={b64} alt={`Draft ${index}`} />
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label="移除图片"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {draftImages.map((b64, index) => (
        <div key={index} style={{ position: 'relative', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', border: overlayTheme.shellBorder }}>
          <img src={b64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Draft ${index}`} />
          <div
            onClick={() => onRemove(index)}
            style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}
          >
            ✕
          </div>
        </div>
      ))}
    </>
  );
};

export default AIChatAttachmentStrip;
