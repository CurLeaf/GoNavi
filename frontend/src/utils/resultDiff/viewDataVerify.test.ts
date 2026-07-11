import { describe, expect, it } from 'vitest';
import {
  assessViewBodyComplexity,
  buildCteSelectSql,
  buildDerivedTableSelectSql,
  buildDryRunSqlCandidates,
  buildViewSnapshotSelectSql,
  extractViewSelectBody,
  isViewEditSql,
  parseViewNameFromEditSql,
  parseViewNameFromEditTabTitle,
  resolveViewNameForVerify,
  resolveViewVerifyDialectFamily,
  stripTrailingOrderByForDerived,
} from './viewDataVerify';

describe('viewDataVerify', () => {
  it('detects view edit sql', () => {
    expect(isViewEditSql('CREATE OR REPLACE VIEW dbo.v1 AS SELECT 1')).toBe(true);
    expect(isViewEditSql('CREATE MATERIALIZED VIEW mv1 AS SELECT 1')).toBe(true);
    expect(isViewEditSql('SELECT * FROM t')).toBe(false);
  });

  it('parses view name from create view including schema', () => {
    expect(parseViewNameFromEditSql('CREATE VIEW dbo.v_jxpg AS SELECT 1')).toBe('dbo.v_jxpg');
    expect(parseViewNameFromEditSql('CREATE OR REPLACE VIEW `v_jxpg` AS SELECT 1')).toBe('`v_jxpg`');
    expect(parseViewNameFromEditSql('CREATE VIEW "Reporting"."ActiveUsers" AS SELECT 1')).toBe(
      '"Reporting"."ActiveUsers"',
    );
  });

  it('extracts select body after the view AS, not column alias AS', () => {
    const body = extractViewSelectBody(
      'CREATE OR REPLACE VIEW v1 AS\nSELECT a AS aa, b\nFROM t\nWHERE x = 1;',
    );
    expect(body).toMatch(/SELECT a AS aa/i);
    expect(body).toMatch(/FROM t/i);
    expect(body).not.toMatch(/CREATE/i);
  });

  it('extracts body with column list and strips WITH CHECK OPTION', () => {
    const body = extractViewSelectBody(
      'CREATE VIEW v1 (c1, c2) AS SELECT 1 AS c1, 2 AS c2 WITH CHECK OPTION',
    );
    expect(body).toMatch(/SELECT 1 AS c1/i);
    expect(body).not.toMatch(/CHECK OPTION/i);
  });

  it('builds snapshot select with optional where', () => {
    expect(buildViewSnapshotSelectSql('dbo.v1')).toBe('SELECT * FROM dbo.v1');
    expect(buildViewSnapshotSelectSql('dbo.v1', 'WHERE billid = 1')).toBe(
      'SELECT * FROM dbo.v1 WHERE billid = 1',
    );
  });

  it('dialect-aware derived table alias', () => {
    const mysql = buildDerivedTableSelectSql('SELECT 1 AS x', 'gn_new', 'mysql');
    expect(mysql).toContain(') AS gn_new');
    const oracle = buildDerivedTableSelectSql('SELECT 1 AS x FROM dual', 'gn_new', 'oracle');
    expect(oracle).toMatch(/\) gn_new/);
    expect(oracle).not.toMatch(/\) AS gn_new/);
  });

  it('strips outer ORDER BY for derived tables', () => {
    expect(stripTrailingOrderByForDerived('SELECT a FROM t ORDER BY a')).toBe('SELECT a FROM t');
    expect(stripTrailingOrderByForDerived('SELECT a FROM (SELECT b FROM u ORDER BY b) x')).toBe(
      'SELECT a FROM (SELECT b FROM u ORDER BY b) x',
    );
  });

  it('builds CTE wrapper', () => {
    const sql = buildCteSelectSql('SELECT 1 AS x', 'gn_view_new', 'x > 0');
    expect(sql).toMatch(/WITH gn_view_new AS/i);
    expect(sql).toMatch(/WHERE x > 0/);
  });

  it('orders dry-run candidates with live view first and multi strategies', () => {
    const candidates = buildDryRunSqlCandidates({
      selectBody: 'SELECT id, name FROM users',
      alias: 'gn_view_new',
      dbType: 'postgres',
      whereClause: 'id > 0',
      preferredLiveViewSql: 'SELECT * FROM v_users',
    });
    expect(candidates[0].label).toBe('live_view');
    expect(candidates.some((c) => c.strategy === 'derived')).toBe(true);
    expect(candidates.some((c) => c.strategy === 'cte')).toBe(true);
  });

  it('assesses complexity', () => {
    expect(assessViewBodyComplexity('SELECT 1').level).toBe('simple');
    expect(assessViewBodyComplexity('SELECT * FROM a UNION SELECT * FROM b').level).not.toBe(
      'simple',
    );
    expect(assessViewBodyComplexity('SELECT * FROM t FOR XML PATH').level).toBe('complex');
  });

  it('resolves dialect family', () => {
    expect(resolveViewVerifyDialectFamily('OceanBase')).toBe('mysql');
    expect(resolveViewVerifyDialectFamily('sqlserver')).toBe('sqlserver');
    expect(resolveViewVerifyDialectFamily('kingbase')).toBe('postgres');
  });

  it('resolves view name fallback chain', () => {
    expect(
      resolveViewNameForVerify({
        sql: 'SELECT 1',
        tabTitle: '编辑视图：title_view',
      }),
    ).toBe('title_view');
    expect(parseViewNameFromEditTabTitle('Edit View: dbo.v1')).toBe('dbo.v1');
  });
});
