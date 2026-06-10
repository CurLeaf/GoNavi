import React from 'react';
import { Select, Tooltip } from 'antd';

export type SqlEditorCommitMode = 'manual' | 'auto';

export const SQL_EDITOR_AUTO_COMMIT_DELAY_OPTIONS = [
  { value: 0, label: '立即' },
  { value: 3000, label: '3 秒后' },
  { value: 5000, label: '5 秒后' },
  { value: 10000, label: '10 秒后' },
  { value: 30000, label: '30 秒后' },
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
    <Tooltip title="参考 DBeaver：SQL 编辑器执行 INSERT/UPDATE/DELETE/MERGE/REPLACE 等 DML 时先进入 GoNavi 托管事务；Manual Commit 需要手动提交/回滚，Auto-commit 在执行成功后自动 COMMIT。">
      <Select
        className={isV2Ui ? 'gn-v2-query-toolbar-select gn-v2-query-toolbar-transaction-mode-select' : undefined}
        style={isV2Ui ? undefined : { width: 160 }}
        value={commitMode}
        onChange={(mode) => onCommitModeChange(mode === 'auto' ? 'auto' : 'manual')}
        options={[
          { label: 'Manual Commit', value: 'manual' },
          { label: 'Auto-commit', value: 'auto' },
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
