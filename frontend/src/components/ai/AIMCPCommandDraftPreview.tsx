import React from 'react';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { ParsedMCPCommandDraft } from '../../utils/mcpCommandDraft';

interface AIMCPCommandDraftPreviewProps {
  draft: ParsedMCPCommandDraft;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBorder: string;
}

const chipStyle = (darkMode: boolean, overlayTheme: OverlayWorkbenchTheme): React.CSSProperties => ({
  padding: '4px 8px',
  borderRadius: 999,
  fontSize: 12,
  color: overlayTheme.titleText,
  background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
  fontFamily: 'var(--gn-font-mono)',
});

const sectionTitleStyle = (overlayTheme: OverlayWorkbenchTheme): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 700,
  color: overlayTheme.titleText,
});

const sectionHintStyle = (overlayTheme: OverlayWorkbenchTheme): React.CSSProperties => ({
  fontSize: 11,
  color: overlayTheme.mutedText,
  lineHeight: 1.6,
});

const AIMCPCommandDraftPreview: React.FC<AIMCPCommandDraftPreviewProps> = ({
  draft,
  darkMode,
  overlayTheme,
  cardBorder,
}) => {
  const envKeys = Object.keys(draft.env || {});

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${cardBorder}`,
        background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <div style={sectionTitleStyle(overlayTheme)}>自动拆分预览</div>
        <div style={{ ...sectionHintStyle(overlayTheme), marginTop: 4 }}>
          点击“自动拆分到下方字段”后，会把这份解析结果写进服务名称下面的启动配置区域。
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionTitleStyle(overlayTheme)}>环境变量</div>
          <div style={sectionHintStyle(overlayTheme)}>
            {envKeys.length > 0 ? `会写入 ${envKeys.length} 条环境变量。` : '这条命令里没有检测到前缀环境变量。'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {envKeys.length > 0 ? envKeys.map((key) => (
              <span key={key} style={chipStyle(darkMode, overlayTheme)}>{key}</span>
            )) : <span style={chipStyle(darkMode, overlayTheme)}>无</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionTitleStyle(overlayTheme)}>启动命令</div>
          <div style={sectionHintStyle(overlayTheme)}>这里只会保留真正的可执行程序本身。</div>
          <code style={{ ...chipStyle(darkMode, overlayTheme), borderRadius: 10, display: 'inline-block' }}>
            {draft.command}
          </code>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionTitleStyle(overlayTheme)}>命令参数</div>
          <div style={sectionHintStyle(overlayTheme)}>
            {draft.args.length > 0 ? `会拆成 ${draft.args.length} 个独立参数标签。` : '这条命令里没有检测到额外参数。'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {draft.args.length > 0 ? draft.args.map((arg) => (
              <span key={arg} style={chipStyle(darkMode, overlayTheme)}>{arg}</span>
            )) : <span style={chipStyle(darkMode, overlayTheme)}>无</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIMCPCommandDraftPreview;
