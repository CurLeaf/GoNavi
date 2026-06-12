import React from 'react';
import { Button, Input } from 'antd';
import { RobotOutlined } from '@ant-design/icons';

import type { AIUserPromptSettings } from '../../types';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface AISettingsPromptsSectionProps {
  builtinPrompts: Record<string, string>;
  userPromptSettings: AIUserPromptSettings;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  darkMode: boolean;
  loading: boolean;
  onChangeUserPrompt: (key: keyof AIUserPromptSettings, value: string) => void;
  onSave: () => void;
}

const USER_PROMPT_FIELDS: Array<{
  key: keyof AIUserPromptSettings;
  title: string;
  desc: string;
  rows: number;
}> = [
  {
    key: 'global',
    title: '全局补充提示词',
    desc: '对所有 AI 会话生效，例如“先给结论”“回答保持简洁”。',
    rows: 4,
  },
  {
    key: 'database',
    title: '数据库会话补充提示词',
    desc: '仅数据库/SQL 场景生效，例如“生成 SQL 前必须先确认字段名”。',
    rows: 5,
  },
  {
    key: 'jvm',
    title: 'JVM 资源分析补充提示词',
    desc: '仅 JVM 资源浏览/分析场景生效。',
    rows: 4,
  },
  {
    key: 'jvmDiagnostic',
    title: 'JVM 诊断补充提示词',
    desc: '仅 JVM 诊断工作台生效，例如“先给计划，再给命令”。',
    rows: 4,
  },
];

const AISettingsPromptsSection: React.FC<AISettingsPromptsSectionProps> = ({
  builtinPrompts,
  userPromptSettings,
  overlayTheme,
  cardBg,
  cardBorder,
  inputBg,
  darkMode,
  loading,
  onChangeUserPrompt,
  onSave,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        border: `1px solid ${cardBorder}`,
        background: cardBg,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, marginBottom: 6 }}>
        用户级自定义提示词
      </div>
      <div style={{ fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.6, marginBottom: 14 }}>
        这里的内容会在系统内置提示词之后，以 system message 的形式追加注入。
        适合放你的个人风格偏好、输出约束、团队规范。涉及安全红线时，系统规则仍然优先。
      </div>

      {USER_PROMPT_FIELDS.map((item) => (
        <div key={item.key} style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: overlayTheme.titleText, marginBottom: 4 }}>
            {item.title}
          </div>
          <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, marginBottom: 8 }}>
            {item.desc}
          </div>
          <Input.TextArea
            rows={item.rows}
            value={userPromptSettings[item.key]}
            onChange={(event) => onChangeUserPrompt(item.key, event.target.value)}
            placeholder="留空表示不额外追加"
            style={{
              borderRadius: 10,
              background: inputBg,
              border: `1px solid ${cardBorder}`,
              fontFamily: 'var(--gn-font-mono)',
              resize: 'vertical',
            }}
          />
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button type="primary" onClick={onSave} loading={loading} style={{ borderRadius: 10, fontWeight: 600 }}>
          保存自定义提示词
        </Button>
      </div>
    </div>

    <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
      以下为当前版本 GoNavi 预设的底层 AI 提示词（只读）。它们会先于上面的用户级提示词注入到对应场景的请求上下文中。
    </div>
    {Object.entries(builtinPrompts).map(([title, promptText]) => (
      <div
        key={title}
        style={{
          padding: '12px',
          borderRadius: 12,
          border: `1px solid ${cardBorder}`,
          background: cardBg,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: overlayTheme.titleText,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <RobotOutlined style={{ color: overlayTheme.iconColor }} /> {title}
        </div>
        <div
          style={{
            background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            color: overlayTheme.mutedText,
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--gn-font-mono)',
            lineHeight: 1.5,
            userSelect: 'text',
            border: darkMode ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.02)',
          }}
        >
          {promptText}
        </div>
      </div>
    ))}
  </div>
);

export default AISettingsPromptsSection;
