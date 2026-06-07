import React from 'react';

export interface AISlashCommandDefinition {
  cmd: string;
  label: string;
  desc: string;
  prompt: string;
}

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

  return (
    <div
      data-ai-chat-slash-menu="true"
      className={className}
      style={style}
    >
      {commands.length > 0 ? commands.map((command) => (
        <div
          key={command.cmd}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'transparent';
          }}
          onClick={() => onSelect(command)}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: textColor, minWidth: 80 }}>{command.cmd}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: textColor }}>{command.label}</span>
          <span style={{ fontSize: 11, color: mutedColor, marginLeft: 'auto' }}>{command.desc}</span>
        </div>
      )) : (
        <div
          data-ai-chat-slash-empty="true"
          style={{
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor }}>
            没有匹配的快捷命令
          </div>
          <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5 }}>
            可尝试 `/query`、`/sql`、`/explain`、`/optimize` 等内置命令。
          </div>
        </div>
      )}
    </div>
  );
};

export default AISlashCommandMenu;
