import React from 'react';
import { Tag } from 'antd';
import { DatabaseOutlined, DownOutlined, PlusOutlined, TableOutlined } from '@ant-design/icons';

import type { AIContextItem } from '../../types';

interface AIChatContextPreviewProps {
  variant: 'legacy' | 'v2';
  activeContextItems: AIContextItem[];
  contextExpanded: boolean;
  darkMode: boolean;
  textColor: string;
  onToggleExpanded: () => void;
  onOpenContext: () => void;
  onRemoveContext: (dbName: string, tableName: string) => void;
}

const renderContextTableChips = (
  activeContextItems: AIContextItem[],
  onRemoveContext: (dbName: string, tableName: string) => void,
  className?: string,
  style?: React.CSSProperties,
) => activeContextItems.map((ctx, idx) => (
  <Tag
    key={`ctx-${idx}`}
    closable
    onClose={(event) => {
      event.preventDefault();
      onRemoveContext(ctx.dbName, ctx.tableName);
    }}
    className={className}
    style={style}
  >
    <TableOutlined />
    <span>{ctx.tableName}</span>
  </Tag>
));

export const AIChatContextPreview: React.FC<AIChatContextPreviewProps> = ({
  variant,
  activeContextItems,
  contextExpanded,
  darkMode,
  textColor,
  onToggleExpanded,
  onOpenContext,
  onRemoveContext,
}) => {
  if (variant === 'v2') {
    return (
      <>
        <div className="ai-chat-input-preview-area gn-v2-ai-context-row">
          <button
            type="button"
            className={`gn-v2-ai-context-toggle${contextExpanded ? ' is-expanded' : ''}`}
            onClick={onToggleExpanded}
            aria-expanded={contextExpanded}
          >
            <TableOutlined />
            <span>关联上下文</span>
            <strong>{activeContextItems.length}</strong>
            <DownOutlined />
          </button>
          <button
            type="button"
            className="gn-v2-ai-context-add"
            onClick={onOpenContext}
          >
            <PlusOutlined />
            <span>添加</span>
          </button>
        </div>

        {contextExpanded && activeContextItems.length > 0 && (
          <div className="gn-v2-ai-context-detail" data-ai-context-detail="true">
            <div className="gn-v2-ai-context-detail-title">当前上下文 · {activeContextItems.length}</div>
            {renderContextTableChips(activeContextItems, onRemoveContext, 'gn-v2-ai-context-table-chip', { margin: 0 })}
          </div>
        )}
      </>
    );
  }

  if (activeContextItems.length === 0) {
    return null;
  }

  return (
    <>
      <Tag
        onClick={onToggleExpanded}
        style={{ background: darkMode ? 'rgba(24, 144, 255, 0.15)' : 'rgba(24, 144, 255, 0.08)', border: 'none', color: '#1890ff', borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, margin: 0, cursor: 'pointer', transition: 'all 0.3s' }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <DatabaseOutlined /> 关联上下文 ({activeContextItems.length}) {contextExpanded ? '▴' : '▾'}
        </span>
      </Tag>
      {contextExpanded && renderContextTableChips(
        activeContextItems,
        onRemoveContext,
        undefined,
        { background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', border: 'none', color: textColor, borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, margin: 0 },
      )}
    </>
  );
};

export default AIChatContextPreview;
