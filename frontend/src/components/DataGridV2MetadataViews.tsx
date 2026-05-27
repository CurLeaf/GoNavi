import React from 'react';

export interface DataGridV2FieldsViewProps {
  tableName?: string;
  displayOutputColumnNames: string[];
  pkColumns: string[];
  locatorColumns?: string[];
  columnMetaMap: Record<string, { type?: string; comment?: string }>;
  columnMetaMapByLowerName: Record<string, { type?: string; comment?: string }>;
}

export const DataGridV2FieldsView: React.FC<DataGridV2FieldsViewProps> = ({
  tableName,
  displayOutputColumnNames,
  pkColumns,
  locatorColumns,
  columnMetaMap,
  columnMetaMapByLowerName,
}) => (
  <div className="gn-v2-data-grid-fields-view">
    <div className="gn-v2-data-grid-fields-head">
      <div>
        <span>FIELDS</span>
        <strong>{tableName || '查询结果'}</strong>
      </div>
      <div>
        <span>{displayOutputColumnNames.length} 个字段</span>
      </div>
    </div>
    <div className="gn-v2-data-grid-fields-table">
      <div className="gn-v2-data-grid-fields-row is-head">
        <span>#</span>
        <span>名称</span>
        <span>类型</span>
        <span>NN</span>
        <span>PK</span>
        <span>默认值</span>
        <span>注释</span>
      </div>
      {displayOutputColumnNames.map((columnName, index) => {
        const meta = columnMetaMap[columnName] || columnMetaMapByLowerName[columnName.toLowerCase()];
        const isPk = pkColumns.includes(columnName) || locatorColumns?.includes(columnName);
        return (
          <div className="gn-v2-data-grid-fields-row" key={columnName}>
            <span>{index + 1}</span>
            <span className="gn-v2-data-grid-field-name">{columnName}</span>
            <span className="gn-v2-data-grid-field-type">{meta?.type || '-'}</span>
            <span>-</span>
            <span>{isPk ? <em>PK</em> : '-'}</span>
            <span>-</span>
            <span>{meta?.comment || '-'}</span>
          </div>
        );
      })}
    </div>
  </div>
);

export interface DataGridV2ErViewProps {
  tableName?: string;
  displayOutputColumnNames: string[];
  columnMetaMap: Record<string, { type?: string; comment?: string }>;
  columnMetaMapByLowerName: Record<string, { type?: string; comment?: string }>;
}

export const DataGridV2ErView: React.FC<DataGridV2ErViewProps> = ({
  tableName,
  displayOutputColumnNames,
  columnMetaMap,
  columnMetaMapByLowerName,
}) => (
  <div className="gn-v2-data-grid-er-view">
    <div className="gn-v2-data-grid-er-node is-main">
      <span>TABLE</span>
      <strong>{tableName || '查询结果'}</strong>
      <small>{displayOutputColumnNames.length} fields</small>
    </div>
    <div className="gn-v2-data-grid-er-lines">
      <span />
      <span />
    </div>
    <div className="gn-v2-data-grid-er-side">
      {displayOutputColumnNames.slice(0, 6).map((columnName) => (
        <div className="gn-v2-data-grid-er-node" key={columnName}>
          <span>FIELD</span>
          <strong>{columnName}</strong>
          <small>{(columnMetaMap[columnName] || columnMetaMapByLowerName[columnName.toLowerCase()])?.type || '-'}</small>
        </div>
      ))}
    </div>
  </div>
);
