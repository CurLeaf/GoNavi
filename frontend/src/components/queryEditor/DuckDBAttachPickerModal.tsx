import React, { useEffect, useMemo, useState } from 'react';
import { ApiOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Modal, Switch, Tag, type MenuProps } from 'antd';

import { t as translate } from '../../i18n';
import type { SavedConnection } from '../../types';
import { invokeAppMethodDynamic } from '../../utils/webRpc';
import {
  buildDuckDBAttachStatementText,
  isDuckDBAttachableConnection,
  slugifyDuckDBAttachAlias,
} from './duckdbAttachStatement';

export interface DuckDBAttachedDatasource {
  alias: string;
  connectionId?: string;
  kind: string;
  readOnly: boolean;
}

interface DuckDBAttachPickerModalProps {
  open: boolean;
  connections: SavedConnection[];
  darkMode: boolean;
  /** 宿主 DuckDB 连接配置，用于查询当前会话的附加状态。 */
  hostConnectionConfig?: unknown;
  hostDbName?: string;
  onClose: () => void;
  /** 选中连接并点击插入后回调，statement 为构造好的语句文本。 */
  onInsert: (statement: string) => void;
}

type DuckDBAttachMenuItem = NonNullable<MenuProps['items']>[number];

/** 仅 DuckDB 连接显示。文案与图标留在本组件，查询编辑器只负责挂上。 */
export const buildDuckDBAttachMenuItems = (
  dbType: string | undefined,
  onOpen: () => void,
): DuckDBAttachMenuItem[] => {
  if (String(dbType || '').trim().toLowerCase() !== 'duckdb') {
    return [];
  }
  return [{
    key: 'duckdb-attach-datasource',
    icon: <ApiOutlined />,
    label: translate('query_editor.duckdb_attach.menu'),
    onClick: onOpen,
  }];
};

const useDuckDBAttachedDatasources = (
  open: boolean,
  hostConnectionConfig: unknown,
  hostDbName: string | undefined,
): DuckDBAttachedDatasource[] => {
  const [attachedList, setAttachedList] = useState<DuckDBAttachedDatasource[]>([]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const listed = await loadDuckDBAttachedDatasources(hostConnectionConfig, hostDbName);
        if (!cancelled) {
          setAttachedList(listed);
        }
      } catch {
        if (!cancelled) {
          setAttachedList([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, hostConnectionConfig, hostDbName]);

  return attachedList;
};

const loadDuckDBAttachedDatasources = async (
  hostConnectionConfig: unknown,
  hostDbName: string | undefined,
): Promise<DuckDBAttachedDatasource[]> => {
  const args = [hostConnectionConfig ?? null, hostDbName ?? ''];
  const viaBridge = await invokeAppMethodDynamic<DuckDBAttachedDatasource[]>(
    'ListDuckDBAttachedDatasources',
    args,
  );
  if (Array.isArray(viaBridge)) {
    return viaBridge;
  }
  const dynamic = (window as unknown as {
    go?: { app?: { App?: { ListDuckDBAttachedDatasources?: (config: unknown, dbName: string) => Promise<DuckDBAttachedDatasource[]> } } };
  }).go?.app?.App;
  if (typeof dynamic?.ListDuckDBAttachedDatasources !== 'function') {
    return [];
  }
  const listed = await dynamic.ListDuckDBAttachedDatasources(hostConnectionConfig ?? null, hostDbName ?? '');
  return Array.isArray(listed) ? listed : [];
};

interface DuckDBAttachConnectionListProps {
  connections: SavedConnection[];
  keyword: string;
  selectedId: string;
  attachedByConnectionId: Map<string, DuckDBAttachedDatasource>;
  darkMode: boolean;
  onSelect: (connection: SavedConnection) => void;
}

const DuckDBAttachConnectionList: React.FC<DuckDBAttachConnectionListProps> = ({
  connections,
  keyword,
  selectedId,
  attachedByConnectionId,
  darkMode,
  onSelect,
}) => {
  const filtered = useMemo(() => filterDuckDBAttachConnections(connections, keyword), [connections, keyword]);
  const mutedColor = darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(16,24,40,0.6)';
  const borderColor = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)';
  if (filtered.length === 0) {
    return <Empty description={translate('query_editor.duckdb_attach.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  return (
    <>
      {filtered.map((connection) => (
        <DuckDBAttachConnectionButton
          key={connection.id}
          connection={connection}
          selected={connection.id === selectedId}
          attached={attachedByConnectionId.get(connection.id)}
          mutedColor={mutedColor}
          borderColor={borderColor}
          darkMode={darkMode}
          onSelect={onSelect}
        />
      ))}
    </>
  );
};

const filterDuckDBAttachConnections = (connections: SavedConnection[], keyword: string): SavedConnection[] => {
  const keywordText = keyword.trim().toLowerCase();
  const items = [...connections].sort((left, right) =>
    String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' }));
  if (!keywordText) {
    return items;
  }
  return items.filter((item) =>
    String(item.name || '').toLowerCase().includes(keywordText)
    || String(item.id || '').toLowerCase().includes(keywordText));
};

interface DuckDBAttachConnectionButtonProps {
  connection: SavedConnection;
  selected: boolean;
  attached?: DuckDBAttachedDatasource;
  mutedColor: string;
  borderColor: string;
  darkMode: boolean;
  onSelect: (connection: SavedConnection) => void;
}

const DuckDBAttachConnectionButton: React.FC<DuckDBAttachConnectionButtonProps> = ({
  connection,
  selected,
  attached,
  mutedColor,
  borderColor,
  darkMode,
  onSelect,
}) => {
  const attachable = isDuckDBAttachableConnection(connection.config);
  return (
    <button
      type="button"
      data-duckdb-attach-item={connection.id}
      disabled={!attachable}
      onClick={() => onSelect(connection)}
      style={{
        textAlign: 'left',
        borderRadius: 10,
        border: `1px solid ${selected ? '#1677ff' : borderColor}`,
        background: darkMode ? 'rgba(255,255,255,0.03)' : '#fff',
        padding: '10px 12px',
        cursor: attachable ? 'pointer' : 'not-allowed',
        opacity: attachable ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: darkMode ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.88)' }}>
          {connection.name || connection.id}
        </span>
        <Tag style={{ marginRight: 0 }}>{String(connection.config?.type || '')}</Tag>
        {!attachable && (
          <span style={{ fontSize: 11, color: mutedColor }}>
            {translate('query_editor.duckdb_attach.unsupported_type')}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: mutedColor, marginTop: 4, fontFamily: 'var(--gn-font-mono)' }}>
        {connection.id}
      </div>
      {attached ? (
        <div style={{ marginTop: 4 }}>
          <Tag color="green" style={{ marginRight: 0 }}>
            {translate('query_editor.duckdb_attach.attached_badge', { alias: attached.alias })}
          </Tag>
        </div>
      ) : null}
    </button>
  );
};

/**
 * DuckDB“附加已保存数据源”选择器：挑选连接、确认别名与只读模式。
 * 插入的语句只含连接 ID，不含凭据；不在这里执行 SQL。
 */
const DuckDBAttachPickerModal: React.FC<DuckDBAttachPickerModalProps> = ({
  open,
  connections,
  darkMode,
  hostConnectionConfig,
  hostDbName,
  onClose,
  onInsert,
}) => {
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [alias, setAlias] = useState('');
  const [aliasEdited, setAliasEdited] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const attachedList = useDuckDBAttachedDatasources(open, hostConnectionConfig, hostDbName);
  const attachedByConnectionId = useMemo(() => indexAttachedByConnectionId(attachedList), [attachedList]);
  const selected = useMemo(
    () => connections.find((item) => item.id === selectedId) || null,
    [connections, selectedId],
  );
  const statement = buildSelectedAttachStatement(selected, alias, readOnly);

  const handleSelect = (connection: SavedConnection) => {
    setSelectedId(connection.id);
    const attached = attachedByConnectionId.get(connection.id);
    if (attached) {
      setAlias(attached.alias);
      setAliasEdited(true);
      setReadOnly(attached.readOnly);
      return;
    }
    if (!aliasEdited) {
      setAlias(slugifyDuckDBAttachAlias(connection.name, connection.id));
    }
  };

  const handleClose = () => {
    setKeyword('');
    setSelectedId('');
    setAlias('');
    setAliasEdited(false);
    setReadOnly(true);
    onClose();
  };

  const mutedColor = darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(16,24,40,0.6)';

  return (
    <Modal
      title={translate('query_editor.duckdb_attach.title')}
      open={open}
      centered
      width={560}
      onCancel={handleClose}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          {translate('common.cancel')}
        </Button>,
        <Button
          key="insert"
          type="primary"
          data-duckdb-attach-insert="true"
          disabled={!statement}
          onClick={() => {
            if (!statement) {
              return;
            }
            onInsert(statement);
            handleClose();
          }}
        >
          {translate('query_editor.duckdb_attach.insert')}
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: mutedColor }}>
          {translate('query_editor.duckdb_attach.description')}
        </div>
        <Input
          autoFocus
          data-duckdb-attach-search="true"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={translate('query_editor.duckdb_attach.search_placeholder')}
          allowClear
        />
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8, paddingRight: 4 }}>
          <DuckDBAttachConnectionList
            connections={connections}
            keyword={keyword}
            selectedId={selectedId}
            attachedByConnectionId={attachedByConnectionId}
            darkMode={darkMode}
            onSelect={handleSelect}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            {translate('query_editor.duckdb_attach.read_only')}
            <Switch size="small" checked={readOnly} onChange={setReadOnly} />
          </label>
          <Input
            data-duckdb-attach-alias="true"
            value={alias}
            onChange={(event) => {
              setAlias(event.target.value);
              setAliasEdited(true);
            }}
            placeholder={translate('query_editor.duckdb_attach.alias_placeholder')}
            style={{ flex: '1 1 200px' }}
            allowClear
          />
        </div>
      </div>
    </Modal>
  );
};

const indexAttachedByConnectionId = (
  attachedList: DuckDBAttachedDatasource[],
): Map<string, DuckDBAttachedDatasource> => {
  const map = new Map<string, DuckDBAttachedDatasource>();
  for (const item of attachedList) {
    if (item.connectionId) {
      map.set(item.connectionId, item);
    }
  }
  return map;
};

const buildSelectedAttachStatement = (
  selected: SavedConnection | null,
  alias: string,
  readOnly: boolean,
): string => {
  if (!selected || !isDuckDBAttachableConnection(selected.config)) {
    return '';
  }
  return buildDuckDBAttachStatementText({
    connectionId: selected.id,
    alias: alias.trim() || undefined,
    readOnly,
  });
};

export default DuckDBAttachPickerModal;
