import React from 'react';
import { ToolOutlined } from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { BUILTIN_AI_TOOL_INFO } from '../../utils/aiToolRegistry';

interface AIBuiltinToolsCatalogProps {
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  cardBg: string;
  cardBorder: string;
}

const BUILTIN_TOOL_FLOWS = [
  {
    title: '定位表与字段',
    steps: 'get_connections → get_databases → get_tables → get_columns',
    description: '适合先找连接、找库、找表，再确认真实字段名后生成 SQL。',
  },
  {
    title: '字段反查表',
    steps: 'get_databases → get_all_columns',
    description: '适合只知道字段名、业务含义或注释关键词，但还不确定具体落在哪张表。',
  },
  {
    title: '结构深挖',
    steps: 'get_columns → get_indexes → get_foreign_keys → get_triggers → get_table_ddl',
    description: '适合做索引优化、关系梳理、隐式副作用排查和 DDL 审查。',
  },
  {
    title: '一键结构快照',
    steps: 'inspect_table_bundle',
    description: '适合一次带回字段、索引、外键、触发器和 DDL；必要时还能附带样例行，减少来回调用。',
  },
  {
    title: '全库快速摸底',
    steps: 'inspect_database_bundle → inspect_table_bundle',
    description: '适合先看整库有哪些表、每张表大概有哪些字段，再对目标表继续做深挖快照。',
  },
  {
    title: '读取当前页签',
    steps: 'inspect_active_tab → get_columns / get_indexes / execute_sql',
    description: '适合先读取当前编辑器里的 SQL 草稿或当前表页签，再继续做字段核对、索引分析和只读验证。',
  },
  {
    title: '盘点当前工作区',
    steps: 'inspect_workspace_tabs → inspect_active_tab → get_columns / execute_sql',
    description: '适合先看当前打开了哪些 SQL / 表 / 命令页签，再切到目标页签继续做字段核对、对比分析和只读验证。',
  },
  {
    title: '回看最近执行记录',
    steps: 'inspect_recent_sql_logs → get_columns / get_indexes / execute_sql',
    description: '适合追查刚刚执行失败的 SQL、慢查询耗时，或基于真实执行历史继续让 AI 给解释和优化建议。',
  },
  {
    title: '理解样例数据',
    steps: 'get_columns → preview_table_rows',
    description: '适合先确认字段，再直接查看前几行真实样例数据和空值形态。',
  },
  {
    title: '只读验证',
    steps: 'get_columns → preview_table_rows → execute_sql',
    description: '适合生成 SQL 后做小范围结果核对，仍会受 AI 安全级别控制。',
  },
];

export const AIBuiltinToolsCatalog: React.FC<AIBuiltinToolsCatalogProps> = ({
  darkMode,
  overlayTheme,
  cardBg,
  cardBorder,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
      AI 助手在处理数据库相关问题时，可以自动调用以下内置工具获取真实数据，全程无需人工干预。
    </div>
    <div style={{ display: 'grid', gap: 8 }}>
      {BUILTIN_TOOL_FLOWS.map((flow) => (
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
    {BUILTIN_AI_TOOL_INFO.map((tool) => (
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
      </div>
    ))}
  </div>
);

export default AIBuiltinToolsCatalog;
