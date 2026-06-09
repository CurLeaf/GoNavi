import React from 'react';
import { Button, Input } from 'antd';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { ParseMCPCommandDraftResult } from '../../utils/mcpCommandDraft';
import {
  MCP_COMMAND_EXAMPLES,
  MCP_COMMAND_PARSE_EXAMPLE,
  MCP_FIELD_GUIDES,
  MCP_SERVER_FILL_STEPS,
} from '../../utils/mcpServerGuidance';
import AIMCPCommandDraftPreview from './AIMCPCommandDraftPreview';
import { buildMCPFieldTone, buildMCPHintStyle, mcpLabelStyle } from './AIMCPHelpBlock';

interface AIMCPServerGuidePanelProps {
  cardBorder: string;
  inputBg: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  rawCommandDraft: string;
  parsedCommandDraft: ParseMCPCommandDraftResult;
  onApplyCommandDraft: () => void;
  onRawCommandDraftChange: (value: string) => void;
}

const AIMCPServerGuidePanel: React.FC<AIMCPServerGuidePanelProps> = ({
  cardBorder,
  inputBg,
  darkMode,
  overlayTheme,
  rawCommandDraft,
  parsedCommandDraft,
  onApplyCommandDraft,
  onRawCommandDraftChange,
}) => (
  <>
    <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px dashed ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)' }}>
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>填写示例</div>
      <div style={{ ...buildMCPHintStyle(overlayTheme.mutedText), marginTop: 4 }}>
        启动命令只填可执行程序本身，不要把参数混在一起。常见形式：
        {' '}
        <code style={{ fontFamily: 'var(--gn-font-mono)' }}>{MCP_COMMAND_EXAMPLES.join(' / ')}</code>
      </div>
    </div>

    <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>推荐填写顺序</div>
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
        小白用户可以按这个顺序填：先选上面的模板或粘整行命令，再确认下面的必填项，最后只在需要时补参数、环境变量和超时。
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MCP_SERVER_FILL_STEPS.map((item) => (
          <span
            key={item.step}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              color: overlayTheme.titleText,
              background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
            }}
          >
            {item.step}. {item.title}
          </span>
        ))}
      </div>
    </div>

    <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>字段速查</div>
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
        如果看到某个参数名不知道该填什么，先看这一块；下面每个字段也都有更具体的示例和注意事项。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
        {MCP_FIELD_GUIDES.map((item) => {
          const tone = buildMCPFieldTone(item.fieldState, darkMode);
          return (
            <div
              key={item.key}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${cardBorder}`,
                background: darkMode ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.78)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>{item.title}</div>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: tone.color,
                    background: tone.bg,
                  }}
                >
                  {tone.label}
                </span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: overlayTheme.titleText }}>{item.summary}</div>
              <div style={buildMCPHintStyle(overlayTheme.mutedText)}>{item.detail}</div>
              {item.example ? (
                <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
                  示例值：
                  {' '}
                  <code style={{ fontFamily: 'var(--gn-font-mono)' }}>{item.example}</code>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>

    <div style={{ padding: '12px', borderRadius: 12, border: `1px solid ${cardBorder}`, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...mcpLabelStyle, color: overlayTheme.titleText }}>只有一条完整命令？</div>
      <div style={buildMCPHintStyle(overlayTheme.mutedText)}>
        直接粘贴完整命令，GoNavi 会自动拆成“启动命令 / 命令参数 / 环境变量”三块，适合你只拿到 README 里的一整行示例时快速录入。
      </div>
      <Input.TextArea
        rows={2}
        value={rawCommandDraft}
        onChange={(event) => onRawCommandDraftChange(event.target.value)}
        placeholder={`直接粘贴完整命令，例如：\n${MCP_COMMAND_PARSE_EXAMPLE}`}
        style={{ borderRadius: 10, background: inputBg, border: `1px solid ${cardBorder}`, fontFamily: 'var(--gn-font-mono)' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...buildMCPHintStyle(parsedCommandDraft.ok ? overlayTheme.mutedText : '#dc2626') }}>
          {rawCommandDraft.trim()
            ? parsedCommandDraft.ok && parsedCommandDraft.draft
              ? `将解析为：命令 ${parsedCommandDraft.draft.command}，参数 ${parsedCommandDraft.draft.args.length} 个，环境变量 ${Object.keys(parsedCommandDraft.draft.env).length} 个。`
              : parsedCommandDraft.error
            : '支持带引号路径、带空格参数，以及命令前缀的 KEY=VALUE 环境变量。'}
        </div>
        <Button onClick={onApplyCommandDraft} disabled={!parsedCommandDraft.ok} style={{ borderRadius: 10 }}>
          自动拆分到下方字段
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
  </>
);

export default AIMCPServerGuidePanel;
