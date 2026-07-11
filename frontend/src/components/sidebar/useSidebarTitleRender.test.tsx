import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { useSidebarTitleRender } from './useSidebarTitleRender';

const TitleRenderProbe = ({
  revision,
  onTitleRender,
  onAddDirectory,
}: {
  revision: number;
  onTitleRender: (titleRender: (node: any) => React.ReactNode) => void;
  onAddDirectory: (revision: number, node: any) => void;
}) => {
  const [, setIsTreeDragging] = useState(false);
  const treeDragSelectSuppressUntilRef = useRef(0);
  const connectionStates = useMemo(() => ({}), []);
  const renderV2TreeTitle = useCallback((node: any) => <span>{node.title}</span>, []);
  const snapshotTreeSelectionBeforeDrag = useCallback(() => {}, []);
  const restoreTreeSelectionAfterDrag = useCallback(() => {}, []);
  const handleAddExternalSQLDirectory = useCallback(async (node: any) => {
    onAddDirectory(revision, node);
  }, [onAddDirectory, revision]);
  const titleRender = useSidebarTitleRender({
    connectionStates,
    isV2Ui: true,
    renderV2TreeTitle,
    handleAddExternalSQLDirectory,
    snapshotTreeSelectionBeforeDrag,
    restoreTreeSelectionAfterDrag,
    treeDragSelectSuppressUntilRef,
    setIsTreeDragging,
  });

  useEffect(() => {
    onTitleRender(titleRender);
  }, [onTitleRender, titleRender]);

  return null;
};

describe('useSidebarTitleRender', () => {
  it('keeps the tree title renderer stable while retaining the latest external SQL action', async () => {
    const onTitleRender = vi.fn();
    const onAddDirectory = vi.fn();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <TitleRenderProbe
          revision={1}
          onTitleRender={onTitleRender}
          onAddDirectory={onAddDirectory}
        />,
      );
    });
    const initialTitleRender = onTitleRender.mock.lastCall?.[0] as (node: any) => React.ReactElement;

    act(() => {
      renderer!.update(
        <TitleRenderProbe
          revision={2}
          onTitleRender={onTitleRender}
          onAddDirectory={onAddDirectory}
        />,
      );
    });

    expect(onTitleRender).toHaveBeenCalledTimes(1);

    const title = initialTitleRender({
      key: 'external-sql-root',
      title: 'SQL',
      type: 'external-sql-root',
    });
    const action = React.Children.toArray(title.props.children)[1] as React.ReactElement;
    action.props.onClick({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onAddDirectory).toHaveBeenCalledWith(2, expect.objectContaining({ key: 'external-sql-root' }));
  });
});
