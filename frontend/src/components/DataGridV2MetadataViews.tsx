import React from 'react';
import { t as defaultTranslate, type I18nParams } from '../i18n';

type DataGridMetadataTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridV2FieldsViewProps {
  tableName?: string;
  displayOutputColumnNames: string[];
  pkColumns: string[];
  locatorColumns?: string[];
  columnMetaMap: Record<string, { type?: string; comment?: string }>;
  columnMetaMapByLowerName: Record<string, { type?: string; comment?: string }>;
  translate?: DataGridMetadataTranslate;
}

export const DataGridV2FieldsView: React.FC<DataGridV2FieldsViewProps> = ({
  tableName,
  displayOutputColumnNames,
  pkColumns,
  locatorColumns,
  columnMetaMap,
  columnMetaMapByLowerName,
  translate = defaultTranslate,
}) => (
  <div className="gn-v2-data-grid-fields-view">
    <div className="gn-v2-data-grid-fields-head">
      <div>
        <span>{translate('data_grid.metadata_view.fields_badge')}</span>
        <strong>{tableName || translate('data_grid.table_fallback.query_result')}</strong>
      </div>
      <div>
        <span>{translate('data_grid.metadata_view.field_count', { count: displayOutputColumnNames.length })}</span>
      </div>
    </div>
    <div className="gn-v2-data-grid-fields-table">
      <div className="gn-v2-data-grid-fields-row is-head">
        <span>#</span>
        <span>{translate('data_grid.metadata_view.column_name')}</span>
        <span>{translate('data_grid.metadata_view.column_type')}</span>
        <span>NN</span>
        <span>PK</span>
        <span>{translate('data_grid.metadata_view.default_value')}</span>
        <span>{translate('data_grid.metadata_view.comment')}</span>
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
  translate?: DataGridMetadataTranslate;
}

export const DataGridV2ErView: React.FC<DataGridV2ErViewProps> = ({
  tableName,
  displayOutputColumnNames,
  columnMetaMap,
  columnMetaMapByLowerName,
  translate = defaultTranslate,
}) => (
  <div className="gn-v2-data-grid-er-view">
    <div className="gn-v2-data-grid-er-node is-main">
      <span>{translate('data_grid.metadata_view.er_table_badge')}</span>
      <strong>{tableName || translate('data_grid.table_fallback.query_result')}</strong>
      <small>{translate('data_grid.metadata_view.field_count', { count: displayOutputColumnNames.length })}</small>
    </div>
    <div className="gn-v2-data-grid-er-lines">
      <span />
      <span />
    </div>
    <div className="gn-v2-data-grid-er-side">
      {displayOutputColumnNames.slice(0, 6).map((columnName) => (
        <div className="gn-v2-data-grid-er-node" key={columnName}>
          <span>{translate('data_grid.metadata_view.er_field_badge')}</span>
          <strong>{columnName}</strong>
          <small>{(columnMetaMap[columnName] || columnMetaMapByLowerName[columnName.toLowerCase()])?.type || '-'}</small>
        </div>
      ))}
    </div>
  </div>
);
