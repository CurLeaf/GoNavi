import React from 'react';
import { Button, Input, Popconfirm, Select } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import { parseMCPCommandDraft } from '../../utils/mcpCommandDraft';
import { formatMCPEnvDraft, parseMCPEnvDraft } from '../../utils/mcpEnvDraft';

interface AIMCPServerCardProps {
  server: AIMCPServerConfig;
  serverTools: AIMCPToolDescriptor[];
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  loading: boolean;
  onChange: (patch: Partial<AIMCPServerConfig>) => void;
  onTest: () => void;
  onSave: () => void;
  onDelete: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
};

const hintStyle = (mutedText: string): React.CSSProperties => ({
  fontSize: 12,
  color: mutedText,
  lineHeight: 1.6,
});

const MCP_COMMAND_EXAMPLES = [
  'uvx mcp-server-fetch',
  'node server.js --stdio',
  'python -m your_mcp_server',
];

const quoteCommandPart = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

const formatLaunchPreview = (command: string, args?: string[]): string =>
  [command, ...(Array.isArray(args) ? args : [])]
    .map((item) => quoteCommandPart(item))
    .filter(Boolean)
    .join(' ');

const MCPHelpBlock: React.FC<{
  title: string;
  description: string;
  overlayTheme: OverlayWorkbenchTheme;
  example?: string;
  children: React.ReactNode;
}> = ({ title, description, overlayTheme, example, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={labelStyle}>{title}</div>
    <div style={hintStyle(overlayTheme.mutedText)}>
      {description}
      {example ? (
        <>
          {' '}例如：<code style={{ fontFamily: 'var(--gn-font-mono)' }}>{example}</code>
        </>
      ) : null}
    </div>
    {children}
  </div>
);

export const AIMCPServerCard: React.FC<AIMCPServerCardProps> = ({
  server,
  serverTools,
  cardBg,
  cardBorder,
  inputBg,
  darkMode,
  overlayTheme,
  loading,
  onChange,
  onTest,
  onSave,
  onDelete,
}) => {
  const [rawCommandDraft, setRawCommandDraft] = React.useState('');
  const [envDraft, setEnvDraft] = React.useState(() => formatMCPEnvDraft(server.env));
  const launchPreview = formatLaunchPreview(server.command, server.args);
  const parsedCommandDraft = parseMCPCommandDraft(rawCommandDraft);
  const parsedEnvDraft = parseMCPEnvDraft(envDraft);

  React.useEffect(() => {
    setEnvDraft(formatMCPEnvDraft(server.env));
  }, [server.id]);

  const handleApplyCommandDraft = () => {
    if (!parsedCommandDraft.ok || !parsedCommandDraft.draft) {
      return;
    }
    setEnvDraft(formatMCPEnvDraft(parsedCommandDraft.draft.env));
    onChange({
      command: parsedCommandDraft.draft.command,
      args: parsedCommandDraft.draft.args,
      env: parsedCommandDraft.draft.env,
    });
  };

  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${cardBorder}`, background: cardBg, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px dashed ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)' }}>
        <div style={{ ...labelStyle, color: overlayTheme.titleText }}>填写示例</div>
        <div style={{ ...hintStyle(overlayTheme.mutedText), marginTop: 4 }}>
          启动命令只填可执行程序本身，不要把参数混在一起。常见形式：
          {' '}
          <code style={{ fontFamily: 'var(--gn-font-mono)' }}>{MCP_COMMAND_EXAMPLES.join(' / ')}</code>
        </div>
      </div>

      <div style={{ padding: '12px', borderRadius: 12, border: `1px solid ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ ...labelStyle, color: overlayTheme.titleText }}>只有一条完整命令？</div>
        <div style={hintStyle(overlayTheme.mutedText)}>
          直接粘贴完整命令，GoNavi 会自动拆成“启动命令 / 命令参数 / 环境变量”三块，适合你只拿到 README 里的一整行示例时快速录入。
        </div>
        <Input.TextArea
          rows={2}
          value={rawCommandDraft}
          onChange={(event) => setRawCommandDraft(event.target.value)}
          placeholder={"直接粘贴完整命令，例如：\nOPENAI_API_KEY=... uvx mcp-server-fetch --stdio"}
          style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}`, fontFamily: 'var(--gn-font-mono)' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...hintStyle(parsedCommandDraft.ok ? overlayTheme.mutedText : '#dc2626') }}>
            {rawCommandDraft.trim()
              ? parsedCommandDraft.ok && parsedCommandDraft.draft
                ? `将解析为：命令 ${parsedCommandDraft.draft.command}，参数 ${parsedCommandDraft.draft.args.length} 个，环境变量 ${Object.keys(parsedCommandDraft.draft.env).length} 个。`
                : parsedCommandDraft.error
              : '支持带引号路径、带空格参数，以及命令前缀的 KEY=VALUE 环境变量。'}
          </div>
          <Button onClick={handleApplyCommandDraft} disabled={!parsedCommandDraft.ok} style={{ borderRadius: 10 }}>
            自动拆分到下方字段
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 132px', gap: 12 }}>
        <MCPHelpBlock title="服务名称" description="给这个 MCP 起一个你自己能识别的名字，后面 AI 工具列表里会直接显示。" overlayTheme={overlayTheme} example="Filesystem / Browser / GitHub">
          <Input
            value={server.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="服务名称，例如：Filesystem / Browser / GitHub"
            style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
          />
        </MCPHelpBlock>
        <MCPHelpBlock title="启用状态" description="临时不用可以先禁用，保留配置但不参与 AI 工具发现。" overlayTheme={overlayTheme}>
          <Select
            value={server.enabled ? 'enabled' : 'disabled'}
            onChange={(value) => onChange({ enabled: value === 'enabled' })}
            options={[{ label: '已启用', value: 'enabled' }, { label: '已禁用', value: 'disabled' }]}
          />
        </MCPHelpBlock>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '132px minmax(0,1fr) 132px', gap: 12 }}>
        <MCPHelpBlock title="传输方式" description="当前阶段只支持 stdio，表示 GoNavi 会在本机启动这个进程，并通过标准输入输出与它通信。" overlayTheme={overlayTheme}>
          <Select
            value={server.transport}
            onChange={(value) => onChange({ transport: value as AIMCPServerConfig['transport'] })}
            options={[{ label: 'stdio', value: 'stdio' }]}
          />
        </MCPHelpBlock>
        <MCPHelpBlock title="启动命令" description="这里只填命令本身；如果是 node/uvx/python 这类启动器，把脚本名或模块名放到下面的参数里。" overlayTheme={overlayTheme} example="node / uvx / python">
          <Input
            value={server.command}
            onChange={(event) => onChange({ command: event.target.value })}
            placeholder="启动命令，例如：node / uvx / python"
            style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
          />
        </MCPHelpBlock>
        <MCPHelpBlock title="超时(秒)" description="工具发现和工具调用单次最多等多久。远端服务或启动慢的脚本可以适当调大。" overlayTheme={overlayTheme} example="20">
          <Input
            type="number"
            min={3}
            max={120}
            value={server.timeoutSeconds}
            onChange={(event) => onChange({ timeoutSeconds: Number(event.target.value) || 20 })}
            placeholder="超时(秒)"
            style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
          />
        </MCPHelpBlock>
      </div>

      <MCPHelpBlock title="命令参数" description="每个参数单独录入一个标签；命令本体不要填在这里。比如 node server.js --stdio，要把 server.js 和 --stdio 分开填。" overlayTheme={overlayTheme} example="server.js、--stdio、-m、your_mcp_server">
        <Select
          mode="tags"
          value={server.args || []}
          onChange={(value) => onChange({ args: value })}
          placeholder="命令参数，回车录入，例如：server.js、--stdio"
          style={{ width: '100%' }}
        />
      </MCPHelpBlock>

      {launchPreview && (
        <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)' }}>
          <div style={{ ...labelStyle, color: overlayTheme.titleText }}>实际启动命令预览</div>
          <div style={{ ...hintStyle(overlayTheme.mutedText), marginTop: 4 }}>
            GoNavi 会按下面的形式启动进程，方便你确认命令和参数是不是拆对了。
          </div>
          <code style={{ display: 'block', marginTop: 8, fontFamily: 'var(--gn-font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {launchPreview}
          </code>
        </div>
      )}

      <MCPHelpBlock title="环境变量" description="每行一个 KEY=VALUE，通常用于 API Key、工作目录、服务地址等配置；不需要时可以留空。" overlayTheme={overlayTheme} example="OPENAI_API_KEY=...">
        <Input.TextArea
          rows={3}
          value={envDraft}
          onChange={(event) => {
            const nextValue = event.target.value;
            setEnvDraft(nextValue);
            onChange({ env: parseMCPEnvDraft(nextValue).env });
          }}
          placeholder={"环境变量，每行一个 KEY=VALUE，例如：\nOPENAI_API_KEY=...\nGITHUB_TOKEN=..."}
          style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}`, fontFamily: 'var(--gn-font-mono)' }}
        />
        <div style={{ ...hintStyle(parsedEnvDraft.invalidLines.length > 0 ? '#d97706' : overlayTheme.mutedText) }}>
          {envDraft.trim()
            ? parsedEnvDraft.invalidLines.length > 0
              ? `已识别 ${parsedEnvDraft.validLines} 条环境变量，另有 ${parsedEnvDraft.invalidLines.length} 行格式无效，本次不会保存：${parsedEnvDraft.invalidLines.slice(0, 2).join(' / ')}`
              : `已识别 ${parsedEnvDraft.validLines} 条环境变量。`
            : '每行都要写成 KEY=VALUE；没有等号或 key 含空格的行不会保存。'}
        </div>
      </MCPHelpBlock>

      {serverTools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>已发现工具</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {serverTools.map((tool) => (
              <span key={tool.alias} style={{ padding: '4px 8px', borderRadius: 999, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', fontSize: 12, color: overlayTheme.mutedText }}>
                {tool.alias}
              </span>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onTest} loading={loading} style={{ borderRadius: 10 }}>测试工具发现</Button>
        <Button type="primary" onClick={onSave} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>保存</Button>
        <Popconfirm title="删除这个 MCP 服务？" okText="删除" cancelText="取消" onConfirm={onDelete}>
          <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 10 }}>删除</Button>
        </Popconfirm>
      </div>
    </div>
  );
};

export default AIMCPServerCard;
