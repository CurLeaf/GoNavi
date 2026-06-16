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
    expect(result.content).toContain('"preferredNextSlice":"编辑器工具栏"');
    expect(result.content).toContain('工具栏 JSX 可通过 props 透传状态和回调');
    expect(result.content).toContain('事务状态条');
    expect(result.content).toContain('QueryEditor.result-panel.test.tsx');
    expect(result.content).toContain('QueryEditor.external-sql-save.test.tsx');
    expect(result.content).toContain('浏览器打开 SQL 编辑器');
    expect(result.content).not.toContain('import React');
  });
});
