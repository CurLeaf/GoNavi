import React from 'react';

import {
  DEFAULT_AI_SLASH_COMMANDS,
  getFeaturedAISlashCommands,
  groupAISlashCommands,
  type AISlashCommandDefinition,
} from './aiSlashCommands';

interface AISlashCommandMenuProps {
  visible: boolean;
  commands: AISlashCommandDefinition[];
  darkMode: boolean;
  textColor: string;
  mutedColor: string;
  className?: string;
  style?: React.CSSProperties;
  onSelect: (command: AISlashCommandDefinition) => void;
}

const featuredCommands = getFeaturedAISlashCommands();

const commandCardStyle = (darkMode: boolean): React.CSSProperties => ({
  padding: '10px 12px',
  borderRadius: 10,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  transition: 'background 0.15s',
});

export const AISlashCommandMenu: React.FC<AISlashCommandMenuProps> = ({
  visible,
  commands,
  darkMode,
  textColor,
  mutedColor,
  className,
  style,
  onSelect,
}) => {
  if (!visible) {
    return null;
  }

  const groups = groupAISlashCommands(commands);

  return (
    <div
      data-ai-chat-slash-menu="true"
      className={className}
      style={style}
    >
      {groups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 6 }}>
          {groups.map((group) => (
            <div key={group.key} data-ai-chat-slash-group={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ padding: '2px 6px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: textColor }}>{group.title}</div>
                <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5 }}>{group.description}</div>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {group.commands.map((command) => (
                  <div
                    key={command.cmd}
                    style={commandCardStyle(darkMode)}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => onSelect(command)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: textColor, minWidth: 74 }}>{command.cmd}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: textColor }}>{command.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5, paddingLeft: 82 }}>{command.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          data-ai-chat-slash-empty="true"
          style={{
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor }}>
            没有匹配的快捷命令
          </div>
          <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5 }}>
            可以先试这些更常用的入口，快速走到生成 SQL、AI 体检或 MCP 排查。
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {featuredCommands.map((command) => (
              <button
                key={command.cmd}
                type="button"
                onClick={() => onSelect(command)}
                style={{
                  borderRadius: 999,
                  border: `1px solid ${darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)'}`,
                  background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.82)',
                  color: textColor,
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                {command.cmd}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5 }}>
            当前共提供 {DEFAULT_AI_SLASH_COMMANDS.length} 个 slash 命令，支持按命令名、中文说明或关键词搜索。
          </div>
        </div>
      )}
    </div>
  );
};

export default AISlashCommandMenu;
