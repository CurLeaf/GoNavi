import React, { useState } from 'react';
import { SearchOutlined, ToolOutlined } from '@ant-design/icons';

import {
  BUILTIN_TOOL_FLOWS,
  describeBuiltinToolParameters,
  filterBuiltinToolFlows,
  filterBuiltinTools,
} from '../../utils/aiBuiltinToolCatalog';
import { BUILTIN_AI_TOOL_INFO } from '../../utils/aiToolRegistry';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface AIBuiltinToolsCatalogProps {
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
}

export const AIBuiltinToolsCatalog: React.FC<AIBuiltinToolsCatalogProps> = ({
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
}) => {
  const [searchText, setSearchText] = useState('');
  const visibleFlows = filterBuiltinToolFlows(BUILTIN_TOOL_FLOWS, searchText);
  const visibleTools = filterBuiltinTools(BUILTIN_AI_TOOL_INFO, searchText);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
        AI 助手在处理数据库相关问题时，可以自动调用以下内置工具获取真实数据，全程无需人工干预。
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 10,
          border: `1px solid ${cardBorder}`,
          background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.78)',
        }}
      >
        <SearchOutlined style={{ color: overlayTheme.mutedText }} />
        <input
          aria-label="搜索内置工具"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="搜索工具、流程或参数，例如 mcp / lineLimit / allowMutating / 事务"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: overlayTheme.titleText,
            fontSize: 13,
          }}
        />
        {searchText && (
          <button
            type="button"
            onClick={() => setSearchText('')}
            style={{
              border: 'none',
              background: 'transparent',
              color: overlayTheme.mutedText,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            清除
          </button>
        )}
      </label>
      <div style={{ fontSize: 12, color: overlayTheme.mutedText }}>
        当前显示 {visibleFlows.length}/{BUILTIN_TOOL_FLOWS.length} 条推荐流程，{visibleTools.length}/{BUILTIN_AI_TOOL_INFO.length} 个内置工具。
      </div>
      {visibleFlows.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {visibleFlows.map((flow) => (
            <div
              key={flow.title}
              style={{
                fontSize: 12,
                color: overlayTheme.mutedText,
                padding: '10px 12px',
                borderRadius: 10,
                background: cardBg,
                border: `1px solid ${cardBorder}`,
              }}
            >
              <div style={{ fontWeight: 700, color: overlayTheme.titleText }}>{flow.title}</div>
              <div style={{ marginTop: 4, fontFamily: 'var(--gn-font-mono)' }}>{flow.steps}</div>
              <div style={{ marginTop: 4, opacity: 0.8, lineHeight: 1.6 }}>{flow.description}</div>
            </div>
          ))}
        </div>
      )}
      {visibleTools.length === 0 && (
        <div
          style={{
            padding: '18px 16px',
            borderRadius: 14,
            border: `1px dashed ${cardBorder}`,
            background: cardBg,
            color: overlayTheme.mutedText,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          没有匹配的内置工具。可以改搜更宽泛的关键词，例如 mcp、日志、连接、事务、快捷键、schema。
        </div>
      )}
      {visibleTools.map((tool) => {
      const parameterDetails = describeBuiltinToolParameters(tool);
      return (
        <div
          key={tool.name}
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            border: `1px solid ${cardBorder}`,
            background: cardBg,
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{tool.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, fontFamily: 'var(--gn-font-mono)' }}>
                {tool.name}
              </div>
              <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 2 }}>{tool.desc}</div>
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              color: overlayTheme.mutedText,
              lineHeight: 1.6,
              padding: '8px 12px',
              background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)',
              borderRadius: 8,
            }}
          >
            {tool.detail}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ToolOutlined style={{ fontSize: 12 }} />
            <span>参数：</span>
            <code style={{ fontFamily: 'var(--gn-font-mono)', fontSize: 12, padding: '1px 6px', borderRadius: 4, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
              {tool.params}
            </code>
          </div>
          {parameterDetails.length > 0 && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: overlayTheme.titleText }}>参数提示</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {parameterDetails.map((item) => (
                  <div
                    key={`${tool.name}-${item.name}`}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: `1px solid ${cardBorder}`,
                      background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <code style={{ fontFamily: 'var(--gn-font-mono)', fontSize: 12 }}>{item.name}</code>
                      <span style={{ fontSize: 11, color: overlayTheme.mutedText }}>
                        类型：{item.typeLabel}
                      </span>
                      <span
                        style={{
                          padding: '1px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          color: item.required ? '#b45309' : '#475569',
                          background: item.required
                            ? (darkMode ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)')
                            : (darkMode ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.12)'),
                        }}
                      >
                        {item.required ? '必填' : '可选'}
                      </span>
                      {item.enumValues.length > 0 && (
                        <span style={{ fontSize: 11, color: overlayTheme.mutedText }}>
                          可选值：{item.enumValues.join(' / ')}
                        </span>
                      )}
                      {item.defaultValue && (
                        <span style={{ fontSize: 11, color: overlayTheme.mutedText }}>
                          默认：{item.defaultValue}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>{item.description}</div>
                    )}
                    {item.exampleValue && (
                      <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>
                        示例：<code style={{ fontFamily: 'var(--gn-font-mono)' }}>{item.exampleValue}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
      })}
    </div>
  );
};

export default AIBuiltinToolsCatalog;
