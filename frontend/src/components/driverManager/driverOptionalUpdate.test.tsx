/** @vitest-environment jsdom */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCurrentLanguage } from '../../i18n';
import {
  OPTIONAL_UPDATE_DISMISS_KEY,
  dismissOptionalUpdateRevision,
  formatDriverCardStatusMessage,
  isOptionalUpdateVisible,
  readOptionalUpdateDismissedRevisions,
  type DriverOptionalUpdateStatus,
} from './driverOptionalUpdate';

const row = (overrides: Partial<DriverOptionalUpdateStatus> = {}): DriverOptionalUpdateStatus => ({
  builtIn: false,
  connectable: true,
  runtimeAvailable: true,
  packageInstalled: true,
  optionalUpdate: true,
  expectedRevision: 'src-clickhouse',
  ...overrides,
});

describe('driver optional update dismissal', () => {
  beforeEach(() => {
    setCurrentLanguage('zh-CN');
    window.localStorage.clear();
  });

  it('stores dismissed revisions as a list so one driver does not clear another', () => {
    const first = dismissOptionalUpdateRevision([], 'src-clickhouse');
    const second = dismissOptionalUpdateRevision(first, 'src-duckdb');

    expect(JSON.parse(window.localStorage.getItem(OPTIONAL_UPDATE_DISMISS_KEY) || '[]')).toEqual([
      'src-clickhouse',
      'src-duckdb',
    ]);
    expect(readOptionalUpdateDismissedRevisions()).toEqual(second);
    expect(isOptionalUpdateVisible(row(), second)).toBe(false);
    expect(isOptionalUpdateVisible(row({ expectedRevision: 'src-sqlite' }), second)).toBe(true);
  });

  it('ignores a legacy single-string dismissal value', () => {
    window.localStorage.setItem(OPTIONAL_UPDATE_DISMISS_KEY, 'src-clickhouse');
    expect(readOptionalUpdateDismissedRevisions()).toEqual([]);
    expect(isOptionalUpdateVisible(row(), readOptionalUpdateDismissedRevisions())).toBe(true);
  });

  it('formats an optional update as a weak hint and a required update as reinstall', () => {
    expect(formatDriverCardStatusMessage(row(), [])).toContain('驱动组件有更新（可选，不影响使用）');
    expect(formatDriverCardStatusMessage(row({ needsUpdate: true, optionalUpdate: false }), [])).toContain('建议重装');
    expect(formatDriverCardStatusMessage(row(), ['src-clickhouse'])).toContain('纯 Go 驱动已启用');
  });

  it('hides the dismiss control after the revision is stored', async () => {
    const { DriverOptionalUpdateDismissButton } = await import('./driverOptionalUpdate');
    let dismissed: string[] = [];
    let renderer = create(
      <DriverOptionalUpdateDismissButton
        row={row()}
        dismissedRevisions={dismissed}
        onDismissed={(next) => {
          dismissed = next;
        }}
      />,
    );
    const button = renderer.root.find((node) => node.type === 'button');
    await act(async () => {
      button.props.onClick();
    });
    expect(dismissed).toEqual(['src-clickhouse']);

    renderer = create(
      <DriverOptionalUpdateDismissButton
        row={row()}
        dismissedRevisions={dismissed}
        onDismissed={vi.fn()}
      />,
    );
    expect(renderer.root.findAll((node) => node.type === 'button')).toHaveLength(0);
  });
});
