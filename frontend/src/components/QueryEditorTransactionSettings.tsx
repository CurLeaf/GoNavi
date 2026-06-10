import React from 'react';
import { Select, Tooltip } from 'antd';

export type SqlEditorCommitMode = 'manual' | 'auto';

export const SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS = [
  { value: 3000, label: '3 秒' },
  { value: 5000, label: '5 秒' },
  { value: 10000, label: '10 秒' },
  { value: 30000, label: '30 秒' },
];

type QueryEditorTransactionSettingsProps = {
  isV2Ui: boolean;
  commitMode: SqlEditorCommitMode;
  autoCommitDelayMs: number;
  onCommitModeChange: (mode: SqlEditorCommitMode) => void;
  onAutoCommitDelayMsChange: (delayMs: number) => void;
};

const QueryEditorTransactionSettings: React.FC<QueryEditorTransactionSettingsProps> = ({
  isV2Ui,
  commitMode,
  autoCommitDelayMs,
  onCommitModeChange,
  onAutoCommitDelayMsChange,
}) => (
  <>
    <Tooltip title="SQL 编辑器执行 INSERT/UPDATE/DELETE/MERGE/REPLACE 等 DML 时固定开启受管事务；这里仅选择事务执行成功后的 COMMIT 时机。">
      <Select
        className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-transaction-mode-select' : undefined}
        style={isV2Ui ? undefined : { width: 160 }}
        value={commitMode}
        onChange={(mode) => onCommitModeChange(mode === 'auto' ? 'auto' : 'manual')}
        options={[
          { label: '提交：手动 COMMIT', value: 'manual' },
          { label: '提交：自动 COMMIT', value: 'auto' },
        ]}
      />
    </Tooltip>
    {commitMode === 'auto' && (
      <Select
        className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-transaction-delay-select' : undefined}
        style={isV2Ui ? undefined : { width: 96 }}
        value={autoCommitDelayMs}
        onChange={(delayMs) => onAutoCommitDelayMsChange(Number(delayMs))}
        options={SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS}
      />
    )}
  </>
);

export default QueryEditorTransactionSettings;
