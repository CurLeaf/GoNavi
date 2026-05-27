import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, InputNumber, Select, Space, Typography } from 'antd';

import DataGrid, { GONAVI_ROW_KEY } from '../components/DataGrid';
import type { EditRowLocator } from '../utils/rowLocator';

const { Text } = Typography;

type HarnessRow = Record<string, any> & {
  [GONAVI_ROW_KEY]: string;
};

const buildHarnessColumns = (count: number): string[] => {
  const safeCount = Math.max(8, Math.min(64, Math.trunc(count || 0)));
  return Array.from({ length: safeCount }, (_, index) => {
    if (index === 0) return 'id';
    if (index === 1) return 'created_at';
    if (index === 2) return 'updated_at';
    if (index === 3) return 'status';
    return `col_${String(index + 1).padStart(2, '0')}`;
  });
};

const buildHarnessData = (rowCount: number, columnNames: string[]): HarnessRow[] => {
  const safeRows = Math.max(200, Math.min(50000, Math.trunc(rowCount || 0)));
  return Array.from({ length: safeRows }, (_, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const nextRow: HarnessRow = {
      [GONAVI_ROW_KEY]: `perf-row-${rowNumber}`,
      id: rowNumber,
      created_at: `2026-05-${String((rowNumber % 28) + 1).padStart(2, '0')} 09:${String(rowNumber % 60).padStart(2, '0')}:12`,
      updated_at: `2026-05-${String((rowNumber % 28) + 1).padStart(2, '0')} 18:${String((rowNumber * 3) % 60).padStart(2, '0')}:45`,
      status: rowNumber % 3 === 0 ? 'active' : (rowNumber % 3 === 1 ? 'pending' : 'archived'),
    };
    columnNames.forEach((columnName, columnIndex) => {
      if (Object.prototype.hasOwnProperty.call(nextRow, columnName)) {
        return;
      }
      if (columnIndex % 9 === 0) {
        nextRow[columnName] = rowNumber * (columnIndex + 1);
        return;
      }
      if (columnIndex % 7 === 0) {
        nextRow[columnName] = JSON.stringify({
          row: rowNumber,
          col: columnName,
          flag: rowIndex % 5 === 0,
        });
        return;
      }
      nextRow[columnName] = `${columnName}-value-${rowNumber}-${(columnIndex % 5) + 1}`;
    });
    return nextRow;
  });
};

const HARNESS_EDIT_LOCATOR: EditRowLocator = {
  strategy: 'primary-key',
  columns: ['id'],
  valueColumns: ['id'],
  readOnly: false,
};

const PerfDataGridHarness: React.FC = () => {
  const [rowCount, setRowCount] = useState(10000);
  const [columnCount, setColumnCount] = useState(24);
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');

  const columnNames = useMemo(() => buildHarnessColumns(columnCount), [columnCount]);
  const data = useMemo(() => buildHarnessData(rowCount, columnNames), [rowCount, columnNames]);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#0b1220', padding: 16, boxSizing: 'border-box' }}>
      <Card
        style={{
          height: '100%',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        bodyStyle={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: 12,
          gap: 12,
        }}
      >
        <Space wrap align="center" size={12}>
          <Text strong>DataGrid 性能复现页</Text>
          <InputNumber
            min={200}
            max={50000}
            step={500}
            value={rowCount}
            onChange={(value) => setRowCount(Number(value) || 10000)}
            addonBefore="行数"
          />
          <InputNumber
            min={8}
            max={64}
            step={2}
            value={columnCount}
            onChange={(value) => setColumnCount(Number(value) || 24)}
            addonBefore="列数"
          />
          <Select
            value={density}
            style={{ width: 140 }}
            onChange={(value) => setDensity(value)}
            options={[
              { value: 'compact', label: '紧凑' },
              { value: 'comfortable', label: '标准' },
              { value: 'spacious', label: '宽松' },
            ]}
          />
          <Button
            onClick={() => {
              window.dispatchEvent(new Event('resize'));
            }}
          >
            触发布局重算
          </Button>
        </Space>
        <Alert
          type="info"
          showIcon
          message="这个页面只用于开发态滚动性能采样"
          description={`当前 ${data.length} 行 / ${columnNames.length} 列。直接在表格区域做纵向、横向、Shift+滚轮滚动采样。`}
        />
        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <DataGrid
            data={data}
            columnNames={columnNames}
            loading={false}
            tableName="perf_grid"
            dbName="perf_lab"
            connectionId="perf-conn"
            pkColumns={['id']}
            editLocator={HARNESS_EDIT_LOCATOR}
            pagination={{
              current: 1,
              pageSize: data.length,
              total: data.length,
              totalKnown: true,
            }}
            onPageChange={() => {}}
          />
        </div>
      </Card>
    </div>
  );
};

export default PerfDataGridHarness;
