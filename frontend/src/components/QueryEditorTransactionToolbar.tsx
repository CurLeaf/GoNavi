import React from 'react';
import { Button } from 'antd';

export type PendingSqlEditorTransaction = {
  id: string;
  commitMode: 'manual' | 'auto';
  autoCommitDelayMs: number;
  createdAt: number;
  autoCommitDueAt?: number | null;
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
        {transaction.commitMode === 'auto' && autoCommitRemainingSeconds !== null
          ? `事务待提交，${autoCommitRemainingSeconds}s 后自动提交`
          : '事务待提交'}
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
