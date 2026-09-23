import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import TitleBarQuickActions from '../TitleBarQuickActions';
import { buildTitlebarDataActions } from './titlebarDataActions';

describe('buildTitlebarDataActions', () => {
  it('标题栏只放同步和对比两个直接按钮', () => {
    const onSync = vi.fn();
    const onCompare = vi.fn();
    const actions = buildTitlebarDataActions({
      syncTitle: '数据同步',
      syncDescription: '进入跨源同步工作流。',
      compareTitle: '数据对比',
      compareDescription: '只读比较两端表结构或数据，不会写入目标。',
    }, { onSync, onCompare });

    expect(actions.map((action) => action.key)).toEqual(['sync', 'compare']);
    expect(actions.map((action) => action.label)).toEqual(['数据同步', '数据对比']);
    expect(actions.every((action) => action.menu == null)).toBe(true);

    actions[0].onClick?.();
    actions[1].onClick?.();
    expect(onSync).toHaveBeenCalledOnce();
    expect(onCompare).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(
      <TitleBarQuickActions label="对象操作" actions={actions} />,
    );
    expect(markup).toContain('data-titlebar-quick-action="sync"');
    expect(markup).toContain('data-titlebar-quick-action="compare"');
    expect(markup).not.toContain('data-titlebar-quick-menu');
    expect(markup).toContain('数据同步');
    expect(markup).toContain('数据对比');
  });
});
