import React from 'react';
import {
  ApiOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

export type AISettingsSectionKey =
  | 'providers'
  | 'safety'
  | 'context'
  | 'mcp'
  | 'skills'
  | 'prompts'
  | 'tools';

const AI_SETTINGS_NAV_ITEMS: Array<{
  key: AISettingsSectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  { key: 'providers', title: '模型供应商', description: '配置大模型接口与秘钥', icon: <ApiOutlined /> },
  { key: 'safety', title: '安全控制', description: '限制 AI 操作风险级别', icon: <SafetyCertificateOutlined /> },
  { key: 'context', title: '上下文', description: '配置携带的数据架构信息', icon: <RobotOutlined /> },
  { key: 'mcp', title: 'MCP 服务', description: '把 GoNavi 接入外部客户端并管理工具源', icon: <AppstoreOutlined /> },
  { key: 'skills', title: 'Skills', description: '配置可复用提示模块', icon: <ExperimentOutlined /> },
  { key: 'tools', title: '内置工具', description: '查看 AI 可调用的数据探针', icon: <ToolOutlined /> },
  { key: 'prompts', title: '内置提示词', description: '查看系统预设的底层要求', icon: <ExperimentOutlined /> },
];

interface AISettingsSidebarProps {
  activeSection: AISettingsSectionKey;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  onSelectSection: (section: AISettingsSectionKey) => void;
}

const AISettingsSidebar: React.FC<AISettingsSidebarProps> = ({
  activeSection,
  darkMode,
  overlayTheme,
  onSelectSection,
}) => (
  <div style={{ minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', padding: '0 6px 28px 12px' }}>
    <div style={{ marginBottom: 12, fontWeight: 600, color: overlayTheme.titleText }}>设置导航</div>
    <div style={{ display: 'grid', gap: 10 }}>
      {AI_SETTINGS_NAV_ITEMS.map((item) => {
        const active = activeSection === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectSection(item.key)}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${active
                ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
              background: active
                ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
              color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : 'rgba(128,128,128,0.7)' }}>
              {item.description}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

export default AISettingsSidebar;
