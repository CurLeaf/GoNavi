import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const tableDesignerSource = readFileSync(
  new URL('./TableDesigner.tsx', import.meta.url),
  'utf8',
);

const getFunctionBlock = (source: string, name: string): string => {
  const start = source.indexOf(`const ${name} = () => {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = source.indexOf('\n  const ', start + 1);
  expect(nextFunction).toBeGreaterThan(start);
  return source.slice(start, nextFunction);
};

describe('TableDesigner trigger edit entry', () => {
  it('opens trigger edits in an object-edit query tab instead of the fixed modal', () => {
    const editBlock = getFunctionBlock(tableDesignerSource, 'handleEditTrigger');

    expect(editBlock).toContain('setActiveContext({ connectionId: tab.connectionId, dbName });');
    expect(editBlock).toContain('addTab({');
    expect(editBlock).toContain("type: 'query'");
    expect(editBlock).toContain("queryMode: 'object-edit'");
    expect(editBlock).toContain('buildEditableTriggerSql(selectedTrigger.name, createSql');
    expect(editBlock).toContain('dropSql: buildDropTriggerSql(selectedTrigger.name)');
    expect(editBlock).not.toContain('setIsTriggerEditModalOpen(true)');
  });

  it('keeps trigger creation on the existing modal path', () => {
    const createBlock = getFunctionBlock(tableDesignerSource, 'handleCreateTrigger');

    expect(createBlock).toContain("setTriggerEditMode('create')");
    expect(createBlock).toContain('setTriggerEditSql(generateTriggerTemplate())');
    expect(createBlock).toContain('setIsTriggerEditModalOpen(true)');
  });
});
