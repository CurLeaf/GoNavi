import React from 'react';
import { Button, Dropdown, Select, Space, Tooltip, type MenuProps } from 'antd';
import {
  EyeInvisibleOutlined,
  EyeOutlined,
  FormatPainterOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SaveOutlined,
  SettingOutlined,
  StopOutlined,
} from '@ant-design/icons';

import type { SavedConnection } from '../types';
import { getShortcutDisplayLabel, type ShortcutPlatform, type ShortcutPlatformBinding } from '../utils/shortcuts';
import QueryEditorTransactionSettings, { type SqlEditorCommitMode } from './QueryEditorTransactionSettings';

type QueryEditorToolbarProps = {
  isV2Ui: boolean;
  currentConnectionId: string;
  currentDb: string;
  queryCapableConnections: SavedConnection[];
  dbList: string[];
  maxRows: number;
  sqlEditorCommitMode: SqlEditorCommitMode;
  sqlEditorAutoCommitDelayMs: number;
  pendingTransactionToolbar: React.ReactNode;
  runQueryShortcutBinding: ShortcutPlatformBinding;
  saveQueryShortcutBinding: ShortcutPlatformBinding;
  toggleQueryResultsPanelShortcutBinding: ShortcutPlatformBinding;
  activeShortcutPlatform: ShortcutPlatform;
  isResultPanelVisible: boolean;
  loading: boolean;
  saveMoreMenuItems: MenuProps['items'];
  formatSettingsMenu: MenuProps['items'];
  onConnectionChange: (connectionId: string) => void;
  onDatabaseChange: (dbName: string) => void;
  onMaxRowsChange: (maxRows: number) => void;
  onCommitModeChange: (mode: SqlEditorCommitMode) => void;
  onAutoCommitDelayMsChange: (delayMs: number) => void;
  onCaptureEditorCursorPosition: () => void;
  onRun: () => void;
  onCancel: () => void;
  onQuickSave: () => void;
  onFormat: () => void;
  onToggleResultPanelVisibility: () => void;
  onAIAction: (action: 'generate' | 'explain' | 'optimize' | 'schema') => void;
};

const QueryEditorToolbar: React.FC<QueryEditorToolbarProps> = ({
  isV2Ui,
  currentConnectionId,
  currentDb,
  queryCapableConnections,
  dbList,
  maxRows,
  sqlEditorCommitMode,
  sqlEditorAutoCommitDelayMs,
  pendingTransactionToolbar,
  runQueryShortcutBinding,
  saveQueryShortcutBinding,
  toggleQueryResultsPanelShortcutBinding,
  activeShortcutPlatform,
  isResultPanelVisible,
  loading,
  saveMoreMenuItems,
  formatSettingsMenu,
  onConnectionChange,
  onDatabaseChange,
  onMaxRowsChange,
  onCommitModeChange,
  onAutoCommitDelayMsChange,
  onCaptureEditorCursorPosition,
  onRun,
  onCancel,
  onQuickSave,
  onFormat,
  onToggleResultPanelVisibility,
  onAIAction,
}) => {
  const selects = (
    <div
      className={isV2Ui ? 'gn-v2-query-toolbar-selects' : undefined}
      style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}
    >
      <Select
        className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-connection-select' : undefined}
        style={isV2Ui ? undefined : { width: 150 }}
        placeholder="选择连接"
        value={currentConnectionId}
        onChange={onConnectionChange}
        options={queryCapableConnections.map(c => ({ label: c.name, value: c.id }))}
        showSearch
      />
      <Select
        className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-database-select' : undefined}
        style={isV2Ui ? undefined : { width: 200 }}
        placeholder="选择数据库"
        value={currentDb}
        onChange={onDatabaseChange}
        options={dbList.map(db => ({ label: db, value: db }))}
        showSearch
      />
      <Tooltip title="最大返回行数（会对 SELECT 自动加 LIMIT，防止大结果集卡死）">
        <Select
          className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-max-rows-select' : undefined}
          style={isV2Ui ? undefined : { width: 170 }}
          value={maxRows}
          onChange={(val) => onMaxRowsChange(Number(val))}
          options={[
            { label: '最大行数：500', value: 500 },
            { label: '最大行数：1000', value: 1000 },
            { label: '最大行数：5000', value: 5000 },
            { label: '最大行数：20000', value: 20000 },
            { label: '最大行数：不限', value: 0 },
          ]}
        />
      </Tooltip>
      <QueryEditorTransactionSettings
        isV2Ui={isV2Ui}
        commitMode={sqlEditorCommitMode}
        autoCommitDelayMs={sqlEditorAutoCommitDelayMs}
        onCommitModeChange={onCommitModeChange}
        onAutoCommitDelayMsChange={onAutoCommitDelayMsChange}
      />
      {!isV2Ui && pendingTransactionToolbar}
    </div>
  );

  const actions = (
    <div
      className={isV2Ui ? 'gn-v2-query-toolbar-actions' : undefined}
      style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}
    >
      <Space.Compact className={isV2Ui ? 'gn-v2-query-toolbar-action-group' : undefined}>
        <Tooltip
          title={
            runQueryShortcutBinding.enabled && runQueryShortcutBinding.combo
              ? `运行（${getShortcutDisplayLabel(runQueryShortcutBinding.combo, activeShortcutPlatform)}）`
              : '运行'
          }
        >
          <Button className={isV2Ui ? 'gn-v2-query-toolbar-run-action' : undefined} type="primary" icon={<PlayCircleOutlined />} onMouseDown={onCaptureEditorCursorPosition} onClick={onRun} loading={loading}>
            运行
          </Button>
        </Tooltip>
        {loading && (
          <Button type="primary" danger icon={<StopOutlined />} onClick={onCancel}>
            停止
          </Button>
        )}
      </Space.Compact>
      <Space.Compact className={isV2Ui ? 'gn-v2-query-toolbar-action-group' : undefined}>
        <Tooltip
          title={
            saveQueryShortcutBinding.enabled && saveQueryShortcutBinding.combo
              ? `保存（${getShortcutDisplayLabel(saveQueryShortcutBinding.combo, activeShortcutPlatform)}）`
              : '保存'
          }
        >
          <Button icon={<SaveOutlined />} onClick={onQuickSave}>
            保存
          </Button>
        </Tooltip>
        <Dropdown menu={{ items: saveMoreMenuItems }} placement="bottomRight">
          <Button>更多</Button>
        </Dropdown>
      </Space.Compact>

      <Space.Compact className={isV2Ui ? 'gn-v2-query-toolbar-action-group' : undefined}>
        <Tooltip title="美化 SQL">
          <Button icon={<FormatPainterOutlined />} onClick={onFormat}>美化</Button>
        </Tooltip>
        <Dropdown menu={{ items: formatSettingsMenu }} placement="bottomRight">
          <Button className={isV2Ui ? 'gn-v2-query-toolbar-icon-action' : undefined} icon={<SettingOutlined />} />
        </Dropdown>
      </Space.Compact>

      <Tooltip
        title={
          toggleQueryResultsPanelShortcutBinding.enabled && toggleQueryResultsPanelShortcutBinding.combo
            ? `${isResultPanelVisible ? '隐藏结果区' : '显示结果区'}（${getShortcutDisplayLabel(toggleQueryResultsPanelShortcutBinding.combo, activeShortcutPlatform)}）`
            : (isResultPanelVisible ? '隐藏结果区' : '显示结果区')
        }
      >
        <Button
          icon={isResultPanelVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={onToggleResultPanelVisibility}
        >
          结果
        </Button>
      </Tooltip>

      <Dropdown menu={{ items: [
        { key: 'ai-generate', label: '生成 SQL', icon: <RobotOutlined />, onClick: () => onAIAction('generate') },
        { key: 'ai-explain', label: '解释 SQL', icon: <RobotOutlined />, onClick: () => onAIAction('explain') },
        { key: 'ai-optimize', label: '优化 SQL', icon: <RobotOutlined />, onClick: () => onAIAction('optimize') },
        { type: 'divider' as const },
        { key: 'ai-schema', label: 'Schema 分析', icon: <RobotOutlined />, onClick: () => onAIAction('schema') },
      ] }} placement="bottomRight">
        <Button className={isV2Ui ? 'gn-v2-query-toolbar-ai-action' : undefined} icon={<RobotOutlined />} style={{ color: '#818cf8' }}>AI</Button>
      </Dropdown>
    </div>
  );

  if (!isV2Ui) {
    return (
      <div className={undefined} style={{ padding: '4px 8px 8px', display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
        {selects}
        {actions}
      </div>
    );
  }

  return (
    <div className="gn-v2-query-toolbar" style={{ padding: '4px 8px 8px', display: 'flex', gap: '8px', flexShrink: 0 }}>
      <div
        className="gn-v2-query-toolbar-main"
        style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}
      >
        {selects}
        {actions}
      </div>
      {pendingTransactionToolbar && (
        <div className="gn-v2-query-toolbar-transaction-row">
          {pendingTransactionToolbar}
        </div>
      )}
    </div>
  );
};

export default QueryEditorToolbar;
