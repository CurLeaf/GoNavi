import { describe, expect, it } from 'vitest';

import { formatDdlForDisplay } from './ddlFormat';

describe('formatDdlForDisplay', () => {
  it('formats DuckDB create table SQL into multiline output', () => {
    const raw = 'CREATE TABLE customers(customer_id BIGINT, customer_code VARCHAR, city VARCHAR, tier VARCHAR, signup_date DATE, lifetime_value DECIMAL(12,2), PRIMARY KEY(customer_id));';

    const formatted = formatDdlForDisplay(raw, 'duckdb');

    expect(formatted).toContain('CREATE TABLE customers (');
    expect(formatted).toContain('customer_id BIGINT,');
    expect(formatted).toContain('PRIMARY KEY (customer_id)');
    expect(formatted).toContain('\n');
  });

  it('returns original text when formatter cannot parse the statement', () => {
    const raw = 'not valid ddl(';

    expect(formatDdlForDisplay(raw, 'duckdb')).toBe(raw);
  });
});
