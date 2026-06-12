import React from 'react';
import { Button } from 'antd';

export type PendingSqlEditorTransaction = {
  id: string;
  commitMode: 'manual' | 'auto';
  autoCommitDelayMs: number;
  createdAt: number;
  autoCommitDueAt?: number | null;
  statementCount?: number;
};

type QueryEditorTransactionToolbarProps = {
  isV2Ui: boolean;
  darkMode: boolean;
  transaction: PendingSqlEditorTransaction | null;
  autoCommitRemainingSeconds: number | null;
  onFinish: (action: 'commit' | 'rollback') => void;
};

const QueryEditorTransactionToolbar: React.FC<QueryEditorTransactionToolbarProps> = ({
  isV2Ui,
  darkMode,
  transaction,
  autoCommitRemainingSeconds,
  onFinish,
}) => {
  if (!transaction) {
    return null;
  }

  const statementCount = Math.max(0, Math.floor(Number(transaction.statementCount) || 0));
  const pendingCount = statementCount > 0 ? statementCount : 1;
  const statusText = transaction.commitMode === 'auto'
    ? autoCommitRemainingSeconds !== null && autoCommitRemainingSeconds > 0
      ? `${autoCommitRemainingSeconds}s 后自动提交`
      : '自动提交中'
    : '未提交';
  const commitLabel = isV2Ui
    ? (
      <>
        <span>提交</span>
        <span className="gn-v2-toolbar-kbd">{pendingCount}</span>
      </>
    )
    : `提交 (${pendingCount})`;

  return (
    <div
      className={isV2Ui ? 'gn-v2-query-transaction-toolbar' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 4px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 12, color: darkMode ? '#d4d4d4' : '#666' }}>
        {statusText}
      </span>
      <Button
        className={isV2Ui ? 'gn-v2-query-transaction-commit-button' : undefined}
        size="small"
        type="primary"
        onClick={() => onFinish('commit')}
      >
        {commitLabel}
      </Button>
      <Button
        size="small"
        danger
        onClick={() => onFinish('rollback')}
      >
        回滚
      </Button>
    </div>
  );
};

export default QueryEditorTransactionToolbar;
