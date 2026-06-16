import React from 'react';
import { Button, Input, Popconfirm, Radio, Space, Tag } from 'antd';
import type { RadioChangeEvent } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';

import type { SavedConnection } from '../types';
import { noAutoCapInputProps } from '../utils/inputAutoCap';
import type { RedisSearchMode } from '../utils/redisSearchPattern';

const { Search } = Input;

const normalizeText = (value: unknown): string => String(value || '').trim();

const normalizeRedisTopology = (connection?: SavedConnection): 'single' | 'cluster' | 'sentinel' => {
  const topology = normalizeText(connection?.config?.topology).toLowerCase();
  if (topology === 'sentinel') return 'sentinel';
  if (topology === 'cluster') return 'cluster';
  const extraHosts = Array.isArray(connection?.config?.hosts) ? connection.config.hosts.filter(Boolean) : [];
  return extraHosts.length > 0 ? 'cluster' : 'single';
};

const buildRedisSeedAddresses = (connection?: SavedConnection): string[] => {
  if (!connection) return [];
  const config = connection.config || {};
  const port = Number.isFinite(Number(config.port)) ? Number(config.port) : 6379;
  const primary = normalizeText(config.host) ? `${normalizeText(config.host)}:${port}` : '';
  const extraHosts = Array.isArray(config.hosts)
    ? config.hosts.map((host) => normalizeText(host)).filter(Boolean)
    : [];
  return [primary, ...extraHosts].filter(Boolean);
};

const getRedisTopologyLabel = (topology: 'single' | 'cluster' | 'sentinel'): string => {
  if (topology === 'cluster') return 'Cluster';
  if (topology === 'sentinel') return 'Sentinel';
  return '单机';
};

type RedisViewerKeyToolbarProps = {
  isV2Ui: boolean;
  redisDB: number;
  connection?: SavedConnection;
  keyCount: number;
  selectedKeyCount: number;
  searchMode: RedisSearchMode;
  searchInput: string;
  mutedPillTagStyle: React.CSSProperties;
  actionButtonStyle: React.CSSProperties;
  primaryActionButtonStyle: React.CSSProperties;
  dangerActionButtonStyle: React.CSSProperties;
  textMutedColor: string;
  textPrimaryColor: string;
  onSearchModeChange: (event: RadioChangeEvent) => void;
  onSearchInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onCreateKey: () => void;
  onSelectAllLoadedKeys: () => void;
  onClearAllSelectedKeys: () => void;
  onDeleteSelectedKeys: () => void;
};

const RedisViewerKeyToolbar: React.FC<RedisViewerKeyToolbarProps> = ({
  isV2Ui,
  redisDB,
  connection,
  keyCount,
  selectedKeyCount,
  searchMode,
  searchInput,
  mutedPillTagStyle,
  actionButtonStyle,
  primaryActionButtonStyle,
  dangerActionButtonStyle,
  textMutedColor,
  textPrimaryColor,
  onSearchModeChange,
  onSearchInputChange,
  onSearch,
  onRefresh,
  onCreateKey,
  onSelectAllLoadedKeys,
  onClearAllSelectedKeys,
  onDeleteSelectedKeys,
}) => {
  const topology = normalizeRedisTopology(connection);
  const seedAddresses = buildRedisSeedAddresses(connection);
  const sentinelMaster = topology === 'sentinel'
    ? normalizeText(connection?.config?.redisSentinelMaster)
    : '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: textMutedColor, fontWeight: 600 }}>Key Explorer</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: textPrimaryColor }}>db{redisDB}</div>
            <Tag style={mutedPillTagStyle}>{getRedisTopologyLabel(topology)}</Tag>
            {topology !== 'single' && (
              <Tag style={mutedPillTagStyle}>{seedAddresses.length || 1} 节点</Tag>
            )}
            {sentinelMaster && (
              <Tag style={mutedPillTagStyle}>master: {sentinelMaster}</Tag>
            )}
          </div>
        </div>
        <Tag style={mutedPillTagStyle}>{keyCount} Keys</Tag>
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Radio.Group
          value={searchMode}
          onChange={onSearchModeChange}
          buttonStyle="solid"
          style={{ flexShrink: 0 }}
        >
          <Radio.Button value="fuzzy">模糊</Radio.Button>
          <Radio.Button value="exact">精确</Radio.Button>
        </Radio.Group>
        <Search
          {...noAutoCapInputProps}
          style={{ flex: 1 }}
          placeholder={searchMode === 'exact' ? '输入完整 Key / 命名空间精确搜索' : '搜索 Key（模糊匹配）'}
          value={searchInput}
          onChange={onSearchInputChange}
          onSearch={onSearch}
          allowClear
          enterButton={<SearchOutlined />}
        />
      </Space.Compact>
      <div className={isV2Ui ? 'gn-v2-redis-toolbar' : undefined} style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Space wrap size={8}>
          <Button size="small" style={actionButtonStyle} icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>
          <Button size="small" style={actionButtonStyle} icon={<PlusOutlined />} onClick={onCreateKey}>新建</Button>
          <Button size="small" style={primaryActionButtonStyle} onClick={onSelectAllLoadedKeys} disabled={keyCount === 0}>全选全部</Button>
          <Button size="small" style={actionButtonStyle} onClick={onClearAllSelectedKeys} disabled={selectedKeyCount === 0}>取消全选</Button>
        </Space>
        <Popconfirm
          title={`确定删除选中的 ${selectedKeyCount} 个 Key？`}
          onConfirm={onDeleteSelectedKeys}
          disabled={selectedKeyCount === 0}
        >
          <Button size="small" style={dangerActionButtonStyle} icon={<DeleteOutlined />} disabled={selectedKeyCount === 0}>
            删除选中({selectedKeyCount})
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
};

export default RedisViewerKeyToolbar;
