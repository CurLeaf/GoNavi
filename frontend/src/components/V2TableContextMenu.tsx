import React from 'react';
import {
  CodeOutlined,
  ConsoleSqlOutlined,
  CopyOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  EditOutlined,
  ExportOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  SaveOutlined,
  LinkOutlined,
  ReloadOutlined,
  TableOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  CheckSquareOutlined,
  CloudOutlined,
  ClearOutlined,
  ColumnWidthOutlined,
  DashboardOutlined,
  EyeInvisibleOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  HddOutlined,
  PushpinOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons';

export type V2TableContextMenuActionKey =
  | 'pin-table'
  | 'unpin-table'
  | 'open-data'
  | 'design-table'
  | 'open-new-tab'
  | 'new-query'
  | 'view-ddl'
  | 'view-er'
  | 'copy-table-name'
  | 'copy-structure'
  | 'copy-insert'
  | 'rename-table'
  | 'new-rollup'
  | 'backup-table'
  | 'refresh-stats'
  | 'export-xlsx'
  | 'export-csv'
  | 'export-json'
  | 'ai-explain'
  | 'ai-generate-query'
  | 'truncate-table'
  | 'drop-table';

export type V2TableContextMenuStats = {
  rowCount?: number;
  dataLength?: number;
  indexLength?: number;
  engine?: string;
  loading?: boolean;
  unavailable?: boolean;
};

type V2TableContextMenuItemConfig = {
  action: string;
  icon: React.ReactNode;
  title: string;
  kbd?: string;
  featured?: boolean;
  selected?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'ai' | 'danger';
};

export const formatV2TableContextMenuRows = (count?: number): string => {
  if (count === undefined || count === null || !Number.isFinite(count) || count < 0) return '— 行';
  return `${Math.round(count).toLocaleString()} 行`;
};

export const formatV2TableContextMenuSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const resolveV2TableContextMenuMeta = (stats?: V2TableContextMenuStats): string => {
  if (!stats) return '点击刷新统计信息读取';
  if (stats?.loading) return '正在读取统计信息…';
  if (stats?.unavailable) return '统计信息不可用';
  return `${formatV2TableContextMenuRows(stats?.rowCount)} · ${formatV2TableContextMenuSize(stats?.dataLength)} 数据 · ${formatV2TableContextMenuSize(stats?.indexLength)} 索引`;
};

const V2TableContextMenuItem: React.FC<{
  item: V2TableContextMenuItemConfig;
  onAction?: (action: string) => void;
}> = ({ item, onAction }) => (
  <button
    type="button"
    className={[
      'gn-v2-context-menu-item',
      item.featured ? 'is-featured' : '',
      item.selected ? 'is-selected' : '',
      item.tone === 'ai' ? 'is-ai' : '',
      item.tone === 'danger' ? 'is-danger' : '',
      item.tone === 'default' ? 'is-default' : '',
      item.disabled ? 'is-disabled' : '',
    ].filter(Boolean).join(' ')}
    role="menuitem"
    disabled={item.disabled}
    aria-disabled={item.disabled || undefined}
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      if (item.disabled) return;
      onAction?.(item.action);
    }}
  >
    <span className="gn-v2-context-menu-item-icon">{item.icon}</span>
    <span className="gn-v2-context-menu-item-title">{item.title}</span>
    {item.kbd && <span className="gn-v2-context-menu-kbd">{item.kbd}</span>}
  </button>
);

const V2ContextMenuHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  meta: string;
  pill?: string;
}> = ({ icon, title, meta, pill }) => (
  <div className="gn-v2-context-menu-header">
    <span className="gn-v2-context-menu-table-icon">{icon}</span>
    <span className="gn-v2-context-menu-heading">
      <strong title={title}>{title}</strong>
      <small>{meta}</small>
    </span>
    {pill && (
      <span className="gn-v2-context-menu-engine-pill">{pill}</span>
    )}
  </div>
);

const renderV2ContextMenuItems = (
  items: V2TableContextMenuItemConfig[],
  onAction?: (action: string) => void,
) => items.map((item) => (
  <V2TableContextMenuItem key={item.action} item={item} onAction={onAction} />
));

export const V2TableContextMenuView: React.FC<{
  tableName: string;
  stats?: V2TableContextMenuStats;
  isPinned?: boolean;
  supportsTruncate?: boolean;
  supportsStarRocksRollup?: boolean;
  onAction?: (action: V2TableContextMenuActionKey) => void;
}> = ({
  tableName,
  stats,
  isPinned = false,
  supportsTruncate = true,
  supportsStarRocksRollup = false,
  onAction,
}) => {
  const renderItems = (items: V2TableContextMenuItemConfig[]) => renderV2ContextMenuItems(
    items,
    onAction as (action: string) => void,
  );

  const maintenanceItems: V2TableContextMenuItemConfig[] = [
    { action: 'rename-table', icon: <EditOutlined />, title: '重命名…', kbd: 'F2' },
    ...(supportsStarRocksRollup ? [{ action: 'new-rollup' as const, icon: <ThunderboltOutlined />, title: '新增 Rollup' }] : []),
    { action: 'backup-table', icon: <ExportOutlined />, title: '备份 · SQL Dump' },
    { action: 'refresh-stats', icon: <ReloadOutlined />, title: '刷新统计信息' },
  ];

  const dangerItems: V2TableContextMenuItemConfig[] = [
    ...(supportsTruncate ? [{ action: 'truncate-table' as const, icon: <DeleteOutlined />, title: '截断表 · TRUNCATE', tone: 'danger' as const }] : []),
    { action: 'drop-table', icon: <DeleteOutlined />, title: '删除表 · DROP', kbd: '⌫', tone: 'danger' },
  ];

  return (
    <div className="gn-v2-table-context-menu" data-v2-table-context-menu="true" role="menu">
      <V2ContextMenuHeader
        icon={<TableOutlined />}
        title={tableName}
        meta={resolveV2TableContextMenuMeta(stats)}
        pill={(stats?.engine || stats?.loading) ? (stats?.loading ? '...' : stats?.engine) : undefined}
      />

      <div className="gn-v2-context-menu-body">
        {renderItems([
          { action: 'open-data', icon: <TableOutlined />, title: '查看数据', kbd: '↵', featured: true },
          { action: isPinned ? 'unpin-table' : 'pin-table', icon: <PushpinOutlined />, title: isPinned ? '取消置顶' : '置顶表', kbd: isPinned ? '已置顶' : undefined, selected: isPinned },
          { action: 'design-table', icon: <EditOutlined />, title: '设计表 · 字段 / 索引 / 外键', kbd: '⌘D' },
          { action: 'open-new-tab', icon: <FileAddOutlined />, title: '在新标签打开', kbd: '⌘↵' },
          { action: 'new-query', icon: <ConsoleSqlOutlined />, title: '新建查询' },
        ])}

        <div className="gn-v2-context-menu-section-title">元信息</div>
        {renderItems([
          { action: 'view-ddl', icon: <CodeOutlined />, title: '查看 DDL · CREATE TABLE' },
          { action: 'view-er', icon: <LinkOutlined />, title: '在 ER 图中查看' },
        ])}

        <div className="gn-v2-context-menu-section-title">复制</div>
        {renderItems([
          { action: 'copy-table-name', icon: <CopyOutlined />, title: '复制表名', kbd: '⌘C' },
          { action: 'copy-structure', icon: <CopyOutlined />, title: '复制表结构 · DDL' },
          { action: 'copy-insert', icon: <CopyOutlined />, title: '复制全表为 INSERT' },
        ])}

        <div className="gn-v2-context-menu-section-title">维护</div>
        {renderItems(maintenanceItems)}

        <div className="gn-v2-context-menu-section-title">导出表数据</div>
        {renderItems([
          { action: 'export-xlsx', icon: <ExportOutlined />, title: 'Excel · .xlsx' },
          { action: 'export-csv', icon: <ExportOutlined />, title: 'CSV · .csv' },
          { action: 'export-json', icon: <ExportOutlined />, title: 'JSON · .json' },
        ])}

        <div className="gn-v2-context-menu-divider" />
        {renderItems([
          { action: 'ai-explain', icon: <ThunderboltOutlined />, title: '用 AI 解释这张表', tone: 'ai', featured: true },
          { action: 'ai-generate-query', icon: <ConsoleSqlOutlined />, title: '用 AI 生成查询', tone: 'ai' },
        ])}

        <div className="gn-v2-context-menu-divider" />
        {renderItems(dangerItems)}
      </div>
    </div>
  );
};

export type V2TableGroupContextMenuActionKey =
  | 'new-table'
  | 'sort-by-name'
  | 'sort-by-frequency';

export const V2TableGroupContextMenuView: React.FC<{
  title?: string;
  dbName?: string;
  count?: number;
  currentSort?: 'name' | 'frequency';
  onAction?: (action: V2TableGroupContextMenuActionKey) => void;
}> = ({
  title = '表 · tables',
  dbName,
  count,
  currentSort = 'name',
  onAction,
}) => {
  const sortLabel = currentSort === 'frequency' ? '使用频率' : '名称';
  const renderItems = (items: V2TableContextMenuItemConfig[]) => renderV2ContextMenuItems(
    items,
    onAction as (action: string) => void,
  );

  return (
    <div className="gn-v2-table-context-menu gn-v2-group-context-menu" data-v2-table-group-context-menu="true" role="menu">
      <V2ContextMenuHeader
        icon={<TableOutlined />}
        title={title}
        meta={`${dbName || '当前数据库'} · ${count ?? 0} 张表 · 当前按${sortLabel}排序`}
        pill="GROUP"
      />

      <div className="gn-v2-context-menu-body">
        {renderItems([
          { action: 'new-table', icon: <TableOutlined />, title: '新建表', kbd: '⌘N', featured: true },
        ])}

        <div className="gn-v2-context-menu-section-title">排序</div>
        {renderItems([
          { action: 'sort-by-name', icon: currentSort === 'name' ? <CheckSquareOutlined /> : <ReloadOutlined />, title: '按名称排序', kbd: currentSort === 'name' ? '当前' : undefined, selected: currentSort === 'name' },
          { action: 'sort-by-frequency', icon: currentSort === 'frequency' ? <CheckSquareOutlined /> : <ReloadOutlined />, title: '按使用频率排序', kbd: currentSort === 'frequency' ? '当前' : undefined, selected: currentSort === 'frequency' },
        ])}
      </div>
    </div>
  );
};

export type V2DatabaseContextMenuActionKey =
  | 'new-table'
  | 'new-schema'
  | 'new-materialized-view'
  | 'new-external-catalog'
  | 'rename-db'
  | 'refresh'
  | 'export-db-schema'
  | 'backup-db-sql'
  | 'disconnect-db'
  | 'new-query'
  | 'run-sql'
  | 'drop-db';

export const V2DatabaseContextMenuView: React.FC<{
  dbName: string;
  dialect?: string;
  supportsSchemaActions?: boolean;
  supportsStarRocksActions?: boolean;
  onAction?: (action: V2DatabaseContextMenuActionKey) => void;
}> = ({
  dbName,
  dialect,
  supportsSchemaActions = false,
  supportsStarRocksActions = false,
  onAction,
}) => {
  const renderItems = (items: V2TableContextMenuItemConfig[]) => renderV2ContextMenuItems(
    items,
    onAction as (action: string) => void,
  );

  return (
    <div className="gn-v2-table-context-menu gn-v2-database-context-menu" data-v2-database-context-menu="true" role="menu">
      <V2ContextMenuHeader
        icon={<DatabaseOutlined />}
        title={dbName}
        meta={`${dialect || 'database'} · 数据库操作`}
        pill="DB"
      />

      <div className="gn-v2-context-menu-body">
        {renderItems([
          { action: 'new-table', icon: <TableOutlined />, title: '新建表', kbd: '⌘N', featured: true },
          ...(supportsSchemaActions ? [{ action: 'new-schema', icon: <FolderAddOutlined />, title: '新建模式' }] : []),
          { action: 'new-query', icon: <ConsoleSqlOutlined />, title: '新建查询' },
          { action: 'run-sql', icon: <FileAddOutlined />, title: '运行外部 SQL 文件' },
        ])}

        {supportsStarRocksActions && (
          <>
            <div className="gn-v2-context-menu-section-title">StarRocks</div>
            {renderItems([
              { action: 'new-materialized-view', icon: <ThunderboltOutlined />, title: '新建物化视图' },
              { action: 'new-external-catalog', icon: <CloudOutlined />, title: '新建外部 Catalog' },
            ])}
          </>
        )}

        <div className="gn-v2-context-menu-section-title">维护</div>
        {renderItems([
          { action: 'rename-db', icon: <EditOutlined />, title: '重命名数据库', kbd: 'F2' },
          { action: 'refresh', icon: <ReloadOutlined />, title: '刷新对象树' },
          { action: 'disconnect-db', icon: <DisconnectOutlined />, title: '关闭数据库' },
        ])}

        <div className="gn-v2-context-menu-section-title">导出与备份</div>
        {renderItems([
          { action: 'export-db-schema', icon: <ExportOutlined />, title: '导出全部表结构 · SQL' },
          { action: 'backup-db-sql', icon: <SaveOutlined />, title: '备份全部表 · 结构 + 数据' },
        ])}

        <div className="gn-v2-context-menu-divider" />
        {renderItems([
          { action: 'drop-db', icon: <DeleteOutlined />, title: '删除数据库 · DROP', tone: 'danger', kbd: '⌫' },
        ])}
      </div>
    </div>
  );
};

export type V2ConnectionContextMenuActionKey =
  | 'new-db'
  | 'refresh'
  | 'new-query'
  | 'open-sql-file'
  | 'new-command'
  | 'open-monitor'
  | 'edit'
  | 'copy-connection'
  | 'disconnect'
  | 'delete'
  | 'move-to-ungrouped'
  | `move-to-tag:${string}`;

export type V2ConnectionContextMenuTagItem = {
  id: string;
  name: string;
  selected?: boolean;
};

export type V2ConnectionGroupContextMenuActionKey =
  | 'edit-group'
  | 'delete-group';

export const V2ConnectionGroupContextMenuView: React.FC<{
  groupName: string;
  count?: number;
  onAction?: (action: V2ConnectionGroupContextMenuActionKey) => void;
}> = ({
  groupName,
  count = 0,
  onAction,
}) => {
  const renderItems = (items: V2TableContextMenuItemConfig[]) => renderV2ContextMenuItems(
    items,
    onAction as (action: string) => void,
  );

  return (
    <div className="gn-v2-table-context-menu gn-v2-connection-group-context-menu" data-v2-connection-group-context-menu="true" role="menu">
      <V2ContextMenuHeader
        icon={<FolderOpenOutlined />}
        title={groupName || '未命名分组'}
        meta={`${count.toLocaleString()} 个连接 · 连接分组`}
        pill="GROUP"
      />

      <div className="gn-v2-context-menu-body">
        {renderItems([
          { action: 'edit-group', icon: <EditOutlined />, title: '编辑分组', kbd: 'F2', featured: true },
        ])}
        <div className="gn-v2-context-menu-divider" />
        {renderItems([
          { action: 'delete-group', icon: <DeleteOutlined />, title: '删除分组', tone: 'danger', kbd: '⌫' },
        ])}
      </div>
    </div>
  );
};

export const V2ConnectionContextMenuView: React.FC<{
  connectionName: string;
  hostSummary?: string;
  driverLabel?: string;
  isRedis?: boolean;
  tags?: V2ConnectionContextMenuTagItem[];
  onAction?: (action: V2ConnectionContextMenuActionKey) => void;
}> = ({
  connectionName,
  hostSummary,
  driverLabel,
  isRedis = false,
  tags = [],
  onAction,
}) => {
  const renderItems = (items: V2TableContextMenuItemConfig[]) => renderV2ContextMenuItems(
    items,
    onAction as (action: string) => void,
  );
  const hasSelectedTag = tags.some((tag) => tag.selected);
  const meta = [
    driverLabel || (isRedis ? 'redis' : 'database'),
    hostSummary || '未配置地址',
  ].filter(Boolean).join(' · ');

  return (
    <div className="gn-v2-table-context-menu gn-v2-connection-context-menu" data-v2-connection-context-menu="true" role="menu">
      <V2ContextMenuHeader
        icon={isRedis ? <HddOutlined /> : <CloudOutlined />}
        title={connectionName}
        meta={meta}
        pill="HOST"
      />

      <div className="gn-v2-context-menu-body">
        {isRedis ? renderItems([
          { action: 'refresh', icon: <ReloadOutlined />, title: '刷新连接', kbd: '⌘R', featured: true },
          { action: 'new-command', icon: <ConsoleSqlOutlined />, title: '新建命令窗口', featured: true },
          { action: 'open-monitor', icon: <DashboardOutlined />, title: 'Redis 实例监控' },
        ]) : renderItems([
          { action: 'new-db', icon: <DatabaseOutlined />, title: '新建数据库', kbd: '⌘N', featured: true },
          { action: 'refresh', icon: <ReloadOutlined />, title: '刷新连接', kbd: '⌘R' },
          { action: 'new-query', icon: <ConsoleSqlOutlined />, title: '新建查询' },
          { action: 'open-sql-file', icon: <FileAddOutlined />, title: '运行外部 SQL 文件' },
        ])}

        <div className="gn-v2-context-menu-section-title">连接</div>
        {renderItems([
          { action: 'edit', icon: <EditOutlined />, title: '编辑连接', kbd: 'F2' },
          { action: 'copy-connection', icon: <CopyOutlined />, title: '复制连接' },
          { action: 'disconnect', icon: <DisconnectOutlined />, title: '断开连接' },
        ])}

        {tags.length > 0 && (
          <>
            <div className="gn-v2-context-menu-section-title">分组</div>
            {renderItems([
              ...tags.map((tag): V2TableContextMenuItemConfig => ({
                action: `move-to-tag:${tag.id}`,
                icon: tag.selected ? <CheckSquareOutlined /> : <FolderOutlined />,
                title: tag.name,
                kbd: tag.selected ? '当前' : undefined,
                selected: tag.selected,
              })),
              {
                action: 'move-to-ungrouped',
                icon: hasSelectedTag ? <FolderOpenOutlined /> : <CheckSquareOutlined />,
                title: '移出分组',
                kbd: hasSelectedTag ? undefined : '当前',
                selected: !hasSelectedTag,
              },
            ])}
          </>
        )}

        <div className="gn-v2-context-menu-divider" />
        {renderItems([
          { action: 'delete', icon: <DeleteOutlined />, title: '删除连接', tone: 'danger', kbd: '⌫' },
        ])}
      </div>
    </div>
  );
};

export type V2CellContextMenuActionKey =
  | 'copy-field-name'
  | 'copy-row-data'
  | 'copy-column-data'
  | 'set-null'
  | 'edit-row'
  | 'fill-selected'
  | 'paste-copied-columns'
  | 'copy-insert'
  | 'copy-update'
  | 'copy-delete'
  | 'copy-json'
  | 'copy-csv'
  | 'copy-markdown'
  | 'export-csv'
  | 'export-xlsx'
  | 'export-json'
  | 'export-html';

export type V2ColumnHeaderContextMenuActionKey =
  | 'copy-field-name'
  | 'copy-column-data'
  | 'sort-asc'
  | 'sort-desc'
  | 'clear-sort'
  | 'auto-fit-column'
  | 'hide-column'
  | 'show-column-type'
  | 'hide-column-type'
  | 'show-column-comment'
  | 'hide-column-comment';

export const V2ColumnHeaderContextMenuView: React.FC<{
  fieldName: string;
  columnType?: string;
  columnComment?: string;
  sortOrder?: 'ascend' | 'descend' | null;
  showColumnType?: boolean;
  showColumnComment?: boolean;
  onAction?: (action: V2ColumnHeaderContextMenuActionKey) => void;
}> = ({
  fieldName,
  columnType,
  columnComment,
  sortOrder,
  showColumnType = true,
  showColumnComment = true,
  onAction,
}) => {
  const renderItems = (items: V2TableContextMenuItemConfig[]) => renderV2ContextMenuItems(
    items,
    onAction as (action: string) => void,
  );
  const normalizedType = String(columnType || '').trim();
  const normalizedComment = String(columnComment || '').trim();
  const meta = [
    normalizedType || '未知类型',
    normalizedComment || '暂无备注',
  ].join(' · ');

  return (
    <div className="gn-v2-table-context-menu gn-v2-column-context-menu" data-v2-column-context-menu="true" role="menu">
      <V2ContextMenuHeader
        icon={<FileTextOutlined />}
        title={fieldName || '未命名字段'}
        meta={meta}
        pill="FIELD"
      />

      <div className="gn-v2-context-menu-body">
        {renderItems([
          { action: 'copy-field-name', icon: <CopyOutlined />, title: '复制字段名称', kbd: '⌘C', featured: true },
          { action: 'copy-column-data', icon: <CopyOutlined />, title: '复制列数据' },
        ])}

        <div className="gn-v2-context-menu-section-title">排序</div>
        {renderItems([
          { action: 'sort-asc', icon: <SortAscendingOutlined />, title: '升序排序', selected: sortOrder === 'ascend', kbd: sortOrder === 'ascend' ? '当前' : undefined },
          { action: 'sort-desc', icon: <SortDescendingOutlined />, title: '降序排序', selected: sortOrder === 'descend', kbd: sortOrder === 'descend' ? '当前' : undefined },
          { action: 'clear-sort', icon: <ClearOutlined />, title: '取消此字段排序', disabled: !sortOrder },
        ])}

        <div className="gn-v2-context-menu-section-title">字段显示</div>
        {renderItems([
          { action: 'auto-fit-column', icon: <ColumnWidthOutlined />, title: '按内容自适应列宽' },
          { action: 'hide-column', icon: <EyeInvisibleOutlined />, title: '隐藏此字段' },
          {
            action: showColumnType ? 'hide-column-type' : 'show-column-type',
            icon: <FileTextOutlined />,
            title: showColumnType ? '隐藏字段类型' : '显示字段类型',
            selected: showColumnType,
          },
          {
            action: showColumnComment ? 'hide-column-comment' : 'show-column-comment',
            icon: <FileTextOutlined />,
            title: showColumnComment ? '隐藏字段备注' : '显示字段备注',
            selected: showColumnComment,
          },
        ])}
      </div>
    </div>
  );
};

export const V2CellContextMenuView: React.FC<{
  fieldName: string;
  tableName?: string;
  rowLabel?: string;
  selectedRowCount?: number;
  canModifyData?: boolean;
  canPasteCopiedColumns?: boolean;
  supportsCopyInsert?: boolean;
  onAction?: (action: V2CellContextMenuActionKey) => void;
}> = ({
  fieldName,
  tableName,
  rowLabel,
  selectedRowCount = 0,
  canModifyData = false,
  canPasteCopiedColumns = false,
  supportsCopyInsert = true,
  onAction,
}) => {
  const renderItems = (items: V2TableContextMenuItemConfig[]) => renderV2ContextMenuItems(
    items,
    onAction as (action: string) => void,
  );
  const selectedCountLabel = Math.max(0, selectedRowCount).toLocaleString();
  const menuTitle = fieldName || '未命名字段';
  const meta = [tableName, rowLabel || '当前行'].filter(Boolean).join(' · ') || '当前单元格';

  return (
    <div className="gn-v2-table-context-menu gn-v2-cell-context-menu" data-v2-cell-context-menu="true" role="menu">
      <V2ContextMenuHeader
        icon={<TableOutlined />}
        title={menuTitle}
        meta={meta}
        pill="CELL"
      />

      <div className="gn-v2-context-menu-body">
        {renderItems([
          { action: 'copy-field-name', icon: <CopyOutlined />, title: '复制字段名称', kbd: '⌘C', featured: true },
        ])}

        {canModifyData && (
          <>
            <div className="gn-v2-context-menu-section-title">编辑</div>
            {renderItems([
              { action: 'set-null', icon: <ClearOutlined />, title: '设置为 NULL' },
              { action: 'edit-row', icon: <EditOutlined />, title: '编辑本行', kbd: '↵' },
              {
                action: 'fill-selected',
                icon: <VerticalAlignBottomOutlined />,
                title: `填充到选中行 (${selectedCountLabel})`,
                disabled: selectedRowCount <= 0,
              },
              {
                action: 'paste-copied-columns',
                icon: <VerticalAlignBottomOutlined />,
                title: '粘贴已复制列 · 同名列',
                disabled: !canPasteCopiedColumns,
              },
            ])}
          </>
        )}

        <div className="gn-v2-context-menu-section-title">复制</div>
        {renderItems([
          { action: 'copy-row-data', icon: <CopyOutlined />, title: '复制行数据' },
          { action: 'copy-column-data', icon: <CopyOutlined />, title: '复制列数据' },
          ...(supportsCopyInsert ? [
            { action: 'copy-insert' as const, icon: <ConsoleSqlOutlined />, title: '复制为 INSERT', kbd: 'SQL' },
            { action: 'copy-update' as const, icon: <ConsoleSqlOutlined />, title: '复制为 UPDATE' },
            { action: 'copy-delete' as const, icon: <ConsoleSqlOutlined />, title: '复制为 DELETE' },
          ] : []),
          { action: 'copy-json', icon: <FileTextOutlined />, title: '复制为 JSON' },
          { action: 'copy-csv', icon: <FileTextOutlined />, title: '复制为 CSV' },
          { action: 'copy-markdown', icon: <CopyOutlined />, title: '复制为 Markdown' },
        ])}

        <div className="gn-v2-context-menu-section-title">导出</div>
        {renderItems([
          { action: 'export-csv', icon: <ExportOutlined />, title: 'CSV · .csv' },
          { action: 'export-xlsx', icon: <ExportOutlined />, title: 'Excel · .xlsx' },
          { action: 'export-json', icon: <ExportOutlined />, title: 'JSON · .json' },
          { action: 'export-html', icon: <ExportOutlined />, title: 'HTML · .html' },
        ])}
      </div>
    </div>
  );
};
