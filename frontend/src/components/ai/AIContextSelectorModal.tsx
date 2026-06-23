import Modal from '../common/ResizableDraggableModal';
import React from 'react';
import { Button, Checkbox, Input, Select, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface ContextTableItem {
  name: string;
}

interface AIContextSelectorModalProps {
  open: boolean;
  loading: boolean;
  confirmLoading: boolean;
  darkMode: boolean;
  textColor: string;
  overlayTheme: OverlayWorkbenchTheme;
  dbList: string[];
  selectedDbName: string;
  searchText: string;
  filteredTables: ContextTableItem[];
  selectedTableKeys: string[];
  onCancel: () => void;
  onConfirm: () => void;
  onDbChange: (dbName: string) => void;
  onSearchTextChange: (value: string) => void;
  onSelectedTableKeysChange: (keys: string[]) => void;
}

export const AIContextSelectorModal: React.FC<AIContextSelectorModalProps> = ({
  open,
  loading,
  confirmLoading,
  darkMode,
  textColor,
  overlayTheme,
  dbList,
  selectedDbName,
  searchText,
  filteredTables,
  selectedTableKeys,
  onCancel,
  onConfirm,
  onDbChange,
  onSearchTextChange,
  onSelectedTableKeysChange,
}) => {
  const matchedKeys = filteredTables.map((table) => `${selectedDbName}::${table.name}`);
  const allSelected = matchedKeys.length > 0 && matchedKeys.every((key) => selectedTableKeys.includes(key));
  const partiallySelected = matchedKeys.length > 0 && matchedKeys.some((key) => selectedTableKeys.includes(key)) && !allSelected;

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      const nextSelected = new Set([...selectedTableKeys, ...matchedKeys]);
      onSelectedTableKeysChange(Array.from(nextSelected));
      return;
    }
    onSelectedTableKeysChange(selectedTableKeys.filter((key) => !matchedKeys.includes(key)));
  };

  const handleInvertSelection = () => {
    const remainingSelected = selectedTableKeys.filter((key) => !matchedKeys.includes(key));
    const keysToAdd = matchedKeys.filter((key) => !selectedTableKeys.includes(key));
    onSelectedTableKeysChange([...remainingSelected, ...keysToAdd]);
  };

  const handleToggleSingle = (key: string, checked: boolean) => {
    if (checked) {
      onSelectedTableKeysChange([...selectedTableKeys, key]);
      return;
    }
    onSelectedTableKeysChange(selectedTableKeys.filter((selectedKey) => selectedKey !== key));
  };

  return (
    <Modal
      title={<span style={{ color: textColor }}>关联数据库表结构上下文</span>}
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      confirmLoading={confirmLoading}
      okText="同步所选表至上下文"
      cancelText="取消"
      centered
      styles={{
        content: { background: darkMode ? '#1e1e1e' : '#ffffff', border: overlayTheme.shellBorder },
        header: { background: darkMode ? '#1e1e1e' : '#ffffff', borderBottom: overlayTheme.shellBorder },
        body: { padding: '20px 24px' },
      }}
    >
      <Spin spinning={loading}>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
          {dbList.length > 0 && (
            <Select
              value={selectedDbName}
              onChange={onDbChange}
              options={dbList.map((dbName) => ({ label: dbName, value: dbName }))}
              style={{ width: 160, flexShrink: 0 }}
              placeholder="切换数据库"
              showSearch
            />
          )}
          <Input
            placeholder="在当前库搜索表名..."
            prefix={<SearchOutlined style={{ color: overlayTheme.mutedText }} />}
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            style={{ background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: 'none', flexGrow: 1 }}
          />
        </div>

        {filteredTables.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                paddingBottom: 12,
                marginBottom: 8,
              }}
            >
              <Checkbox
                indeterminate={partiallySelected}
                checked={allSelected}
                onChange={(event) => handleToggleAll(event.target.checked)}
                style={{ color: textColor, fontWeight: 'bold' }}
              >
                全选匹配的表 ({filteredTables.length})
              </Checkbox>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', fontSize: 13 }}
                onClick={handleInvertSelection}
              >
                反选匹配结果
              </Button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', margin: '0 -24px', padding: '0 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredTables.map((table) => {
                  const key = `${selectedDbName}::${table.name}`;
                  const selected = selectedTableKeys.includes(key);
                  return (
                    <div
                      key={key}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 6,
                        transition: 'background 0.2s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = 'transparent';
                      }}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).tagName.toLowerCase() === 'input') {
                          return;
                        }
                        handleToggleSingle(key, !selected);
                      }}
                    >
                      <Checkbox
                        checked={selected}
                        onChange={(event) => handleToggleSingle(key, event.target.checked)}
                        style={{ color: textColor, width: '100%' }}
                      >
                        <span style={{ fontSize: 13, userSelect: 'none' }}>{table.name}</span>
                      </Checkbox>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px 0', textAlign: 'center', color: overlayTheme.mutedText }}>
            {searchText ? `没有找到匹配 '${searchText}' 的表` : '当前数据库没有可关联的表'}
          </div>
        )}
      </Spin>
    </Modal>
  );
};

export default AIContextSelectorModal;
