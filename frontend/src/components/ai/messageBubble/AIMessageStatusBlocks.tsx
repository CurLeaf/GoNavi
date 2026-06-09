import React, { useEffect, useMemo, useState } from 'react';
import { ApiOutlined, CaretDownOutlined, CaretRightOutlined, CheckOutlined } from '@ant-design/icons';

import type { AIChatMessage, AIToolCall } from '../../../types';
import type { OverlayWorkbenchTheme } from '../../../utils/overlayWorkbenchTheme';

interface AIThinkingBlockProps {
  displayThinking: string;
  isTyping: boolean;
  isGlobalLoading: boolean;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  hasContent: boolean;
}

interface AIToolCallingBlockProps {
  toolCalls: AIToolCall[];
  loading: boolean;
  allMessages: AIChatMessage[];
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  hasContent: boolean;
}

const TOOL_ACTION_LABELS: Record<string, string> = {
  inspect_ai_runtime: '读取当前 AI 运行状态',
  inspect_ai_safety: '读取当前 AI 安全边界',
  inspect_ai_providers: '读取当前 AI 供应商与模型配置',
  inspect_ai_chat_readiness: '读取当前 AI 聊天发送前置状态',
  inspect_mcp_setup: '读取当前 MCP 配置状态',
  inspect_mcp_authoring_guide: '读取 MCP 新增填写指引',
  inspect_ai_guidance: '读取当前 AI 提示与技能配置',
  get_connections: '获取可用连接信息',
  get_databases: '扫描数据库列表',
  get_tables: '分析表结构信息',
  get_all_columns: '汇总跨表字段摘要',
  get_columns: '核对真实字段定义',
  get_indexes: '检查索引定义',
  get_foreign_keys: '梳理外键关系',
  get_triggers: '检查触发器逻辑',
  get_table_ddl: '提取建表语句',
  inspect_table_bundle: '抓取完整表结构快照',
  inspect_database_bundle: '抓取数据库结构总览',
  inspect_current_connection: '读取当前连接摘要',
  inspect_connection_capabilities: '读取当前连接能力矩阵',
  inspect_saved_connections: '盘点本地已保存连接',
  inspect_external_sql_directories: '盘点外部 SQL 目录',
  inspect_external_sql_file: '读取外部 SQL 文件',
  inspect_ai_sessions: '盘点本地 AI 历史会话',
  inspect_active_tab: '读取当前活动页签',
  inspect_workspace_tabs: '盘点当前工作区页签',
  inspect_recent_sql_logs: '回看最近 SQL 执行日志',
  inspect_recent_sql_activity: '总结最近 SQL 活动',
  inspect_app_logs: '回看 GoNavi 应用日志',
  inspect_ai_last_render_error: '读取最近一次 AI 渲染异常',
  inspect_saved_queries: '检索本地已保存查询',
  inspect_sql_snippets: '读取 SQL 片段模板',
  inspect_shortcuts: '读取当前快捷键配置',
  preview_table_rows: '预览真实样例数据',
  execute_sql: '执行只读 SQL 验证',
};

const AIToolResultItem: React.FC<{ resultMsg: AIChatMessage; darkMode: boolean; overlayTheme: OverlayWorkbenchTheme }> = ({ resultMsg, darkMode, overlayTheme }) => {
  const [toolExpanded, setToolExpanded] = useState(false);
  const charCount = resultMsg.content ? resultMsg.content.length : 0;

  return (
    <div style={{
      background: darkMode ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.02)',
      borderRadius: 6,
      padding: '6px 10px',
      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
      marginTop: 8,
      width: '100%',
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 6, fontSize: 12, color: overlayTheme.mutedText }}
        onClick={() => setToolExpanded((prev) => !prev)}
      >
        {toolExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
        <ApiOutlined style={{ color: '#1677ff' }} />
        <span>探针执行结果 (<span style={{ fontFamily: 'var(--gn-font-mono)', color: overlayTheme.iconColor }}>{resultMsg.tool_name || 'unknown'}</span>)</span>
        <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.6 }}>{charCount > 0 ? `${charCount} 个字符` : '无数据'}</span>
      </div>
      {toolExpanded && (
        <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, fontFamily: 'var(--gn-font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflowY: 'auto', background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 6 }}>
          {resultMsg.content}
        </div>
      )}
    </div>
  );
};

export const AIThinkingBlock: React.FC<AIThinkingBlockProps> = ({
  displayThinking,
  isTyping,
  isGlobalLoading,
  darkMode,
  overlayTheme,
  hasContent,
}) => {
  const isActivelyThinking = isGlobalLoading && !hasContent;
  const [expanded, setExpanded] = useState(isActivelyThinking);
  const contentRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActivelyThinking) {
      setExpanded(true);
    }
  }, [isActivelyThinking]);

  useEffect(() => {
    if (!isGlobalLoading) {
      setExpanded(false);
    }
  }, [isGlobalLoading]);

  useEffect(() => {
    if (expanded && isTyping && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [displayThinking, expanded, isTyping]);

  return (
    <div style={{
      marginBottom: hasContent ? 8 : 0,
      borderRadius: 6,
      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
      overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          cursor: 'pointer',
          background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          fontSize: 12,
          color: overlayTheme.mutedText,
          userSelect: 'none',
        }}
      >
        <span style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10 }}>▶</span>
        <span>💭 思考过程</span>
        {isActivelyThinking && <span style={{ fontSize: 10, color: '#8b5cf6', animation: 'pulse 1.5s ease-in-out infinite' }}>思考中...</span>}
        {!isActivelyThinking && <span style={{ fontSize: 10, opacity: 0.5 }}>({displayThinking.length} 字)</span>}
      </div>
      <div className={`ai-expand-transition ${expanded ? 'expanded' : 'collapsed'}`}>
        <div ref={contentRef} style={{
          padding: expanded ? '8px 12px' : '0 12px',
          borderLeft: '3px solid #8b5cf6',
          margin: '0 8px 8px',
          fontSize: 12,
          lineHeight: 1.7,
          color: overlayTheme.mutedText,
          fontStyle: 'italic',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 400,
          overflowY: 'auto',
        }}>
          {displayThinking}
          {isTyping && <span className="ai-blinking-cursor" style={{ background: '#8b5cf6', marginLeft: 4, width: 6, height: 12, display: 'inline-block', verticalAlign: 'middle', opacity: 0.8 }} />}
        </div>
      </div>
    </div>
  );
};

export const AIToolCallingBlock: React.FC<AIToolCallingBlockProps> = ({
  toolCalls,
  loading,
  allMessages,
  darkMode,
  overlayTheme,
  hasContent,
}) => {
  const toolResultsById = useMemo(() => {
    return new Map(
      allMessages
        .filter((message) => message.role === 'tool' && message.tool_call_id)
        .map((message) => [message.tool_call_id as string, message]),
    );
  }, [allMessages]);
  const allDone = toolCalls.every((toolCall) => toolResultsById.has(toolCall.id));
  const [expanded, setExpanded] = useState(!allDone && loading);

  useEffect(() => {
    if (allDone || !loading) {
      setExpanded(false);
    }
  }, [allDone, loading]);

  return (
    <div style={{
      background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.025)',
      borderRadius: 8,
      fontSize: 12,
      overflow: 'hidden',
      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
      marginTop: hasContent ? 12 : 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          cursor: 'pointer',
          userSelect: 'none',
          background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: overlayTheme.titleText, fontWeight: 500 }}>
          {!allDone && loading ? (
            <div className="ai-spinning-ring" />
          ) : (
            <CheckOutlined style={{ color: '#10b981' }} />
          )}
          <span>{!allDone && loading ? '正在执行数据探针...' : `数据探针执行完毕 (${toolCalls.length} 项)`}</span>
        </div>
        <span style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10, color: overlayTheme.mutedText }}>▶</span>
      </div>
      <div className={`ai-expand-transition ${expanded ? 'expanded' : 'collapsed'}`}>
        <div style={{ padding: expanded ? '4px 12px 12px' : '0 12px' }}>
          {toolCalls.map((toolCall) => {
            const resultMsg = toolResultsById.get(toolCall.id);
            const isDone = Boolean(resultMsg);
            const actionName = TOOL_ACTION_LABELS[toolCall.function.name] || toolCall.function.name;
            return (
              <div key={toolCall.id} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                marginTop: 6,
                paddingLeft: 8,
                borderLeft: `2px solid ${isDone ? '#10b981' : (loading ? '#1677ff' : overlayTheme.shellBorder)}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isDone
                    ? <CheckOutlined style={{ color: '#10b981', fontSize: 11 }} />
                    : (loading ? <div className="ai-spinning-ring" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : <ApiOutlined style={{ color: overlayTheme.mutedText, fontSize: 11 }} />)}
                  <span style={{ color: isDone ? overlayTheme.mutedText : overlayTheme.titleText }}>{actionName}</span>
                </div>
                {resultMsg && <AIToolResultItem resultMsg={resultMsg} darkMode={darkMode} overlayTheme={overlayTheme} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
