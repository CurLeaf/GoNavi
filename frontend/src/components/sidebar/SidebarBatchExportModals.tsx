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
import type {
  BatchObjectFilterType,
  BatchSelectionScope,
} from './useSidebarBatchExport';

type BatchObjectItem = {
  key: string;
  dbName?: string;
  title: React.ReactNode;
};

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
  handleCheckAllDb,
  handleInvertSelectionDb,
}) => (
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
            取消
          </Button>
          <Space size={8} wrap style={{ marginLeft: 'auto' }}>
            <Button
              key="clear"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleBatchClear()}
              disabled={checkedTableKeys.length === 0}
            >
              清空表
            </Button>
            <Button
              key="export-schema"
              icon={<ExportOutlined />}
              onClick={() => handleBatchExport('schema')}
              disabled={checkedTableKeys.length === 0}
            >
              导出结构
            </Button>
            <Button
              key="export-data-only"
              icon={<SaveOutlined />}
              onClick={() => handleBatchExport('dataOnly')}
              disabled={checkedTableKeys.length === 0}
            >
              仅数据(INSERT)
            </Button>
            <Button
              key="backup"
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => handleBatchExport('backup')}
              disabled={checkedTableKeys.length === 0}
            >
              备份(结构+数据)
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>选择连接：</label>
          <Select
            value={selectedConnection}
            onChange={handleConnectionChange}
            style={{ width: '100%' }}
            placeholder="请选择连接"
          >
            {nonRedisConnections(connections).map(conn => (
              <Select.Option key={conn.id} value={conn.id}>
                {conn.name}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>选择数据库：</label>
          <Select
            value={selectedDatabase}
            onChange={handleDatabaseChange}
            style={{ width: '100%' }}
            placeholder="请先选择连接"
            disabled={!selectedConnection}
          >
            {availableDatabases.map(db => (
              <Select.Option key={db.key} value={db.dbName || db.key}>
                {db.title}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div style={modalHintTextStyle}>先选择连接与数据库，再决定导出范围和目标对象。</div>
      </div>

      {batchTables.length > 0 && (
        <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
          <Space wrap size={8} style={{ width: '100%' }}>
            <Input
              allowClear
              value={batchFilterKeyword}
              onChange={(e) => setBatchFilterKeyword(e.target.value)}
              placeholder="筛选表/视图名称"
              prefix={<SearchOutlined />}
              style={{ width: 260 }}
            />
            <Select
              value={batchFilterType}
              onChange={(value) => setBatchFilterType(value as BatchObjectFilterType)}
              style={{ width: 140 }}
              options={[
                { label: '全部对象', value: 'all' },
                { label: '仅表', value: 'table' },
                { label: '仅视图', value: 'view' },
              ]}
            />
            <Select
              value={batchSelectionScope}
              onChange={(value) => setBatchSelectionScope(value as BatchSelectionScope)}
              style={{ width: 220 }}
              options={[
                { label: '勾选作用于：当前筛选结果', value: 'filtered' },
                { label: '勾选作用于：全部对象', value: 'all' },
              ]}
            />
          </Space>
          <div style={{ marginTop: 6, color: '#999', fontSize: 12 }}>
            当前筛选命中 {filteredBatchObjects.length} / {batchTables.length} 个对象
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
                全选
              </Button>
              <Button
                size="small"
                onClick={() => handleCheckAll(false)}
                disabled={selectionScopeTargetKeys.length === 0}
              >
                取消全选
              </Button>
              <Button
                size="small"
                onClick={handleInvertSelection}
                disabled={selectionScopeTargetKeys.length === 0}
              >
                反选
              </Button>
              <span style={{ color: '#999' }}>
                已选择 {checkedTableKeys.length} / {batchTables.length} 个对象
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
                      表 ({groupedBatchObjects.tables.length})
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
                      视图 ({groupedBatchObjects.views.length})
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
                    无匹配对象
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
          取消
        </Button>,
        <Button
          key="export-schema"
          icon={<ExportOutlined />}
          onClick={() => handleBatchDbExport(false)}
          disabled={checkedDbKeys.length === 0}
        >
          导出库结构 ({checkedDbKeys.length})
        </Button>,
        <Button
          key="backup"
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => handleBatchDbExport(true)}
          disabled={checkedDbKeys.length === 0}
        >
          备份库 ({checkedDbKeys.length})
        </Button>,
      ]}
    >
      <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: darkMode ? '#f5f7ff' : '#162033' }}>选择连接：</label>
        <Select
          value={selectedDbConnection}
          onChange={handleDbConnectionChange}
          style={{ width: '100%' }}
          placeholder="请选择连接"
        >
          {nonRedisConnections(connections).map(conn => (
            <Select.Option key={conn.id} value={conn.id}>
              {conn.name}
            </Select.Option>
          ))}
        </Select>
        <div style={{ ...modalHintTextStyle, marginTop: 10 }}>连接选定后会加载当前连接下可批量导出的数据库列表。</div>
      </div>

      {batchDatabases.length > 0 && (
        <>
          <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
            <Space>
              <Button
                size="small"
                onClick={() => handleCheckAllDb(true)}
              >
                全选
              </Button>
              <Button
                size="small"
                onClick={() => handleCheckAllDb(false)}
              >
                取消全选
              </Button>
              <Button
                size="small"
                onClick={handleInvertSelectionDb}
              >
                反选
              </Button>
              <span style={{ color: '#999' }}>
                已选择 {checkedDbKeys.length} / {batchDatabases.length} 个库
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
