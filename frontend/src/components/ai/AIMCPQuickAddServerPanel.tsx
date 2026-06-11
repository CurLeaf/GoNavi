import React from 'react';
import { Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import type { AIMCPServerConfig } from '../../types';
import {
  parseMCPCommandDraft,
  type ParsedMCPCommandDraft,
  type ParseMCPCommandDraftResult,
} from '../../utils/mcpCommandDraft';
import { MCP_COMMAND_PARSE_EXAMPLE } from '../../utils/mcpServerGuidance';
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

const stripCommandSuffix = (value: string): string =>
  value.replace(/\.(exe|cmd|bat|ps1|c?m?[jt]s|py)$/iu, '');

const toDisplayNamePart = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) return '';
  const lastPathPart = text.split(/[\\/]/u).filter(Boolean).pop() || text;
  const packagePart = lastPathPart.includes('/') ? lastPathPart.split('/').filter(Boolean).pop() || lastPathPart : lastPathPart;
  return stripCommandSuffix(packagePart).replace(/^@/u, '').trim();
};

const findDockerImageArg = (args: string[]): string => {
  const runIndex = args.findIndex((arg) => arg.toLowerCase() === 'run');
  const candidates = runIndex >= 0 ? args.slice(runIndex + 1) : args;
  const optionsWithValue = new Set([
    '-e',
    '--env',
    '--name',
    '--network',
    '-v',
    '--volume',
    '-p',
    '--publish',
    '--entrypoint',
    '-w',
    '--workdir',
    '-u',
    '--user',
    '--platform',
    '-h',
    '--hostname',
  ]);

  for (let index = 0; index < candidates.length; index += 1) {
    const arg = String(candidates[index] || '').trim();
    if (!arg) continue;
    if (arg.startsWith('-')) {
      if (optionsWithValue.has(arg.toLowerCase())) {
        index += 1;
      }
      continue;
    }
    if (arg.includes('=') || arg.toLowerCase() === 'run') {
      continue;
    }
    return arg;
  }
  return '';
};

const pickDraftNameCandidate = (draft: ParsedMCPCommandDraft): string => {
  const commandName = toDisplayNamePart(draft.command).toLowerCase();
  const args = draft.args || [];

  if (['npx', 'npm', 'pnpm', 'yarn', 'uvx', 'uv'].includes(commandName)) {
    return args.find((arg) => arg && !arg.startsWith('-') && arg.toLowerCase() !== 'stdio') || draft.command;
  }
  if (['node', 'bun', 'deno'].includes(commandName)) {
    return args.find((arg) => arg && !arg.startsWith('-') && arg.toLowerCase() !== 'stdio') || draft.command;
  }
  if (['python', 'python3', 'py'].includes(commandName)) {
    const moduleFlagIndex = args.findIndex((arg) => arg === '-m');
    return (moduleFlagIndex >= 0 ? args[moduleFlagIndex + 1] : '') || args.find((arg) => arg && !arg.startsWith('-')) || draft.command;
  }
  if (commandName === 'docker') {
    return findDockerImageArg(args) || draft.command;
  }
  return draft.command;
};

export const buildMCPQuickAddServerSeed = (
  draft: ParsedMCPCommandDraft,
): Partial<AIMCPServerConfig> => {
  const commandName = toDisplayNamePart(draft.command).toLowerCase();
  const namePart = toDisplayNamePart(pickDraftNameCandidate(draft)) || 'MCP 服务';

  return {
    name: namePart,
    transport: 'stdio',
    command: draft.command,
    args: draft.args,
    env: draft.env,
    enabled: true,
    timeoutSeconds: commandName === 'docker' ? 45 : 20,
  };
};

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
