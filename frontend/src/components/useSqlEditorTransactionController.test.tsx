import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSqlEditorTransactionController } from './useSqlEditorTransactionController';
import type { PendingSqlEditorTransaction } from './QueryEditorTransactionToolbar';

const storeState = vi.hoisted(() => ({
  setSqlEditorPendingTransaction: vi.fn(),
}));

const backendApp = vi.hoisted(() => ({
  DBCommitTransaction: vi.fn(),
  DBRollbackTransaction: vi.fn(),
}));

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('../../wailsjs/go/app/App', () => backendApp);

vi.mock('antd', () => ({
  message: messageApi,
}));

const createPendingTransaction = (overrides: Partial<PendingSqlEditorTransaction> = {}): PendingSqlEditorTransaction => ({
  id: 'tx-1',
  commitMode: 'manual',
  autoCommitDelayMs: 0,
  createdAt: Date.now(),
  statementCount: 1,
  ...overrides,
});

describe('useSqlEditorTransactionController', () => {
  let controller: ReturnType<typeof useSqlEditorTransactionController> | null = null;
  let renderer: ReactTestRenderer | null = null;

  const renderController = () => {
    const Harness = () => {
      controller = useSqlEditorTransactionController({ tabId: 'tab-1' });
      return null;
    };

    act(() => {
      renderer = create(<Harness />);
    });
  };

  beforeEach(() => {
    controller = null;
    renderer = null;
    storeState.setSqlEditorPendingTransaction.mockReset();
    backendApp.DBCommitTransaction.mockReset();
    backendApp.DBRollbackTransaction.mockReset();
    messageApi.error.mockReset();
    messageApi.success.mockReset();
    backendApp.DBCommitTransaction.mockResolvedValue({ success: true, message: '事务已提交' });
    backendApp.DBRollbackTransaction.mockResolvedValue({ success: true, message: '事务已回滚' });
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
  });

  it('ignores duplicate finish requests for the same pending transaction', async () => {
    renderController();

    await act(async () => {
      controller?.activatePendingSqlTransaction(createPendingTransaction());
    });

    await act(async () => {
      const first = controller?.finishPendingSqlTransaction('commit', 'manual');
      const second = controller?.finishPendingSqlTransaction('commit', 'manual');
      await Promise.all([first, second]);
    });

    expect(backendApp.DBCommitTransaction).toHaveBeenCalledTimes(1);
    expect(backendApp.DBCommitTransaction).toHaveBeenCalledWith('tx-1');
    expect(backendApp.DBRollbackTransaction).not.toHaveBeenCalled();
    expect(messageApi.success).toHaveBeenCalledWith('SQL 事务已提交');
  });

  it('does not rollback a transaction while its auto commit is in flight', async () => {
    let resolveCommit!: (value: { success: boolean; message: string }) => void;
    backendApp.DBCommitTransaction.mockReturnValue(new Promise((resolve) => {
      resolveCommit = resolve;
    }));
    renderController();

    await act(async () => {
      controller?.activatePendingSqlTransaction(createPendingTransaction({
        commitMode: 'auto',
        autoCommitDelayMs: 0,
      }));
    });

    const finishPromise = controller?.finishPendingSqlTransaction('commit', 'auto');
    act(() => {
      renderer?.unmount();
      renderer = null;
    });

    expect(backendApp.DBRollbackTransaction).not.toHaveBeenCalled();
    expect(backendApp.DBCommitTransaction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCommit({ success: true, message: '事务已提交' });
      await finishPromise;
    });

    expect(messageApi.success).toHaveBeenCalledWith('SQL 事务已自动提交');
  });
});
