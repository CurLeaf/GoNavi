import React from 'react';
import { Button, Checkbox, Input } from 'antd';

export interface DataGridColumnInfoPopoverContentProps {
  darkMode: boolean;
  showColumnComment: boolean;
  showColumnType: boolean;
  columnSearchText: string;
  allOrderedColumnNames: string[];
  localHiddenColumns: string[];
  enableColumnOrderMemory: boolean;
  enableHiddenColumnMemory: boolean;
  canResetOrder: boolean;
  canResetHidden: boolean;
  onShowColumnCommentChange: (checked: boolean) => void;
  onShowColumnTypeChange: (checked: boolean) => void;
  onToggleAllColumnsVisibility: (visible: boolean) => void;
  onColumnSearchTextChange: (value: string) => void;
  onToggleColumnVisibility: (columnName: string, visible: boolean) => void;
  onEnableColumnOrderMemoryChange: (checked: boolean) => void;
  onEnableHiddenColumnMemoryChange: (checked: boolean) => void;
  onResetOrder: () => void;
  onResetHidden: () => void;
}

const DataGridColumnInfoPopoverContent: React.FC<DataGridColumnInfoPopoverContentProps> = ({
  darkMode,
  showColumnComment,
  showColumnType,
  columnSearchText,
  allOrderedColumnNames,
  localHiddenColumns,
  enableColumnOrderMemory,
  enableHiddenColumnMemory,
  canResetOrder,
  canResetHidden,
  onShowColumnCommentChange,
  onShowColumnTypeChange,
  onToggleAllColumnsVisibility,
  onColumnSearchTextChange,
  onToggleColumnVisibility,
  onEnableColumnOrderMemoryChange,
  onEnableHiddenColumnMemoryChange,
  onResetOrder,
  onResetHidden,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200, maxWidth: 300 }}>
    <div style={{ fontWeight: 600, fontSize: 13, color: darkMode ? '#ddd' : '#666' }}>显示设置</div>
    <Checkbox checked={showColumnComment} onChange={(e) => onShowColumnCommentChange(e.target.checked)}>
      表头显示备注
    </Checkbox>
    <Checkbox checked={showColumnType} onChange={(e) => onShowColumnTypeChange(e.target.checked)}>
      表头显示类型
    </Checkbox>
    <div style={{ height: 1, backgroundColor: darkMode ? '#424242' : '#f0f0f0', margin: '4px 0' }} />

    <div style={{ fontWeight: 600, fontSize: 13, color: darkMode ? '#ddd' : '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>列可见性</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <a style={{ fontSize: 12 }} onClick={() => onToggleAllColumnsVisibility(true)}>全显</a>
        <a style={{ fontSize: 12 }} onClick={() => onToggleAllColumnsVisibility(false)}>全隐</a>
      </div>
    </div>
    <Input
      placeholder="搜索列名..."
      size="small"
      value={columnSearchText}
      onChange={(e) => onColumnSearchTextChange(e.target.value)}
      allowClear
    />
    <div className="custom-scrollbar" style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {allOrderedColumnNames
        .filter((col) => !columnSearchText || col.toLowerCase().includes(columnSearchText.toLowerCase()))
        .map((col) => (
          <Checkbox
            key={col}
            checked={!localHiddenColumns.includes(col)}
            onChange={(e) => onToggleColumnVisibility(col, e.target.checked)}
            style={{ marginLeft: 0 }}
          >
            {col}
          </Checkbox>
        ))}
    </div>

    <div style={{ height: 1, backgroundColor: darkMode ? '#424242' : '#f0f0f0', margin: '4px 0' }} />
    <Checkbox checked={enableColumnOrderMemory} onChange={(e) => onEnableColumnOrderMemoryChange(e.target.checked)}>
      记忆自定义列序
    </Checkbox>
    <Checkbox checked={enableHiddenColumnMemory} onChange={(e) => onEnableHiddenColumnMemoryChange(e.target.checked)}>
      记忆隐藏列配置
    </Checkbox>
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <Button size="small" danger style={{ flex: 1 }} disabled={!canResetOrder} onClick={onResetOrder}>
        重置排序
      </Button>
      <Button size="small" danger style={{ flex: 1 }} disabled={!canResetHidden} onClick={onResetHidden}>
        重置隐藏
      </Button>
    </div>
  </div>
);

export default DataGridColumnInfoPopoverContent;
