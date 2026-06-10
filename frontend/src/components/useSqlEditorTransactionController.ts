import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';

import { DBCommitTransaction, DBRollbackTransaction } from '../../wailsjs/go/app/App';
import { useStore } from '../store';
import { formatSqlExecutionError } from '../utils/sqlErrorSemantics';
import type { PendingSqlEditorTransaction } from './QueryEditorTransactionToolbar';

type FinishSqlEditorTransactionAction = 'commit' | 'rollback';
type FinishSqlEditorTransactionSource = 'manual' | 'auto';

type UseSqlEditorTransactionControllerOptions = {
  tabId: string;
};

export const useSqlEditorTransactionController = ({
  tabId,
}: UseSqlEditorTransactionControllerOptions) => {
  const setSqlEditorPendingTransaction = useStore(state => state.setSqlEditorPendingTransaction);
  const [pendingSqlTransaction, setPendingSqlTransaction] = useState<PendingSqlEditorTransaction | null>(null);
  const pendingSqlTransactionRef = useRef<PendingSqlEditorTransaction | null>(null);
  const autoCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCommitCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoCommitRemainingSeconds, setAutoCommitRemainingSeconds] = useState<number | null>(null);

  const clearAutoCommitTimer = useCallback(() => {
    if (autoCommitTimerRef.current) {
      clearTimeout(autoCommitTimerRef.current);
      autoCommitTimerRef.current = null;
    }
    if (autoCommitCountdownRef.current) {
      clearInterval(autoCommitCountdownRef.current);
      autoCommitCountdownRef.current = null;
    }
    setAutoCommitRemainingSeconds(null);
  }, []);

  const updatePendingSqlTransaction = useCallback((transaction: PendingSqlEditorTransaction | null) => {
    pendingSqlTransactionRef.current = transaction;
    setPendingSqlTransaction(transaction);
    setSqlEditorPendingTransaction(tabId, transaction);
  }, [setSqlEditorPendingTransaction, tabId]);

  const finishPendingSqlTransaction = useCallback(async (
    action: FinishSqlEditorTransactionAction,
    source: FinishSqlEditorTransactionSource = 'manual',
    transactionId?: string,
  ) => {
    const transaction = pendingSqlTransactionRef.current;
    if (!transaction || (transactionId && transaction.id !== transactionId)) {
      return;
    }
    clearAutoCommitTimer();
    try {
      const res = action === 'commit'
        ? await DBCommitTransaction(transaction.id)
        : await DBRollbackTransaction(transaction.id);
      if (res?.success) {
        updatePendingSqlTransaction(null);
        if (action === 'commit') {
          message.success(source === 'auto' ? 'SQL 事务已自动提交' : 'SQL 事务已提交');
        } else {
          message.success('SQL 事务已回滚');
        }
        return;
      }
      updatePendingSqlTransaction(null);
      const fallback = action === 'commit' ? '提交失败' : '回滚失败';
      message.error(`${source === 'auto' ? '自动提交失败' : fallback}: ${formatSqlExecutionError(res?.message || '未知错误')}`);
    } catch (err: any) {
      updatePendingSqlTransaction(null);
      const fallback = action === 'commit' ? '提交失败' : '回滚失败';
      message.error(`${source === 'auto' ? '自动提交失败' : fallback}: ${formatSqlExecutionError(err?.message || err || '未知错误')}`);
    }
  }, [clearAutoCommitTimer, updatePendingSqlTransaction]);

  const activatePendingSqlTransaction = useCallback((transaction: PendingSqlEditorTransaction) => {
    clearAutoCommitTimer();
    const autoCommitDelayMs = Math.max(0, Number(transaction.autoCommitDelayMs) || 0);
    const dueAt = transaction.commitMode === 'auto' ? Date.now() + autoCommitDelayMs : null;
    const nextTransaction = { ...transaction, autoCommitDelayMs, autoCommitDueAt: dueAt };
    updatePendingSqlTransaction(nextTransaction);
    if (nextTransaction.commitMode !== 'auto' || !dueAt) {
      return;
    }
    if (autoCommitDelayMs === 0) {
      setAutoCommitRemainingSeconds(0);
      autoCommitTimerRef.current = setTimeout(() => {
        autoCommitTimerRef.current = null;
        setAutoCommitRemainingSeconds(null);
        void finishPendingSqlTransaction('commit', 'auto', nextTransaction.id);
      }, 0);
      return;
    }
    const updateRemaining = () => {
      setAutoCommitRemainingSeconds(Math.max(1, Math.ceil((dueAt - Date.now()) / 1000)));
    };
    updateRemaining();
    autoCommitCountdownRef.current = setInterval(updateRemaining, 250);
    autoCommitTimerRef.current = setTimeout(() => {
      autoCommitTimerRef.current = null;
      if (autoCommitCountdownRef.current) {
        clearInterval(autoCommitCountdownRef.current);
        autoCommitCountdownRef.current = null;
      }
      setAutoCommitRemainingSeconds(null);
      void finishPendingSqlTransaction('commit', 'auto', nextTransaction.id);
    }, autoCommitDelayMs);
  }, [clearAutoCommitTimer, finishPendingSqlTransaction, updatePendingSqlTransaction]);

  useEffect(() => {
    return () => {
      clearAutoCommitTimer();
      const transaction = pendingSqlTransactionRef.current;
      if (transaction?.id) {
        pendingSqlTransactionRef.current = null;
        setSqlEditorPendingTransaction(tabId, null);
        void DBRollbackTransaction(transaction.id);
      }
    };
  }, [clearAutoCommitTimer, setSqlEditorPendingTransaction, tabId]);

  return {
    activatePendingSqlTransaction,
    autoCommitRemainingSeconds,
    finishPendingSqlTransaction,
    pendingSqlTransaction,
    pendingSqlTransactionRef,
  };
};
