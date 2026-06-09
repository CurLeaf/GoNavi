import React from 'react';
import { Button, Input, Popconfirm, Select } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import type { ParsedMCPEnvDraft } from '../../utils/mcpEnvDraft';
import AIMCPHelpBlock, { buildMCPHintStyle, mcpLabelStyle } from './AIMCPHelpBlock';

interface AIMCPServerFormPanelProps {
  server: AIMCPServerConfig;
  serverTools: AIMCPToolDescriptor[];
  launchPreview: string;
  envDraft: string;
  parsedEnvDraft: ParsedMCPEnvDraft;
  cardBorder: string;
  inputBg: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  loading: boolean;
  onChange: (patch: Partial<AIMCPServerConfig>) => void;
  onEnvDraftChange: (value: string) => void;
  onTest: () => void;
  onSave: () => void;
  onDelete: () => void;
}

const AIMCPServerFormPanel: React.FC<AIMCPServerFormPanelProps> = ({
  server,
  serverTools,
  launchPreview,
  envDraft,
  parsedEnvDraft,
  cardBorder,
  inputBg,
  darkMode,
  overlayTheme,
  loading,
  onChange,
  onEnvDraftChange,
  onTest,
  onSave,
  onDelete,
}) => (
  <>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 132px', gap: 12 }}>
      <AIMCPHelpBlock title="服务名称" description="给这个 MCP 起一个你自己能识别的名字，后面 AI 工具列表里会直接显示；不要只写 server、test 这类看不出用途的名字。" overlayTheme={overlayTheme} darkMode={darkMode} fieldState="required" example="Filesystem / Browser / GitHub">
        <Input
          value={server.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="服务名称，例如：Filesystem / Browser / GitHub"
          style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
        />
      </AIMCPHelpBlock>
      <AIMCPHelpBlock title="启用状态" description="临时不用可以先禁用，保留配置但不参与 AI 工具发现。" overlayTheme={overlayTheme} darkMode={darkMode} fieldState="optional">
        <Select
          value={server.enabled ? 'enabled' : 'disabled'}
          onChange={(value) => onChange({ enabled: value === 'enabled' })}
          options={[{ label: '已启用', value: 'enabled' }, { label: '已禁用', value: 'disabled' }]}
        />
      </AIMCPHelpBlock>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '132px minmax(0,1fr) 132px', gap: 12 }}>
      <AIMCPHelpBlock title="传输方式" description="当前阶段只支持 stdio，表示 GoNavi 会在本机启动这个进程，并通过标准输入输出与它通信。" overlayTheme={overlayTheme} darkMode={darkMode} fieldState="fixed">
        <Select
          value={server.transport}
          onChange={(value) => onChange({ transport: value as AIMCPServerConfig['transport'] })}
          options={[{ label: 'stdio', value: 'stdio' }]}
        />
      </AIMCPHelpBlock>
      <AIMCPHelpBlock title="启动命令" description="这里只填命令本身；如果是 node/uvx/python 这类启动器，把脚本名或模块名放到下面的参数里。不要把 node server.js --stdio 整串都塞进这里。" overlayTheme={overlayTheme} darkMode={darkMode} fieldState="required" example="node / uvx / python">
        <Input
          value={server.command}
          onChange={(event) => onChange({ command: event.target.value })}
          placeholder="启动命令，例如：node / uvx / python"
          style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
        />
      </AIMCPHelpBlock>
      <AIMCPHelpBlock title="超时(秒)" description="工具发现和工具调用单次最多等多久。大多数本机工具保持默认 20 秒即可；远端服务或启动慢的脚本再调大。" overlayTheme={overlayTheme} darkMode={darkMode} fieldState="optional" example="20">
        <Input
          type="number"
          min={3}
          max={120}
          value={server.timeoutSeconds}
          onChange={(event) => onChange({ timeoutSeconds: Number(event.target.value) || 20 })}
          placeholder="超时(秒)"
          style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}` }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: '默认 20 秒', value: 20 },
            { label: '稍宽松 45 秒', value: 45 },
            { label: '慢启动 60 秒', value: 60 },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ timeoutSeconds: option.value })}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${cardBorder}`,
                background: server.timeoutSeconds === option.value
                  ? (darkMode ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)')
                  : (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.75)'),
                color: server.timeoutSeconds === option.value ? '#2563eb' : overlayTheme.mutedText,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </AIMCPHelpBlock>
    </div>

    <AIMCPHelpBlock title="命令参数" description="每个参数单独录入一个标签；命令本体不要填在这里。比如 node server.js --stdio，要把 server.js 和 --stdio 分开填。不确定怎么拆时，优先回到上面的“完整命令”框自动拆分。" overlayTheme={overlayTheme} darkMode={darkMode} fieldState="optional" example="server.js、--stdio、-m、your_mcp_server">
      <Select
        mode="tags"
        value={server.args || []}
        onChange={(value) => onChange({ args: value })}
        placeholder="命令参数，回车录入，例如：server.js、--stdio"
        style={{ width: '100%' }}
      />
    </AIMCPHelpBlock>

    {launchPreview && (
      <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)' }}>
        <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>实际启动命令预览</div>
        <div style={{ ...buildMCPHintStyle(overlayTheme.mutedText), marginTop: 4 }}>
          GoNavi 会按下面的形式启动进程，方便你确认命令和参数是不是拆对了。
        </div>
        <code style={{ display: 'block', marginTop: 8, fontFamily: 'var(--gn-font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {launchPreview}
        </code>
      </div>
    )}

    <AIMCPHelpBlock title="环境变量" description="每行一个 KEY=VALUE，通常用于 API Key、工作目录、服务地址等配置；不需要时可以留空。这里会保存到本机配置，并在启动 MCP 进程时作为环境变量传入；不要写 export，也不要把密钥写进聊天内容。" overlayTheme={overlayTheme} darkMode={darkMode} fieldState="optional" example="OPENAI_API_KEY=...">
      <Input.TextArea
        rows={3}
        value={envDraft}
        onChange={(event) => onEnvDraftChange(event.target.value)}
        placeholder={"环境变量，每行一个 KEY=VALUE，例如：\nOPENAI_API_KEY=...\nGITHUB_TOKEN=..."}
        style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}`, fontFamily: 'var(--gn-font-mono)' }}
      />
      <div style={{ ...buildMCPHintStyle(parsedEnvDraft.invalidLines.length > 0 ? '#d97706' : overlayTheme.mutedText) }}>
        {envDraft.trim()
          ? parsedEnvDraft.invalidLines.length > 0
            ? `已识别 ${parsedEnvDraft.validLines} 条环境变量，另有 ${parsedEnvDraft.invalidLines.length} 行格式无效，本次不会保存：${parsedEnvDraft.invalidLines.slice(0, 2).join(' / ')}`
            : `已识别 ${parsedEnvDraft.validLines} 条环境变量。`
          : '每行都要写成 KEY=VALUE；没有等号或 key 含空格的行不会保存。'}
      </div>
    </AIMCPHelpBlock>

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

    <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)' }}>
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>操作说明</div>
      <div style={{ ...buildMCPHintStyle(overlayTheme.mutedText), marginTop: 4 }}>
        <strong>测试工具发现</strong>
        {' '}只会按当前字段试启动一次，检查能发现哪些工具，不会保存配置。
        {' '}<strong>保存</strong>
        {' '}才会把这条 MCP 长期写入本地配置。
        {serverTools.length > 0
          ? ' 当前上方列出的工具，就是最近一次测试成功后发现到的别名。'
          : ' 建议先测试成功，再保存；测试通过后，上方会显示这条服务实际发现到的工具。'}
      </div>
    </div>

    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <Button onClick={onTest} loading={loading} style={{ borderRadius: 10 }}>测试工具发现</Button>
      <Button type="primary" onClick={onSave} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>保存</Button>
      <Popconfirm title="删除这个 MCP 服务？" okText="删除" cancelText="取消" onConfirm={onDelete}>
        <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 10 }}>删除</Button>
      </Popconfirm>
    </div>
  </>
);

export default AIMCPServerFormPanel;
