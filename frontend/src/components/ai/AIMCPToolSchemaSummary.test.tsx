import { describe, expect, it } from 'vitest';

import type { AIMCPToolDescriptor } from '../../types';
import { buildMCPToolMinimalArgumentsExample } from './AIMCPToolSchemaSummary';

const buildTool = (inputSchema: AIMCPToolDescriptor['inputSchema']): AIMCPToolDescriptor => ({
  alias: 'execute_sql',
  serverId: 'gonavi',
  serverName: 'GoNavi',
  originalName: 'execute_sql',
  inputSchema,
});

describe('AIMCPToolSchemaSummary', () => {
  it('builds a minimal arguments example from required schema fields', () => {
    const example = buildMCPToolMinimalArgumentsExample(buildTool({
      type: 'object',
      required: ['connectionId', 'sql', 'allowMutating'],
      properties: {
        connectionId: { type: 'string' },
        dbName: { type: 'string' },
        sql: { type: 'string' },
        allowMutating: { type: 'boolean', default: true },
      },
    }));

    expect(example).toBe('{"connectionId":"<connectionId>","sql":"<sql>","allowMutating":true}');
  });

  it('uses enum, array, object, and number placeholders when defaults are absent', () => {
    const example = buildMCPToolMinimalArgumentsExample(buildTool({
      type: 'object',
      required: ['mode', 'limit', 'filters', 'tags'],
      properties: {
        mode: { enum: ['safe', 'force'] },
        limit: { type: 'number' },
        filters: { type: 'object', properties: { status: { type: 'string' } } },
        tags: { type: 'array', items: { type: 'string' } },
      },
    }));

    expect(example).toBe('{"mode":"safe","limit":0,"filters":{},"tags":[]}');
  });

  it('returns an empty object when no required parameters are declared', () => {
    const example = buildMCPToolMinimalArgumentsExample(buildTool({
      type: 'object',
      properties: {
        keyword: { type: 'string' },
      },
    }));

    expect(example).toBe('{}');
  });
});
