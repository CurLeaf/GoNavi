import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import QueryEditorTransactionSettings from './QueryEditorTransactionSettings';

const antdState = vi.hoisted(() => ({
  selectProps: [] as any[],
  tooltipProps: [] as any[],
}));

vi.mock('antd', () => ({
  Select: (props: any) => {
    antdState.selectProps.push(props);
    return <button type="button">{props.value}</button>;
  },
  Tooltip: (props: any) => {
    antdState.tooltipProps.push(props);
    return <div>{props.children}</div>;
  },
}));

vi.mock('../i18n/provider', () => ({
  useOptionalI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => params?.seconds ? `${params.seconds}s后提交` : key,
  }),
}));

const latestSelectProps = () => antdState.selectProps[antdState.selectProps.length - 1];
const latestTooltipProps = () => antdState.tooltipProps[antdState.tooltipProps.length - 1];

describe('QueryEditorTransactionSettings', () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    antdState.selectProps = [];
    antdState.tooltipProps = [];
  });

  afterEach(() => {
    renderer?.unmount();
    renderer = null;
  });

  it('hides the DBeaver reference tooltip while the transaction mode select is open', () => {
    act(() => {
      renderer = create(
        <QueryEditorTransactionSettings
          isV2Ui
          commitMode="manual"
          autoCommitDelayMs={0}
          onCommitModeChange={vi.fn()}
          onAutoCommitDelayMsChange={vi.fn()}
        />,
      );
    });

    act(() => {
      latestTooltipProps().onOpenChange(true);
    });
    expect(latestTooltipProps().open).toBe(true);

    act(() => {
      latestSelectProps().onOpenChange(true);
    });
    expect(latestTooltipProps().open).toBe(false);

    act(() => {
      latestSelectProps().onOpenChange(false);
      latestTooltipProps().onOpenChange(true);
    });
    expect(latestTooltipProps().open).toBe(true);
  });
});
