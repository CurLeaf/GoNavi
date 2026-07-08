import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./TableDesigner.tsx', import.meta.url), 'utf8');

describe('TableDesigner metadata loading', () => {
  it('renders columns before slower auxiliary metadata requests complete', () => {
    expect(source).toContain('const [columnsLoading, setColumnsLoading] = useState(false);');
    expect(source).toContain('const [ddlLoading, setDdlLoading] = useState(false);');
    expect(source).toContain('const loadColumns = DBGetColumns(rpcConfig, dbName, tableName)');
    expect(source).toContain('await loadColumns;');
    expect(source).toContain('await Promise.allSettled([loadIndexes, loadForeignKeys, loadTriggers, loadDdl]);');
    expect(source).toContain('loading={columnsLoading}');
    expect(source).toContain('loading={indexesLoading}');
    expect(source).toContain('loading={foreignKeysLoading}');
    expect(source).toContain('loading={triggersLoading}');
    expect(source).not.toContain('const results = await Promise.all(promises);');
  });
});
