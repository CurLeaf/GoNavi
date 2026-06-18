import React, { useState } from 'react';
import { Tooltip, message } from 'antd';
import { CheckOutlined, CopyOutlined, PlayCircleOutlined } from '@ant-design/icons';
import mermaid from 'mermaid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

import Modal from '../../common/ResizableDraggableModal';
import type { OverlayWorkbenchTheme } from '../../../utils/overlayWorkbenchTheme';
import { buildAIReadonlyPreviewSQL } from '../../../utils/aiSqlLimit';

interface AIMessageCodeBlockProps {
  className?: string;
  inline?: boolean;
  children?: React.ReactNode;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  activeConnectionConfig?: any;
  activeConnectionId?: string;
  activeDbName?: string;
}

interface HighlightedCodeBlockProps {
  language: string;
  codeText: string;
  displayText: string;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  activeConnectionConfig?: any;
  activeConnectionId?: string;
  activeDbName?: string;
}

const MermaidRenderer: React.FC<{ chart: string; darkMode: boolean }> = ({ chart, darkMode }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    try {
      mermaid.initialize({ startOnLoad: false, theme: darkMode ? 'dark' : 'default' });
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      (async () => {
        const result: any = await mermaid.render(id, chart);
        if (containerRef.current) {
          containerRef.current.innerHTML = result.svg || result;
        }
      })().catch((error: any) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="color:#ef4444; padding:12px; background:rgba(239,68,68,0.1); border-radius:6px; font-size:12px">Mermaid 解析失败: ${error.message}</div>`;
        }
      });
    } catch (error: any) {
      if (containerRef.current) {
        containerRef.current.innerHTML = `<div style="color:#ef4444; padding:12px; background:rgba(239,68,68,0.1); border-radius:6px; font-size:12px">Mermaid 渲染异常: ${error.message}</div>`;
      }
    }
  }, [chart, darkMode]);

  return <div ref={containerRef} className="ai-mermaid-container" style={{ margin: '16px 0', display: 'flex', justifyContent: 'flex-start', overflowX: 'auto' }} />;
};

const CodeCopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  return (
    <span
      className="ai-code-copy-btn"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        opacity: copied ? 1 : 0.6,
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={(event) => { event.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(event) => { event.currentTarget.style.opacity = copied ? '1' : '0.6'; }}
    >
      {copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
      <span style={{ marginLeft: 4 }}>{copied ? '已复制' : '复制代码'}</span>
    </span>
  );
};

const CodeRunButton: React.FC<{ text: string; connectionId?: string; dbName?: string }> = ({ text, connectionId, dbName }) => {
  const contextMatch = text.match(/^--\s*@context\s+connectionId=(\S+)\s+dbName=(\S+)/m);
  const resolvedConnId = contextMatch?.[1] || connectionId;
  const resolvedDbName = contextMatch?.[2] || dbName;
  const cleanSql = text.replace(/^--\s*@context\s+.*\n?/gm, '').trim();
  const sqlDetail = (runImmediately: boolean) => ({
    sql: cleanSql,
    runImmediately,
    connectionId: resolvedConnId,
    dbName: resolvedDbName,
  });

  const handleExecute = async () => {
    try {
      const Service = (window as any).go?.aiservice?.Service;
      if (Service?.AICheckSQL) {
        const result = await Service.AICheckSQL(text);
        if (!result.allowed) {
          message.error(`🔒 安全策略拦截：当前安全级别不允许执行 ${result.operationType} 类型的 SQL。请在 AI 设置中调整安全级别。`);
          return;
        }
        if (result.requiresConfirm) {
          Modal.confirm({
            title: '⚠️ 安全确认',
            content: result.warningMessage || `此 SQL 为 ${result.operationType} 操作，确定要执行吗？`,
            okText: '确认执行',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => {
              window.dispatchEvent(new CustomEvent('gonavi:insert-sql', { detail: sqlDetail(true) }));
            },
          });
          return;
        }
      }
      window.dispatchEvent(new CustomEvent('gonavi:insert-sql', { detail: sqlDetail(true) }));
    } catch {
      window.dispatchEvent(new CustomEvent('gonavi:insert-sql', { detail: sqlDetail(true) }));
    }
  };

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <Tooltip title="将该段 SQL 注入查询工作区（可快捷修改或执行）">
        <span
          className="ai-code-run-btn"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('gonavi:insert-sql', { detail: sqlDetail(false) }));
          }}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.6,
            transition: 'opacity 0.2s',
            padding: '0 4px',
            color: '#10b981',
          }}
          onMouseEnter={(event) => { event.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(event) => { event.currentTarget.style.opacity = '0.6'; }}
        >
          <PlayCircleOutlined />
          <span style={{ marginLeft: 4 }}>插入</span>
        </span>
      </Tooltip>
      <Tooltip title="立即执行（受 AI 安全策略管控）">
        <span
          className="ai-code-run-btn"
          onClick={handleExecute}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.6,
            transition: 'opacity 0.2s',
            padding: '0 4px',
            color: '#1677ff',
          }}
          onMouseEnter={(event) => { event.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(event) => { event.currentTarget.style.opacity = '0.6'; }}
        >
          <PlayCircleOutlined />
          <span style={{ marginLeft: 4 }}>执行</span>
        </span>
      </Tooltip>
    </div>
  );
};

const HighlightedCodeBlock: React.FC<HighlightedCodeBlockProps> = ({
  language,
  codeText,
  displayText,
  darkMode,
  overlayTheme,
  activeConnectionConfig,
  activeConnectionId,
  activeDbName,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const isLongCode = displayText.split('\n').length > 15;
  const isSql = language === 'sql';
  const isSelectQuery = isSql && /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i.test(displayText.trim());

  const handleInlineExecute = async () => {
    if (!activeConnectionConfig || previewLoading) {
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewData(null);
    try {
      const { DBQuery } = await import('../../../../wailsjs/go/app/App');
      const previewSql = buildAIReadonlyPreviewSQL(
        activeConnectionConfig?.type || '',
        displayText,
        50,
        activeConnectionConfig?.driver || '',
        { oceanBaseProtocol: activeConnectionConfig?.oceanBaseProtocol },
      );
      const response = await DBQuery(activeConnectionConfig, activeDbName || '', previewSql);
      if (response.success && Array.isArray(response.data)) {
        const rows = response.data as any[];
        setPreviewCols(rows.length > 0 ? Object.keys(rows[0]) : []);
        setPreviewData(rows.slice(0, 20));
        setPreviewExpanded(true);
      } else {
        setPreviewError(response.message || '查询无结果');
      }
    } catch (error: any) {
      setPreviewError(error?.message || '执行失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="ai-code-block-container" style={{ margin: '12px 0', border: overlayTheme.sectionBorder, borderRadius: 6, overflow: 'hidden' }}>
      <div
        className="ai-code-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
          fontSize: 12,
          color: overlayTheme.mutedText,
        }}
      >
        <span style={{ fontFamily: 'var(--gn-font-mono)' }}>{language}</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isSql && <CodeRunButton text={codeText} connectionId={activeConnectionId} dbName={activeDbName} />}
          {isSelectQuery && activeConnectionConfig && (
            <Tooltip title="在聊天内预览查询结果（最多20行）">
              <span
                onClick={handleInlineExecute}
                style={{
                  cursor: previewLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: previewLoading ? 1 : 0.6,
                  transition: 'opacity 0.2s',
                  padding: '0 4px',
                  color: '#faad14',
                }}
                onMouseEnter={(event) => {
                  if (!previewLoading) {
                    event.currentTarget.style.opacity = '1';
                  }
                }}
                onMouseLeave={(event) => {
                  if (!previewLoading) {
                    event.currentTarget.style.opacity = '0.6';
                  }
                }}
              >
                {previewLoading ? '⏳' : '👁'}
                <span style={{ marginLeft: 4 }}>{previewLoading ? '执行中...' : '预览'}</span>
              </span>
            </Tooltip>
          )}
          <CodeCopyButton text={displayText} />
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <SyntaxHighlighter
          style={darkMode ? vscDarkPlus as any : vs as any}
          language={language}
          PreTag="div"
          showLineNumbers
          customStyle={{
            margin: 0,
            borderRadius: 0,
            background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
            maxHeight: expanded ? 'none' : (isLongCode ? 300 : 'none'),
            overflowY: expanded ? 'auto' : 'hidden',
            fontSize: '14px',
            lineHeight: 1.6,
          }}
          codeTagProps={{
            style: {
              fontSize: '14px',
              fontFamily: 'var(--gn-font-mono)',
            },
          }}
        >
          {displayText}
        </SyntaxHighlighter>

        {!expanded && isLongCode && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
              background: `linear-gradient(to bottom, transparent, ${darkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'})`,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 8,
              cursor: 'pointer',
            }}
            onClick={() => setExpanded(true)}
          >
            <span style={{ fontSize: 12, color: overlayTheme.iconColor, background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 12 }}>
              展开全部代码
            </span>
          </div>
        )}
        {expanded && isLongCode && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '6px 0',
              background: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.02)',
              cursor: 'pointer',
              borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
            }}
            onClick={() => setExpanded(false)}
          >
            <span style={{ fontSize: 12, color: overlayTheme.iconColor }}>收起代码</span>
          </div>
        )}
      </div>

      {previewError && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: '#ef4444', background: darkMode ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
          ❌ {previewError}
        </div>
      )}
      {previewExpanded && previewData && previewData.length > 0 && (
        <div style={{ borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', background: darkMode ? 'rgba(250,173,20,0.08)' : 'rgba(250,173,20,0.05)' }}>
            <span style={{ fontSize: 11, color: overlayTheme.mutedText }}>📊 预览结果（{previewData.length} 行 × {previewCols.length} 列）</span>
            <span style={{ fontSize: 11, color: overlayTheme.mutedText, cursor: 'pointer' }} onClick={() => setPreviewExpanded(false)}>收起 ▴</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--gn-font-mono)' }}>
              <thead>
                <tr>
                  {previewCols.map((column) => (
                    <th key={column} style={{ padding: '4px 8px', textAlign: 'left', background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: overlayTheme.titleText, fontWeight: 600, whiteSpace: 'nowrap', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {previewCols.map((column) => (
                      <td key={column} style={{ padding: '3px 8px', color: overlayTheme.mutedText, whiteSpace: 'nowrap', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row[column] === null ? <span style={{ color: '#999', fontStyle: 'italic' }}>NULL</span> : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!previewExpanded && previewData && previewData.length > 0 && (
        <div
          style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 11, color: overlayTheme.mutedText, background: darkMode ? 'rgba(250,173,20,0.05)' : 'rgba(250,173,20,0.03)', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}` }}
          onClick={() => setPreviewExpanded(true)}
        >
          📊 查看结果（{previewData.length} 行）▾
        </div>
      )}
    </div>
  );
};

export const AIMessageCodeBlock: React.FC<AIMessageCodeBlockProps> = ({
  className,
  inline,
  children,
  darkMode,
  overlayTheme,
  activeConnectionConfig,
  activeConnectionId,
  activeDbName,
}) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!inline && match && match[1] === 'mermaid') {
    return <MermaidRenderer chart={String(children).replace(/\n$/, '')} darkMode={darkMode} />;
  }

  if (!inline && match) {
    const codeText = String(children).replace(/\n$/, '');
    const displayText = codeText.replace(/^--\s*@context\s+.*\n?/gm, '').trim();

    return (
      <HighlightedCodeBlock
        language={match[1]}
        codeText={codeText}
        displayText={displayText}
        darkMode={darkMode}
        overlayTheme={overlayTheme}
        activeConnectionConfig={activeConnectionConfig}
        activeConnectionId={activeConnectionId}
        activeDbName={activeDbName}
      />
    );
  }

  return <code className={className}>{children}</code>;
};
