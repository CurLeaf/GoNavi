import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';

import { DBCommitTransaction, DBRollbackTransaction } from '../../wailsjs/go/app/App';
import { t as catalogTranslate } from '../i18n/catalog';
import { useStore } from '../store';
import type { PendingSqlEditorTransaction } from './QueryEditorTransactionToolbar';

type FinishSqlEditorTransactionAction = 'commit' | 'rollback';
type FinishSqlEditorTransactionSource = 'manual' | 'auto';
type TranslateParams = Record<string, string | number | boolean | null | undefined>;

type UseSqlEditorTransactionControllerOptions = {
  tabId: string;
  translate?: (key: string, params?: TranslateParams) => string;
};

export const useSqlEditorTransactionController = ({
  tabId,
  translate,
}: UseSqlEditorTransactionControllerOptions) => {
  const setSqlEditorPendingTransaction = useStore(state => state.setSqlEditorPendingTransaction);
  const [pendingSqlTransaction, setPendingSqlTransaction] = useState<PendingSqlEditorTransaction | null>(null);
  const pendingSqlTransactionRef = useRef<PendingSqlEditorTransaction | null>(null);
  const finishingTransactionIdsRef = useRef<Set<string>>(new Set());
  const autoCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCommitCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoCommitRemainingSeconds, setAutoCommitRemainingSeconds] = useState<number | null>(null);

  const translateMessage = useCallback((key: string, params?: TranslateParams) => {
    return translate ? translate(key, params) : catalogTranslate('zh-CN', key, params);
  }, [translate]);

  const rawErrorDetail = useCallback((error: unknown) => {
    if (typeof error === 'string' && error.trim()) return error;
    if (error instanceof Error && error.message.trim()) return error.message;
    const messageValue = (error as any)?.message;
    if (typeof messageValue === 'string' && messageValue.trim()) return messageValue;
    if (error !== undefined && error !== null) return String(error);
    return translateMessage('common.unknown');
  }, [translateMessage]);

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
    if (finishingTransactionIdsRef.current.has(transaction.id)) {
      return;
    }
    clearAutoCommitTimer();
    finishingTransactionIdsRef.current.add(transaction.id);
    updatePendingSqlTransaction(null);
    try {
      const res = action === 'commit'
        ? await DBCommitTransaction(transaction.id)
        : await DBRollbackTransaction(transaction.id);
      if (res?.success) {
        if (action === 'commit') {
          message.success(source === 'auto'
            ? translateMessage('data_grid.message.auto_commit_success')
            : translateMessage('data_grid.message.transaction_committed'));
        } else {
          message.success(translateMessage('data_grid.message.transaction_rolled_back'));
        }
        return;
      }
      const detail = rawErrorDetail(res?.message);
      const key = source === 'auto'
        ? 'data_grid.message.auto_commit_failed'
        : action === 'commit'
          ? 'data_grid.message.commit_failed'
          : 'data_grid.message.rollback_failed';
      message.error(translateMessage(key, { detail }));
    } catch (err: any) {
      const detail = rawErrorDetail(err);
      const key = source === 'auto'
        ? 'data_grid.message.auto_commit_failed'
        : action === 'commit'
          ? 'data_grid.message.commit_failed'
          : 'data_grid.message.rollback_failed';
      message.error(translateMessage(key, { detail }));
    } finally {
      finishingTransactionIdsRef.current.delete(transaction.id);
    }
  }, [clearAutoCommitTimer, rawErrorDetail, translateMessage, updatePendingSqlTransaction]);

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
