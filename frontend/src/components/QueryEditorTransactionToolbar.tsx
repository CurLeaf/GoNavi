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
  const pendingCountText = statementCount > 0
    ? `，未提交 ${statementCount} 条变更语句`
    : '';
  const statusText = transaction.commitMode === 'auto'
    ? autoCommitRemainingSeconds !== null && autoCommitRemainingSeconds > 0
      ? `事务待提交${pendingCountText}，${autoCommitRemainingSeconds}s 后自动提交`
      : `事务执行成功${pendingCountText}，正在自动提交`
    : `事务待提交${pendingCountText}`;

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
        size="small"
        type="primary"
        onClick={() => onFinish('commit')}
      >
        提交
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
