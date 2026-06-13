import { describe, expect, it } from 'vitest';

import { getDataSourceCapabilities } from './dataSourceCapabilities';

describe('dataSourceCapabilities', () => {
  it('treats Oracle table preview totals as manual exact count plus approximate metadata count', () => {
    expect(getDataSourceCapabilities({ type: 'oracle' })).toMatchObject({
      type: 'oracle',
      preferManualTotalCount: true,
      supportsApproximateTableCount: true,
      supportsApproximateTotalPages: false,
    });
  });

  it('keeps DuckDB manual count and approximate total support', () => {
    expect(getDataSourceCapabilities({ type: 'duckdb' })).toMatchObject({
      type: 'duckdb',
      preferManualTotalCount: true,
      supportsApproximateTableCount: true,
      supportsApproximateTotalPages: true,
    });
  });

  it('keeps MySQL on automatic total count mode', () => {
    expect(getDataSourceCapabilities({ type: 'mysql' })).toMatchObject({
      type: 'mysql',
      preferManualTotalCount: false,
      supportsApproximateTableCount: false,
      supportsApproximateTotalPages: false,
    });
  });

  it('keeps StarRocks as an independent SQL datasource capability', () => {
    expect(getDataSourceCapabilities({ type: 'starrocks' })).toMatchObject({
      type: 'starrocks',
      supportsQueryEditor: true,
      supportsSqlQueryExport: true,
      supportsCopyInsert: true,
      preferManualTotalCount: false,
    });
  });

  it('keeps InterSystems IRIS as an editable SQL datasource capability', () => {
    expect(getDataSourceCapabilities({ type: 'iris' })).toMatchObject({
      type: 'iris',
      supportsQueryEditor: true,
      supportsSqlQueryExport: true,
      supportsCopyInsert: true,
      forceReadOnlyQueryResult: false,
    });
    expect(getDataSourceCapabilities({ type: 'custom', driver: 'intersystemsiris' })).toMatchObject({
      type: 'iris',
      supportsQueryEditor: true,
    });
  });

  it('treats Elasticsearch as a queryable read-only datasource', () => {
    expect(getDataSourceCapabilities({ type: 'elasticsearch' })).toMatchObject({
      type: 'elasticsearch',
      supportsQueryEditor: true,
      supportsSqlQueryExport: false,
      supportsCopyInsert: false,
      supportsCreateDatabase: false,
      supportsRenameDatabase: false,
      supportsDropDatabase: false,
      forceReadOnlyQueryResult: false,
    });
    expect(getDataSourceCapabilities({ type: 'custom', driver: 'elastic' })).toMatchObject({
      type: 'elasticsearch',
      supportsQueryEditor: true,
      forceReadOnlyQueryResult: false,
    });
  });

  it('treats Chroma as a queryable vector datasource without SQL export actions', () => {
    expect(getDataSourceCapabilities({ type: 'chroma' })).toMatchObject({
      type: 'chroma',
      supportsQueryEditor: true,
      supportsSqlQueryExport: false,
      supportsCopyInsert: false,
      supportsCreateDatabase: false,
      supportsRenameDatabase: false,
      supportsDropDatabase: false,
      forceReadOnlyQueryResult: false,
    });
    expect(getDataSourceCapabilities({ type: 'custom', driver: 'chromadb' })).toMatchObject({
      type: 'chroma',
      supportsQueryEditor: true,
      supportsCopyInsert: false,
    });
  });

  it('treats Qdrant as a queryable vector datasource without SQL export actions', () => {
    expect(getDataSourceCapabilities({ type: 'qdrant' })).toMatchObject({
      type: 'qdrant',
      supportsQueryEditor: true,
      supportsSqlQueryExport: false,
      supportsCopyInsert: false,
      supportsCreateDatabase: false,
      supportsRenameDatabase: false,
      supportsDropDatabase: false,
      forceReadOnlyQueryResult: false,
    });
    expect(getDataSourceCapabilities({ type: 'custom', driver: 'qdrantdb' })).toMatchObject({
      type: 'qdrant',
      supportsQueryEditor: true,
      supportsCopyInsert: false,
    });
  });

  it('treats Apache IoTDB as a queryable timeseries datasource with IoTDB-specific writes', () => {
    expect(getDataSourceCapabilities({ type: 'iotdb' })).toMatchObject({
      type: 'iotdb',
      supportsQueryEditor: true,
      supportsSqlQueryExport: false,
      supportsCopyInsert: false,
      supportsCreateDatabase: false,
      supportsRenameDatabase: false,
      supportsDropDatabase: false,
      forceReadOnlyQueryResult: true,
    });
    expect(getDataSourceCapabilities({ type: 'custom', driver: 'apache-iotdb' })).toMatchObject({
      type: 'iotdb',
      supportsQueryEditor: true,
      supportsCopyInsert: false,
      forceReadOnlyQueryResult: true,
    });
  });

  it('treats OceanBase Oracle protocol as Oracle capabilities', () => {
    expect(getDataSourceCapabilities({
      type: 'oceanbase',
      oceanBaseProtocol: 'oracle',
    })).toMatchObject({
      type: 'oracle',
      preferManualTotalCount: true,
      supportsApproximateTableCount: true,
    });
  });

  it('treats custom OceanBase Oracle driver as Oracle capabilities', () => {
    expect(getDataSourceCapabilities({
      type: 'custom',
      driver: 'oceanbase',
      oceanBaseProtocol: 'oracle',
    })).toMatchObject({
      type: 'oracle',
      preferManualTotalCount: true,
      supportsApproximateTableCount: true,
    });
  });

  it('hides database-level DDL actions for Dameng and Oracle-like datasources', () => {
    expect(getDataSourceCapabilities({ type: 'dameng' })).toMatchObject({
      type: 'dameng',
      supportsCreateDatabase: false,
      supportsRenameDatabase: false,
      supportsDropDatabase: false,
    });
    expect(getDataSourceCapabilities({ type: 'oracle' })).toMatchObject({
      type: 'oracle',
      supportsCreateDatabase: false,
      supportsRenameDatabase: false,
      supportsDropDatabase: false,
    });
    expect(getDataSourceCapabilities({
      type: 'oceanbase',
      oceanBaseProtocol: 'oracle',
    })).toMatchObject({
      type: 'oracle',
      supportsCreateDatabase: false,
      supportsRenameDatabase: false,
      supportsDropDatabase: false,
    });
  });
});
