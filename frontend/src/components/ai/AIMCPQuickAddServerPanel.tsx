import React from 'react';
import { Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import type { AIMCPServerConfig } from '../../types';
import {
  parseMCPCommandDraft,
  type ParseMCPCommandDraftResult,
} from '../../utils/mcpCommandDraft';
import {
  buildMCPLaunchPreview,
  MCP_COMMAND_PARSE_EXAMPLE,
} from '../../utils/mcpServerGuidance';
import { buildMCPQuickAddServerSeed } from '../../utils/mcpServerDraftSeed';
import { MCP_SERVER_DRAFT_TEMPLATES } from '../../utils/mcpServerTemplates';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import AIMCPCommandDraftPreview from './AIMCPCommandDraftPreview';
import { buildMCPHintStyle, mcpLabelStyle } from './AIMCPHelpBlock';

interface AIMCPQuickAddServerPanelProps {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  onAddServer: (seed?: Partial<AIMCPServerConfig>) => void;
}

const renderParseSummary = (
  rawCommandDraft: string,
  parsedCommandDraft: ParseMCPCommandDraftResult,
  overlayTheme: OverlayWorkbenchTheme,
) => {
  if (!rawCommandDraft.trim()) {
    return '支持带引号路径、带空格参数，以及 KEY=VALUE / $env:KEY=VALUE; / set KEY=VALUE && 环境变量前缀。';
  }
  if (!parsedCommandDraft.ok || !parsedCommandDraft.draft) {
    return parsedCommandDraft.error || '完整命令解析失败，请检查命令格式。';
  }
  const envCount = Object.keys(parsedCommandDraft.draft.env || {}).length;
  return (
    <span style={{ color: overlayTheme.mutedText }}>
      将解析为：命令 {parsedCommandDraft.draft.command}，参数 {parsedCommandDraft.draft.args.length} 个，环境变量 {envCount} 个。
    </span>
  );
};

const AIMCPQuickAddServerPanel: React.FC<AIMCPQuickAddServerPanelProps> = ({
  cardBg,
  cardBorder,
  inputBg,
  darkMode,
  overlayTheme,
  onAddServer,
}) => {
  const [rawCommandDraft, setRawCommandDraft] = React.useState('');
  const parsedCommandDraft = parseMCPCommandDraft(rawCommandDraft);

  const handleAddFromCommand = () => {
    if (!parsedCommandDraft.ok || !parsedCommandDraft.draft) {
      return;
    }
    onAddServer(buildMCPQuickAddServerSeed(parsedCommandDraft.draft));
    setRawCommandDraft('');
  };

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        border: `1px solid ${cardBorder}`,
        background: cardBg,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText, fontSize: 14 }}>一行命令快速新增</div>
        <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
          先选最接近的模板，或直接粘贴 README 里的一整行启动命令。GoNavi 会先拆成 command、args 和 env，再生成一个可继续编辑的 MCP 草稿。
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>常见启动方式模板</div>
        <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
          不确定 command 和 args 怎么拆时，直接点一个模板新增草稿；每张卡片下面展示的就是 GoNavi 实际会启动的命令预览。
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {MCP_SERVER_DRAFT_TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              onClick={() => onAddServer(template.seed)}
              style={{
                textAlign: 'left',
                padding: '12px 13px',
                borderRadius: 12,
                border: `1px solid ${cardBorder}`,
                background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
                color: overlayTheme.titleText,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>{template.title}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>{template.description}</div>
              <code style={{ display: 'block', marginTop: 8, fontFamily: 'var(--gn-font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: overlayTheme.titleText }}>
                {buildMCPLaunchPreview(String(template.seed.command || ''), template.seed.args)}
              </code>
              <div style={{ marginTop: 6, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>{template.detail}</div>
            </button>
          ))}
        </div>
      </div>
      <Input.TextArea
        rows={2}
        value={rawCommandDraft}
        onChange={(event) => setRawCommandDraft(event.target.value)}
        placeholder={`粘贴完整命令，例如：\n${MCP_COMMAND_PARSE_EXAMPLE}`}
        style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}`, fontFamily: 'var(--gn-font-mono)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...buildMCPHintStyle(parsedCommandDraft.ok || !rawCommandDraft.trim() ? overlayTheme.mutedText : '#dc2626') }}>
          {renderParseSummary(rawCommandDraft, parsedCommandDraft, overlayTheme)}
        </div>
        <Button
          icon={<PlusOutlined />}
          onClick={handleAddFromCommand}
          disabled={!parsedCommandDraft.ok}
          style={{ borderRadius: 10, fontWeight: 600 }}
        >
          解析并新增草稿
        </Button>
      </div>
      {parsedCommandDraft.ok && parsedCommandDraft.draft && rawCommandDraft.trim() && (
        <AIMCPCommandDraftPreview
          draft={parsedCommandDraft.draft}
          darkMode={darkMode}
          overlayTheme={overlayTheme}
          cardBorder={cardBorder}
        />
      )}
    </div>
  );
};

export default AIMCPQuickAddServerPanel;
