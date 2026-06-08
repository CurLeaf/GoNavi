import React from 'react';
import { DatabaseOutlined, HistoryOutlined, TableOutlined, WarningOutlined } from '@ant-design/icons';

export type AIChatPanelMode = 'chat' | 'insights' | 'history';

export interface AIChatInsightItem {
  tone: 'info' | 'accent' | 'warn';
  title: string;
  body: string;
}

export interface AIChatInlineHistorySession {
  id: string;
  title: string;
  updatedAt: number;
}

interface AIChatPanelModeContentProps {
  mode: AIChatPanelMode;
  insights: AIChatInsightItem[];
  sessions: AIChatInlineHistorySession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
}

const renderInsightIcon = (tone: AIChatInsightItem['tone']) => {
  if (tone === 'warn') {
    return <WarningOutlined />;
  }
  if (tone === 'accent') {
    return <DatabaseOutlined />;
  }
  return <TableOutlined />;
};

const AIChatPanelModeContent: React.FC<AIChatPanelModeContentProps> = ({
  mode,
  insights,
  sessions,
  activeSessionId,
  onSelectSession,
}) => {
  if (mode === 'insights') {
    return (
      <div className="gn-v2-ai-insights-list">
        {insights.map((item) => (
          <div className={`gn-v2-ai-insight-card tone-${item.tone}`} key={item.title}>
            <span className="gn-v2-ai-insight-icon">{renderInsightIcon(item.tone)}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'history') {
    if (sessions.length === 0) {
      return (
        <div className="gn-v2-ai-history-list">
          <div className="gn-v2-ai-empty-note">暂无历史会话</div>
        </div>
      );
    }

    return (
      <div className="gn-v2-ai-history-list">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={`gn-v2-ai-history-card${session.id === activeSessionId ? ' is-active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <span>
              <HistoryOutlined />
              <strong>{session.title || '新对话'}</strong>
            </span>
            <small>
              {new Date(session.updatedAt).toLocaleString(undefined, {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </small>
          </button>
        ))}
      </div>
    );
  }

  return null;
};

export default AIChatPanelModeContent;
