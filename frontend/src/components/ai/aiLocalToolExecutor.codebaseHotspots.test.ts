import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall, SavedConnection } from '../../types';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';

const buildToolCall = (name: string, args: Record<string, unknown>): AIToolCall => ({
  id: `call-${name}`,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

const buildConnection = (): SavedConnection => ({
  id: 'conn-1',
  name: '本地开发库',
  config: {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
  },
});

describe('aiLocalToolExecutor inspect_codebase_hotspots', () => {
  it('returns frontend large-file hotspots and refactor test targets without source content', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_codebase_hotspots', {
        keyword: 'QueryEditor',
        minLines: 1000,
        limit: 5,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe('inspect_codebase_hotspots');
    expect(result.content).toContain('"kind":"codebase_hotspots"');
    expect(result.content).toContain('frontend/src/components/QueryEditor.tsx');
    expect(result.content).toContain('"riskLevel":"critical"');
    expect(result.content).toContain('"readiness":"readyToExtract"');
    expect(result.content).toContain('"preferredNextSlice":"Editor toolbar"');
    expect(result.content).toContain('The toolbar JSX can pass state and callbacks through props');
    expect(result.content).toContain('Transaction status bar');
    expect(result.content).toContain('QueryEditor.result-panel.test.tsx');
    expect(result.content).toContain('QueryEditor.external-sql-save.test.tsx');
    expect(result.content).toContain('Open the SQL editor in a browser');
    expect(result.content).not.toContain('import React');
  });

  it('passes translator into codebase hotspot diagnostics', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_codebase_hotspots', {
        keyword: 'QueryEditor',
        minLines: 1000,
        limit: 1,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
      translate: (key) => ({
        'ai_chat.inspection.codebase_hotspots.query_editor.why': 'translated executor why',
        'ai_chat.inspection.codebase_hotspots.query_editor.preferred_next_slice': 'translated executor slice',
      })[key] || key,
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"why":"translated executor why"');
    expect(result.content).toContain('"preferredNextSlice":"translated executor slice"');
  });
});
