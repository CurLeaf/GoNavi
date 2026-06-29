import React from 'react';
import { Button, Checkbox, Input, Select, Space } from 'antd';
import {
  DatabaseOutlined,
  DeleteOutlined,
  ExportOutlined,
  EyeOutlined,
  SaveOutlined,
  SearchOutlined,
  TableOutlined,
} from '@ant-design/icons';
import Modal from '../common/ResizableDraggableModal';
import type { SavedConnection } from '../../types';
import { t } from '../../i18n';
import type {
  BatchObjectItem,
  BatchObjectFilterType,
  BatchSelectionScope,
} from './useSidebarBatchExport';

type SidebarBatchExportModalsProps = {
  connections: SavedConnection[];
  modalPanelStyle: React.CSSProperties;
  modalSectionStyle: React.CSSProperties;
  modalScrollSectionStyle: React.CSSProperties;
  modalHintTextStyle: React.CSSProperties;
  darkMode: boolean;
  tableModalTitle: React.ReactNode;
  databaseModalTitle: React.ReactNode;
  isBatchModalOpen: boolean;
  setIsBatchModalOpen: (open: boolean) => void;
  selectedConnection: string;
  selectedDatabase: string;
  availableDatabases: BatchObjectItem[];
  batchTables: BatchObjectItem[];
  checkedTableKeys: string[];
  setCheckedTableKeys: (keys: string[]) => void;
  batchFilterKeyword: string;
  setBatchFilterKeyword: (value: string) => void;
  batchFilterType: BatchObjectFilterType;
  setBatchFilterType: (value: BatchObjectFilterType) => void;
  batchSelectionScope: BatchSelectionScope;
  setBatchSelectionScope: (value: BatchSelectionScope) => void;
  filteredBatchObjects: BatchObjectItem[];
  groupedBatchObjects: {
    tables: BatchObjectItem[];
    views: BatchObjectItem[];
  };
  selectionScopeTargetKeys: string[];
  handleConnectionChange: (connectionId: string) => void;
  handleDatabaseChange: (databaseName: string) => void;
  handleBatchClear: () => void;
  handleBatchDeleteTables: () => void;
  handleBatchExport: (mode: 'schema' | 'dataOnly' | 'backup') => void;
  handleCheckAll: (checked: boolean) => void;
  handleInvertSelection: () => void;
  isBatchDbModalOpen: boolean;
  setIsBatchDbModalOpen: (open: boolean) => void;
  selectedDbConnection: string;
  batchDatabases: BatchObjectItem[];
  checkedDbKeys: string[];
  setCheckedDbKeys: (keys: string[]) => void;
  handleDbConnectionChange: (connectionId: string) => void;
  handleBatchDbExport: (includeData: boolean) => void;
  handleBatchDbDelete: () => void;
  handleCheckAllDb: (checked: boolean) => void;
  handleInvertSelectionDb: () => void;
};

const nonRedisConnections = (connections: SavedConnection[]) =>
  connections.filter((connection) => connection.config.type !== 'redis');

export const SidebarBatchExportModals: React.FC<SidebarBatchExportModalsProps> = ({
  connections,
  modalPanelStyle,
  modalSectionStyle,
  modalScrollSectionStyle,
  modalHintTextStyle,
  darkMode,
  tableModalTitle,
  databaseModalTitle,
  isBatchModalOpen,
  setIsBatchModalOpen,
  selectedConnection,
  selectedDatabase,
  availableDatabases,
  batchTables,
  checkedTableKeys,
  setCheckedTableKeys,
  batchFilterKeyword,
  setBatchFilterKeyword,
  batchFilterType,
  setBatchFilterType,
  batchSelectionScope,
  setBatchSelectionScope,
  filteredBatchObjects,
  groupedBatchObjects,
  selectionScopeTargetKeys,
  handleConnectionChange,
  handleDatabaseChange,
  handleBatchClear,
  handleBatchDeleteTables,
  handleBatchExport,
  handleCheckAll,
  handleInvertSelection,
  isBatchDbModalOpen,
  setIsBatchDbModalOpen,
  selectedDbConnection,
  batchDatabases,
  checkedDbKeys,
  setCheckedDbKeys,
  handleDbConnectionChange,
  handleBatchDbExport,
  handleBatchDbDelete,
  handleCheckAllDb,
  handleInvertSelectionDb,
}) => {
  const selectedTableCount = batchTables.filter(item => checkedTableKeys.includes(item.key) && item.objectType === 'table').length;

  return (
  <>
    <Modal
      title={tableModalTitle}
      open={isBatchModalOpen}
      onCancel={() => setIsBatchModalOpen(false)}
      width={720}
      centered
      styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button key="cancel" onClick={() => setIsBatchModalOpen(false)}>
            {t('sidebar.action.cancel')}
          </Button>
          <Space size={8} wrap style={{ marginLeft: 'auto' }}>
            <Button
              key="delete-tables"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleBatchDeleteTables()}
              disabled={selectedTableCount === 0}
            >
              {t('sidebar.action.delete_tables')}
            </Button>
            <Button
              key="clear"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleBatchClear()}
              disabled={checkedTableKeys.length === 0}
            >
              {t('sidebar.action.clear_tables')}
            </Button>
            <Button
              key="export-schema"
              icon={<ExportOutlined />}
              onClick={() => handleBatchExport('schema')}
              disabled={checkedTableKeys.length === 0}
            >
              {t('sidebar.action.export_schema')}
            </Button>
            <Button
              key="export-data-only"
              icon={<SaveOutlined />}
              onClick={() => handleBatchExport('dataOnly')}
              disabled={checkedTableKeys.length === 0}
            >
              {t('sidebar.action.export_data_only')}
            </Button>
            <Button
              key="backup"
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => handleBatchExport('backup')}
              disabled={checkedTableKeys.length === 0}
            >
              {t('sidebar.action.backup_schema_data')}
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            {t('sidebar.field.select_connection')}：
          </label>
          <Select
            value={selectedConnection}
            onChange={handleConnectionChange}
            style={{ width: '100%' }}
            placeholder={t('sidebar.placeholder.select_connection')}
          >
            {nonRedisConnections(connections).map(conn => (
              <Select.Option key={conn.id} value={conn.id}>
                {conn.name}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            {t('sidebar.field.select_database')}：
          </label>
          <Select
            value={selectedDatabase}
            onChange={handleDatabaseChange}
            style={{ width: '100%' }}
            placeholder={t('sidebar.placeholder.select_connection_first')}
            disabled={!selectedConnection}
          >
            {availableDatabases.map(db => (
              <Select.Option key={db.key} value={db.dbName || db.key}>
                {db.title}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div style={modalHintTextStyle}>{t('sidebar.modal.batch_tables.selection_hint')}</div>
      </div>

      {batchTables.length > 0 && (
        <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
          <Space wrap size={8} style={{ width: '100%' }}>
            <Input
              allowClear
              value={batchFilterKeyword}
              onChange={(e) => setBatchFilterKeyword(e.target.value)}
              placeholder={t('sidebar.placeholder.filter_table_view')}
              prefix={<SearchOutlined />}
              style={{ width: 260 }}
            />
            <Select
              value={batchFilterType}
              onChange={(value) => setBatchFilterType(value as BatchObjectFilterType)}
              style={{ width: 140 }}
              options={[
                { label: t('sidebar.filter.all_objects'), value: 'all' },
                { label: t('sidebar.filter.tables_only'), value: 'table' },
                { label: t('sidebar.filter.views_only'), value: 'view' },
              ]}
            />
            <Select
              value={batchSelectionScope}
              onChange={(value) => setBatchSelectionScope(value as BatchSelectionScope)}
              style={{ width: 220 }}
              options={[
                { label: t('sidebar.filter.scope_filtered'), value: 'filtered' },
                { label: t('sidebar.filter.scope_all'), value: 'all' },
              ]}
            />
          </Space>
          <div style={{ marginTop: 6, color: '#999', fontSize: 12 }}>
            {t('sidebar.batch.filtered_count', {
              filtered: filteredBatchObjects.length,
              total: batchTables.length,
            })}
          </div>
        </div>
      )}

      {batchTables.length > 0 && (
        <>
          <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
            <Space>
              <Button
                size="small"
                onClick={() => handleCheckAll(true)}
                disabled={selectionScopeTargetKeys.length === 0}
              >
                {t('sidebar.action.select_all')}
              </Button>
              <Button
                size="small"
                onClick={() => handleCheckAll(false)}
                disabled={selectionScopeTargetKeys.length === 0}
              >
                {t('sidebar.action.clear_selection')}
              </Button>
              <Button
                size="small"
                onClick={handleInvertSelection}
                disabled={selectionScopeTargetKeys.length === 0}
              >
                {t('sidebar.action.invert_selection')}
              </Button>
              <span style={{ color: '#999' }}>
                {t('sidebar.batch.selected_objects', {
                  selected: checkedTableKeys.length,
                  total: batchTables.length,
                })}
              </span>
            </Space>
          </div>
          <div style={modalScrollSectionStyle}>
            <Checkbox.Group
              value={checkedTableKeys}
              onChange={(values) => setCheckedTableKeys(values as string[])}
              style={{ width: '100%' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groupedBatchObjects.tables.length > 0 && (
                  <div>
                    <div style={{ marginBottom: 6, color: darkMode ? '#bfbfbf' : '#595959', fontSize: 12 }}>
                      {t('sidebar.batch.group.tables')} ({groupedBatchObjects.tables.length})
                    </div>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {groupedBatchObjects.tables.map(table => (
                        <Checkbox key={table.key} value={table.key}>
                          <TableOutlined style={{ marginRight: 8 }} />
                          {table.title}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
                {groupedBatchObjects.views.length > 0 && (
                  <div>
                    <div style={{ marginBottom: 6, color: darkMode ? '#bfbfbf' : '#595959', fontSize: 12 }}>
                      {t('sidebar.batch.group.views')} ({groupedBatchObjects.views.length})
                    </div>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {groupedBatchObjects.views.map(view => (
                        <Checkbox key={view.key} value={view.key}>
                          <EyeOutlined style={{ marginRight: 8 }} />
                          {view.title}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                )}
                {groupedBatchObjects.tables.length === 0 && groupedBatchObjects.views.length === 0 && (
                  <div style={{ color: '#999', padding: '8px 0' }}>
                    {t('sidebar.batch.no_matching_objects')}
                  </div>
                )}
              </div>
            </Checkbox.Group>
          </div>
        </>
      )}
    </Modal>

    <Modal
      title={databaseModalTitle}
      open={isBatchDbModalOpen}
      onCancel={() => setIsBatchDbModalOpen(false)}
      width={640}
      centered
      styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
      footer={[
        <Button key="cancel" onClick={() => setIsBatchDbModalOpen(false)}>
          {t('sidebar.action.cancel')}
        </Button>,
        <Button
          key="delete-databases"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleBatchDbDelete()}
          disabled={checkedDbKeys.length === 0}
        >
          {t('sidebar.action.delete_database_count', { count: checkedDbKeys.length })}
        </Button>,
        <Button
          key="export-schema"
          icon={<ExportOutlined />}
          onClick={() => handleBatchDbExport(false)}
          disabled={checkedDbKeys.length === 0}
        >
          {t('sidebar.action.export_database_schema_count', { count: checkedDbKeys.length })}
        </Button>,
        <Button
          key="backup"
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => handleBatchDbExport(true)}
          disabled={checkedDbKeys.length === 0}
        >
          {t('sidebar.action.backup_database_count', { count: checkedDbKeys.length })}
        </Button>,
      ]}
    >
      <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: darkMode ? '#f5f7ff' : '#162033' }}>
          {t('sidebar.field.select_connection')}：
        </label>
        <Select
          value={selectedDbConnection}
          onChange={handleDbConnectionChange}
          style={{ width: '100%' }}
          placeholder={t('sidebar.placeholder.select_connection')}
        >
          {nonRedisConnections(connections).map(conn => (
            <Select.Option key={conn.id} value={conn.id}>
              {conn.name}
            </Select.Option>
          ))}
        </Select>
        <div style={{ ...modalHintTextStyle, marginTop: 10 }}>
          {t('sidebar.modal.batch_databases.selection_hint')}
        </div>
      </div>

      {batchDatabases.length > 0 && (
        <>
          <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
            <Space>
              <Button
                size="small"
                onClick={() => handleCheckAllDb(true)}
              >
                {t('sidebar.action.select_all')}
              </Button>
              <Button
                size="small"
                onClick={() => handleCheckAllDb(false)}
              >
                {t('sidebar.action.clear_selection')}
              </Button>
              <Button
                size="small"
                onClick={handleInvertSelectionDb}
              >
                {t('sidebar.action.invert_selection')}
              </Button>
              <span style={{ color: '#999' }}>
                {t('sidebar.batch.selected_databases', {
                  selected: checkedDbKeys.length,
                  total: batchDatabases.length,
                })}
              </span>
            </Space>
          </div>
          <div style={modalScrollSectionStyle}>
            <Checkbox.Group
              value={checkedDbKeys}
              onChange={(values) => setCheckedDbKeys(values as string[])}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {batchDatabases.map(db => (
                  <Checkbox key={db.key} value={db.key}>
                    <DatabaseOutlined style={{ marginRight: 8 }} />
                    {db.title}
                  </Checkbox>
                ))}
              </Space>
            </Checkbox.Group>
          </div>
        </>
      )}
    </Modal>
  </>
  );
};
