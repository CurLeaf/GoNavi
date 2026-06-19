import React from 'react';
import { Input, Button, Switch, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, TableOutlined, RobotOutlined } from '@ant-design/icons';
import { noAutoCapInputProps } from '../../utils/inputAutoCap';
import { t } from '../../i18n';

// V2 Command Search 子组件（从 Sidebar.tsx 抽取）。
//
// 设计：把 renderV2CommandSearchRow/Section/Overlay 三个闭包函数合并为一个独立组件。
// Props 聚合为 5 个对象（state + items + handlers + flags + labels），避免 22+ 个独立 props。
//
// 注意：组件接收 V2CommandSearchItem[]，类型由 Sidebar 主组件定义（含 React.ReactNode 字段），
// 这里用结构化类型 V2CommandSearchItemLike 代替，避免循环依赖。

export interface V2CommandSearchItemLike {
  key: string;
  kind: 'node' | 'action' | 'recent';
  title: string;
  meta?: string;
  icon?: React.ReactNode;
  shortcut?: string;
}

export interface SidebarSearchPanelProps<TItem extends V2CommandSearchItemLike = V2CommandSearchItemLike> {
  isOpen: boolean;
  searchValue: string;
  activeIndex: number;
  label: string;
  placeholder: string;
  persistedFilter: string;
  persistentFilterEnabled: boolean;
  aiMode: boolean;
  objectMode: boolean;
  flatItems: TItem[];
  sections: {
    goTo: TItem[];
    ai: TItem[];
    actions: TItem[];
    recent: TItem[];
  };
  inputRef: React.Ref<any>;
  handlers: {
    onSearchValueChange: (value: string) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onClose: () => void;
    onItemSelect: (item: TItem) => void;
    onItemHover: (key: string) => void;
    onTogglePersistentFilter: (enabled: boolean) => void;
    onResetFilter: () => void;
  };
}

const SidebarSearchPanel = <TItem extends V2CommandSearchItemLike>({
  isOpen,
  searchValue,
  activeIndex,
  label,
  placeholder,
  persistedFilter,
  persistentFilterEnabled,
  aiMode,
  objectMode,
  flatItems,
  sections,
  inputRef,
  handlers,
}: SidebarSearchPanelProps<TItem>) => {
  if (!isOpen) return null;

  const emptyCopy = aiMode
    ? '输入「?」后加问题，按 Enter 发送到 AI 面板。'
    : objectMode
      ? '未找到匹配的表、视图或物化视图。'
      : '未找到匹配项。可输入 @表名 只搜表对象，或输入 ?问题 让 AI 回答。';

  const renderRow = (item: TItem, active: boolean) => (
    <button
      key={item.key}
      type="button"
      className={`gn-v2-command-row${active ? ' is-active' : ''}`}
      onMouseEnter={() => handlers.onItemHover(item.key)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => handlers.onItemSelect(item)}
    >
      <span className={`gn-v2-command-row-icon is-${item.kind}`}>{item.icon}</span>
      <span className="gn-v2-command-row-main">
        <strong>{item.title}</strong>
        {item.meta ? <small>{item.meta}</small> : null}
      </span>
      {item.kind === 'action' && item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
    </button>
  );

  const renderSection = (title: string, items: TItem[]) => {
    if (items.length === 0) return null;
    return (
      <section className="gn-v2-command-section">
        <div className="gn-v2-command-section-title">{title}</div>
        {items.map((item) =>
          renderRow(item, flatItems[activeIndex]?.key === item.key),
        )}
      </section>
    );
  };

  return (
    <div className="gn-v2-command-backdrop" data-v2-command-search="true" onMouseDown={handlers.onClose}>
      <div
        className="gn-v2-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="gn-v2-command-searchbar">
          <SearchOutlined />
          <Input
            {...noAutoCapInputProps}
            ref={inputRef}
            variant="borderless"
            value={searchValue}
            onChange={(event) => handlers.onSearchValueChange(event.target.value)}
            onKeyDown={handlers.onKeyDown}
            placeholder={placeholder}
          />
          <Tooltip title={t('sidebar.command_search.sync_to_filter_tooltip')}>
            <span className="gn-v2-command-filter-switch" aria-label={t('sidebar.command_search.sync_to_filter_aria')}>
              <Switch
                size="small"
                checked={persistentFilterEnabled}
                onChange={handlers.onTogglePersistentFilter}
              />
            </span>
          </Tooltip>
          <Tooltip title={persistedFilter ? t('sidebar.command_search.reset_filter') : t('sidebar.command_search.no_synced_filter')}>
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              aria-label={t('sidebar.command_search.reset_filter')}
              disabled={!persistedFilter}
              onClick={handlers.onResetFilter}
            />
          </Tooltip>
          <kbd>esc</kbd>
        </div>
        <div className="gn-v2-command-list">
          {renderSection('跳转 · GO TO', sections.goTo)}
          {renderSection('AI · ASK', sections.ai)}
          {renderSection('动作 · ACTIONS', sections.actions)}
          {renderSection('近期查询 · RECENT', sections.recent)}
          {flatItems.length === 0 ? (
            <div className="gn-v2-command-empty">{emptyCopy}</div>
          ) : null}
        </div>
        <div className="gn-v2-command-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd>导航</span>
          <span><kbd>↵</kbd>选择</span>
          <span><TableOutlined /> <kbd>@</kbd>只搜表对象</span>
          <span><RobotOutlined /> <kbd>?</kbd>发送给 AI</span>
        </div>
      </div>
    </div>
  );
};

export default SidebarSearchPanel;
