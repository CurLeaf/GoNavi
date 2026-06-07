import React, { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons';

import type { AIChatMessage } from '../../types';
import { useStore } from '../../store';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { extractJVMChangePlan, resolveJVMAIPlanTargetTabId } from '../../utils/jvmAiPlan';
import {
  parseJVMDiagnosticPlan,
  resolveJVMDiagnosticPlanTargetTabId,
} from '../../utils/jvmDiagnosticPlan';
import { AIMessageMarkdown } from './messageBubble/AIMessageMarkdown';
import { AIThinkingBlock, AIToolCallingBlock } from './messageBubble/AIMessageStatusBlocks';

interface AIMessageBubbleProps {
  msg: AIChatMessage;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  textColor: string;
  onEdit: (msg: AIChatMessage) => void;
  onRetry: (msg: AIChatMessage) => void;
  onDelete: (id: string) => void;
  activeConnectionId?: string;
  activeConnectionConfig?: any;
  activeDbName?: string;
  allMessages?: AIChatMessage[];
}

interface AIMessageActionBarProps {
  msg: AIChatMessage;
  isUser: boolean;
  isCopied: boolean;
  textColor: string;
  mutedText: string;
  onEdit: (msg: AIChatMessage) => void;
  onRetry: (msg: AIChatMessage) => void;
  onDelete: (id: string) => void;
  onCopy: () => void;
}

const AIMessageActionBar: React.FC<AIMessageActionBarProps> = ({
  msg,
  isUser,
  isCopied,
  textColor,
  mutedText,
  onEdit,
  onRetry,
  onDelete,
  onCopy,
}) => (
  <div className="ai-message-actions" style={{ display: 'flex', gap: 8, opacity: 0, transition: 'opacity 0.2s', padding: '0 4px' }}>
    <Tooltip title={isCopied ? '已复制' : '复制全文'}>
      {isCopied ? (
        <CheckOutlined className="ai-action-icon" style={{ color: '#10b981' }} />
      ) : (
        <CopyOutlined
          className="ai-action-icon"
          onClick={onCopy}
          style={{ cursor: 'pointer', color: mutedText }}
          onMouseEnter={(event) => { event.currentTarget.style.color = textColor; }}
          onMouseLeave={(event) => { event.currentTarget.style.color = mutedText; }}
        />
      )}
    </Tooltip>
    {isUser ? (
      <Tooltip title="编辑此条消息（移除其后所有记录并重新发送）">
        <EditOutlined
          className="ai-action-icon"
          onClick={() => onEdit(msg)}
          style={{ cursor: 'pointer', color: mutedText }}
          onMouseEnter={(event) => { event.currentTarget.style.color = textColor; }}
          onMouseLeave={(event) => { event.currentTarget.style.color = mutedText; }}
        />
      </Tooltip>
    ) : (
      <Tooltip title="重新生成（移除此条并触发上次用户输入重发）">
        <ReloadOutlined
          className="ai-action-icon"
          onClick={() => onRetry(msg)}
          style={{ cursor: 'pointer', color: mutedText }}
          onMouseEnter={(event) => { event.currentTarget.style.color = textColor; }}
          onMouseLeave={(event) => { event.currentTarget.style.color = mutedText; }}
        />
      </Tooltip>
    )}
    <Tooltip title="删除单条消息">
      <DeleteOutlined
        className="ai-action-icon"
        onClick={() => onDelete(msg.id)}
        style={{ cursor: 'pointer', color: mutedText }}
        onMouseEnter={(event) => { event.currentTarget.style.color = '#ef4444'; }}
        onMouseLeave={(event) => { event.currentTarget.style.color = mutedText; }}
      />
    </Tooltip>
  </div>
);

const AIRawErrorButton: React.FC<{
  messageId: string;
  rawError: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
}> = ({ messageId, rawError, darkMode, overlayTheme }) => (
  <div style={{ marginTop: 8 }}>
    <button
      onClick={() => {
        navigator.clipboard.writeText(rawError || '');
        const button = document.getElementById(`raw-err-btn-${messageId}`);
        if (button) {
          button.textContent = '✅ 已复制';
          setTimeout(() => {
            button.textContent = '📋 复制报错原文';
          }, 1500);
        }
      }}
      id={`raw-err-btn-${messageId}`}
      style={{
        fontSize: 12,
        padding: '3px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
        background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
        color: overlayTheme.mutedText,
        transition: 'all 0.15s ease',
      }}
    >
      📋 复制报错原文
    </button>
  </div>
);

export const AIMessageBubble: React.FC<AIMessageBubbleProps> = React.memo(({
  msg,
  darkMode,
  overlayTheme,
  textColor,
  onEdit,
  onRetry,
  onDelete,
  activeConnectionId,
  activeConnectionConfig,
  activeDbName,
  allMessages,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const isUser = msg.role === 'user';
  const toolMessages = allMessages || [];

  const { displayContent, parsedThinking } = React.useMemo(() => {
    const content = msg.content || '';
    if (msg.thinking) {
      return { displayContent: content, parsedThinking: msg.thinking };
    }
    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
    const thinkParts: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = thinkRegex.exec(content)) !== null) {
      thinkParts.push(match[1].trim());
    }
    if (thinkParts.length > 0) {
      return {
        displayContent: content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim(),
        parsedThinking: thinkParts.join('\n\n'),
      };
    }
    return { displayContent: content, parsedThinking: '' };
  }, [msg.content, msg.thinking]);

  const jvmPlan = React.useMemo(() => {
    if (isUser) {
      return null;
    }
    return extractJVMChangePlan(displayContent);
  }, [displayContent, isUser]);

  const jvmDiagnosticPlan = React.useMemo(() => {
    if (isUser) {
      return null;
    }
    return parseJVMDiagnosticPlan(displayContent);
  }, [displayContent, isUser]);

  const isTypingThinking = Boolean(msg.loading && msg.phase === 'thinking');

  if (msg.role === 'tool') {
    return null;
  }

  const isWaitState = msg.phase === 'connecting'
    || (msg.loading && !msg.content && (msg.phase === 'thinking' || msg.phase === 'tool_calling'));

  if (isWaitState) {
    return (
      <div className="ai-ide-message" style={{ borderBottom: 'none', padding: '8px 16px' }}>
        <div style={{
          background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: overlayTheme.mutedText }}>
            <div className="ai-wave-pulse">
              <span /> <span /> <span />
            </div>
            <span style={{ fontSize: 13, opacity: 0.8 }}>{msg.content || '正在建立连接'}...</span>
          </div>

          <div style={{ marginTop: parsedThinking || (msg.tool_calls && msg.tool_calls.length > 0) ? 12 : 0 }}>
            {!isUser && parsedThinking && (
              <AIThinkingBlock
                displayThinking={parsedThinking}
                isTyping={isTypingThinking}
                isGlobalLoading={Boolean(msg.loading)}
                darkMode={darkMode}
                overlayTheme={overlayTheme}
                hasContent={false}
              />
            )}
            {!isUser && msg.tool_calls && msg.tool_calls.length > 0 && (
              <AIToolCallingBlock
                toolCalls={msg.tool_calls}
                loading={Boolean(msg.loading)}
                allMessages={toolMessages}
                darkMode={darkMode}
                overlayTheme={overlayTheme}
                hasContent={false}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-ide-message" style={{ borderBottom: 'none', padding: '8px 16px' }}>
      <div style={{
        background: isUser ? (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
        borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div className="ai-ide-message-header" style={{
          color: isUser ? overlayTheme.mutedText : overlayTheme.titleText,
          marginBottom: isUser ? 6 : 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            {isUser
              ? <><UserOutlined /> <span>You</span></>
              : <><RobotOutlined style={{ color: overlayTheme.iconColor }} /> <span>GoNavi AI</span></>}
          </div>
          <AIMessageActionBar
            msg={msg}
            isUser={isUser}
            isCopied={isCopied}
            textColor={textColor}
            mutedText={overlayTheme.mutedText}
            onEdit={onEdit}
            onRetry={onRetry}
            onDelete={onDelete}
            onCopy={() => {
              navigator.clipboard.writeText(msg.content);
              setIsCopied(true);
              setTimeout(() => setIsCopied(false), 2000);
            }}
          />
        </div>

        <div className="ai-ide-message-content ai-markdown-content" style={{ color: textColor }}>
          {msg.images && msg.images.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {msg.images.map((image, index) => (
                <img key={index} src={image} alt={`Attached ${index}`} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, objectFit: 'contain', border: overlayTheme.shellBorder }} />
              ))}
            </div>
          )}

          {!isUser && parsedThinking && (
            <AIThinkingBlock
              displayThinking={parsedThinking}
              isTyping={isTypingThinking}
              isGlobalLoading={Boolean(msg.loading)}
              darkMode={darkMode}
              overlayTheme={overlayTheme}
              hasContent={Boolean(msg.content)}
            />
          )}

          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>{msg.content}</div>
          ) : (
            <AIMessageMarkdown
              content={displayContent}
              darkMode={darkMode}
              overlayTheme={overlayTheme}
              activeConnectionConfig={activeConnectionConfig}
              activeConnectionId={activeConnectionId}
              activeDbName={activeDbName}
            />
          )}

          {!isUser && jvmPlan && (
            <div style={{ marginTop: 12 }}>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  const targetContext = msg.jvmPlanContext;
                  if (!targetContext) {
                    message.warning('这条 JVM 计划缺少来源页签上下文，请在目标 JVM 资源页重新生成。');
                    return;
                  }

                  const store = useStore.getState();
                  const targetTabId = resolveJVMAIPlanTargetTabId(store.tabs, targetContext);
                  if (!targetTabId) {
                    message.warning('未找到与该 JVM 计划匹配的资源页签，请先打开原目标资源后再应用。');
                    return;
                  }

                  window.dispatchEvent(new CustomEvent('gonavi:jvm-apply-ai-plan', {
                    detail: {
                      plan: jvmPlan,
                      targetTabId,
                      connectionId: targetContext.connectionId,
                      providerMode: targetContext.providerMode,
                      resourcePath: targetContext.resourcePath,
                    },
                  }));
                }}
              >
                应用到 JVM 预览
              </Button>
            </div>
          )}

          {!isUser && jvmDiagnosticPlan && (
            <div style={{ marginTop: 12 }}>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  const targetContext = msg.jvmDiagnosticPlanContext;
                  if (!targetContext) {
                    message.warning('这条诊断计划缺少来源页签上下文，请在目标诊断控制台重新生成。');
                    return;
                  }

                  const store = useStore.getState();
                  const targetTabId = resolveJVMDiagnosticPlanTargetTabId(
                    store.tabs,
                    store.connections,
                    targetContext,
                  );
                  if (!targetTabId) {
                    message.warning('未找到与该诊断计划匹配的诊断控制台页签，请先打开原目标控制台后再应用。');
                    return;
                  }

                  window.dispatchEvent(new CustomEvent('gonavi:jvm-apply-diagnostic-plan', {
                    detail: {
                      plan: jvmDiagnosticPlan,
                      targetTabId,
                      connectionId: targetContext.connectionId,
                      transport: targetContext.transport,
                    },
                  }));
                }}
              >
                应用到诊断控制台
              </Button>
            </div>
          )}

          {!isUser && msg.rawError && (
            <AIRawErrorButton
              messageId={msg.id}
              rawError={msg.rawError}
              darkMode={darkMode}
              overlayTheme={overlayTheme}
            />
          )}

          {!isUser && msg.tool_calls && msg.tool_calls.length > 0 && (
            <AIToolCallingBlock
              toolCalls={msg.tool_calls}
              loading={Boolean(msg.loading)}
              allMessages={toolMessages}
              darkMode={darkMode}
              overlayTheme={overlayTheme}
              hasContent={Boolean(msg.content)}
            />
          )}

          {msg.loading && msg.phase !== 'tool_calling' && msg.content && (
            <span className="ai-blinking-cursor" style={{ background: overlayTheme.iconColor }} />
          )}
        </div>
      </div>
    </div>
  );
});
