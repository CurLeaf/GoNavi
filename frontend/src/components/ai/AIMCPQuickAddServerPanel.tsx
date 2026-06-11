import React from 'react';
import { Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import type { AIMCPServerConfig } from '../../types';
import {
  parseMCPCommandDraft,
  type ParseMCPCommandDraftResult,
} from '../../utils/mcpCommandDraft';
import { MCP_COMMAND_PARSE_EXAMPLE } from '../../utils/mcpServerGuidance';
import { buildMCPQuickAddServerSeed } from '../../utils/mcpServerDraftSeed';
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
          README 里通常只给一整行启动命令。直接粘到这里，GoNavi 会先拆成 command、args 和 env，再生成一个可继续编辑的 MCP 草稿。
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
